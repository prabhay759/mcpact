import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { matchResponse } from '../matchers.js';
import { checkSchemaCompatibility } from '../schema-validator.js';
import type {
  McpContract,
  Interaction,
  InteractionResult,
  SchemaViolation,
  VerificationResult,
} from '../types.js';

export type StateHandler = () => Promise<void> | void;

export interface VerifierOptions {
  /** Name of the provider being verified — must match `provider.name` in contract files. */
  providerName: string;
  /** Directory containing `*.json` contract files. */
  contractsDir: string;
  /** Executable to launch the MCP server (e.g. `"node"`, `"tsx"`). */
  providerCommand: string;
  providerArgs?: string[];
  /** Extra environment variables for the server process. */
  providerEnv?: Record<string, string>;
  /**
   * Map of provider-state label → setup function.
   * Called before each interaction that declares a `providerState`.
   */
  stateHandlers?: Record<string, StateHandler>;
}

type RawTool = {
  name: string;
  inputSchema?: Record<string, unknown>;
};

export class McpVerifier {
  constructor(private readonly options: VerifierOptions) {}

  async verify(): Promise<VerificationResult[]> {
    const contracts = this.loadContracts();

    if (contracts.length === 0) {
      process.stderr.write(
        `[mcpact] No contracts found for provider "${this.options.providerName}" in ${this.options.contractsDir}\n`
      );
      return [];
    }

    const results: VerificationResult[] = [];
    for (const contract of contracts) {
      results.push(await this.verifyContract(contract));
    }
    return results;
  }

  private loadContracts(): McpContract[] {
    const { contractsDir, providerName } = this.options;
    if (!existsSync(contractsDir)) return [];

    return readdirSync(contractsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(contractsDir, f), 'utf-8')) as McpContract)
      .filter((c) => c.provider?.name === providerName);
  }

  private async spawnClient(): Promise<Client> {
    const { providerCommand, providerArgs = [], providerEnv = {} } = this.options;

    const transport = new StdioClientTransport({
      command: providerCommand,
      args: providerArgs,
      env: { ...(process.env as Record<string, string>), ...providerEnv },
    });

    const client = new Client({ name: 'mcpact-verifier', version: '1.0.0' });
    await client.connect(transport);
    return client;
  }

  private async verifyContract(contract: McpContract): Promise<VerificationResult> {
    const client = await this.spawnClient();

    try {
      const { tools: actualTools } = await client.listTools();
      const toolMap = new Map(actualTools.map((t) => [t.name, t as RawTool]));

      const schemaViolations = this.checkSchemas(contract, toolMap);
      const interactionResults: InteractionResult[] = [];

      for (const interaction of contract.interactions) {
        await this.runStateHandler(interaction.providerState);
        interactionResults.push(await this.verifyInteraction(client, interaction));
      }

      return {
        success:
          schemaViolations.length === 0 && interactionResults.every((r) => r.success),
        consumer: contract.consumer.name,
        provider: contract.provider.name,
        interactions: interactionResults,
        schemaViolations,
      };
    } finally {
      await client.close();
    }
  }

  private checkSchemas(
    contract: McpContract,
    toolMap: Map<string, RawTool>
  ): SchemaViolation[] {
    const violations: SchemaViolation[] = [];
    const referencedTools = new Set(contract.interactions.map((i) => i.request.tool));

    for (const toolName of referencedTools) {
      const actual = toolMap.get(toolName);
      if (!actual) {
        violations.push({
          tool: toolName,
          type: 'missing_tool',
          message: `Tool "${toolName}" (required by consumer "${contract.consumer.name}") is not exposed by "${contract.provider.name}"`,
        });
        continue;
      }

      // If the contract captured the tool's input schema, check compatibility
      const contractTool = (contract as McpContract & { tools?: Record<string, { inputSchema?: Record<string, unknown> }> }).tools?.[toolName];
      if (contractTool?.inputSchema && actual.inputSchema) {
        violations.push(
          ...checkSchemaCompatibility(
            toolName,
            contractTool.inputSchema as Parameters<typeof checkSchemaCompatibility>[1],
            actual.inputSchema as Parameters<typeof checkSchemaCompatibility>[2]
          )
        );
      }
    }

    return violations;
  }

  private async verifyInteraction(
    client: Client,
    interaction: Interaction
  ): Promise<InteractionResult> {
    try {
      const result = await client.callTool({
        name: interaction.request.tool,
        arguments: interaction.request.arguments ?? {},
      });

      const actual = result as {
        content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
        isError?: boolean;
      };

      const { match, errors } = matchResponse(actual, interaction.response);

      if (match) {
        return {
          description: interaction.description,
          success: true,
          request: interaction.request,
          actualResponse: result,
        };
      }

      return {
        description: interaction.description,
        success: false,
        error: errors.join('\n  '),
        request: interaction.request,
        actualResponse: result,
      };
    } catch (err) {
      return {
        description: interaction.description,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        request: interaction.request,
      };
    }
  }

  private async runStateHandler(providerState?: string): Promise<void> {
    if (!providerState || !this.options.stateHandlers) return;
    const handler = this.options.stateHandlers[providerState];
    if (handler) await handler();
  }
}
