import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getSample } from '../matchers.js';
import { MCPACT_VERSION } from '../types.js';
import type {
  McpContract,
  Interaction,
  ToolRequest,
  ResponseExpectation,
} from '../types.js';

export interface McpactOptions {
  consumer: string;
  provider: string;
  contractsDir: string;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, (b as unknown[])[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object).sort();
    const bKeys = Object.keys(b as object).sort();
    if (aKeys.join(',') !== bKeys.join(',')) return false;
    return aKeys.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      )
    );
  }
  return false;
}

export class Mcpact {
  private readonly _consumer: string;
  private readonly _provider: string;
  private readonly _contractsDir: string;
  private readonly _interactions: Interaction[] = [];

  constructor(options: McpactOptions) {
    this._consumer = options.consumer;
    this._provider = options.provider;
    this._contractsDir = options.contractsDir;
  }

  /** Start an interaction declaration (with an optional provider state). */
  given(providerState: string): GivenBuilder {
    return new GivenBuilder(providerState, this);
  }

  /** Start an interaction declaration without a provider state. */
  interaction(description: string): InteractionBuilder {
    return new InteractionBuilder(description, undefined, this);
  }

  /** @internal */
  _addInteraction(interaction: Interaction): void {
    this._interactions.push(interaction);
  }

  /**
   * Build an in-memory mock MCP client pre-wired with all declared interactions.
   * The mock server returns sample values extracted from your matchers.
   */
  async buildMockClient(): Promise<Client> {
    const interactions = [...this._interactions];

    const server = new Server(
      { name: 'mcpact-mock', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const seen = new Set<string>();
      const tools = [];
      for (const i of interactions) {
        if (!seen.has(i.request.tool)) {
          seen.add(i.request.tool);
          tools.push({
            name: i.request.tool,
            description: 'Mocked by mcpact',
            inputSchema: { type: 'object' as const, properties: {} },
          });
        }
      }
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments ?? {};

      // Prefer exact argument match, fall back to wildcard (no args declared)
      const exactMatch = interactions.find(
        (i) =>
          i.request.tool === toolName &&
          i.request.arguments !== undefined &&
          deepEqual(i.request.arguments, args)
      );
      const wildcardMatch = interactions.find(
        (i) => i.request.tool === toolName && i.request.arguments === undefined
      );
      const interaction = exactMatch ?? wildcardMatch;

      if (!interaction) {
        const registered = interactions
          .filter((i) => i.request.tool === toolName)
          .map((i) => JSON.stringify(i.request.arguments))
          .join(', ');
        throw new Error(
          `[mcpact] Unexpected call to tool "${toolName}" with args ${JSON.stringify(args)}.` +
            (registered ? ` Registered argument sets: ${registered}` : ' No interactions registered for this tool.')
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return getSample(interaction.response) as any;
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: this._consumer, version: '1.0.0' });
    await client.connect(clientTransport);

    return client;
  }

  /** Return the contract object without writing it. */
  toContract(): McpContract {
    return {
      consumer: { name: this._consumer },
      provider: { name: this._provider },
      interactions: [...this._interactions],
      metadata: {
        mcpactVersion: MCPACT_VERSION,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Write the contract to `<contractsDir>/<consumer>-<provider>.json`.
   * Call this in `afterAll` once all interactions have been exercised.
   */
  writePact(): void {
    if (!existsSync(this._contractsDir)) {
      mkdirSync(this._contractsDir, { recursive: true });
    }
    const filename = `${this._consumer}-${this._provider}.json`;
    const filepath = join(this._contractsDir, filename);
    writeFileSync(filepath, JSON.stringify(this.toContract(), null, 2), 'utf-8');
    console.log(`[mcpact] Pact written → ${filepath}`);
  }

  /** Clear all declared interactions (useful between test suites). */
  reset(): void {
    this._interactions.length = 0;
  }
}

export class GivenBuilder {
  constructor(
    private readonly _state: string,
    private readonly _pact: Mcpact
  ) {}

  interaction(description: string): InteractionBuilder {
    return new InteractionBuilder(description, this._state, this._pact);
  }
}

export class InteractionBuilder {
  constructor(
    private readonly _description: string,
    private readonly _state: string | undefined,
    private readonly _pact: Mcpact
  ) {}

  callsTool(tool: string, args?: Record<string, unknown>): ResponseBuilder {
    const request: ToolRequest = { tool, arguments: args };
    return new ResponseBuilder(this._description, this._state, request, this._pact);
  }
}

export class ResponseBuilder {
  constructor(
    private readonly _description: string,
    private readonly _state: string | undefined,
    private readonly _request: ToolRequest,
    private readonly _pact: Mcpact
  ) {}

  willRespondWith(response: ResponseExpectation): Mcpact {
    this._pact._addInteraction({
      description: this._description,
      ...(this._state !== undefined ? { providerState: this._state } : {}),
      request: this._request,
      response,
    });
    return this._pact;
  }
}
