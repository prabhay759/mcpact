import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { like } from '../matchers.js';
import { MCPACT_VERSION } from '../types.js';
import type { McpContract, Interaction, ContentExpectation } from '../types.js';

type RawContent = { type: string; text?: string; data?: string; mimeType?: string };
type RawResult = { content?: RawContent[]; isError?: boolean };

function snapshotResponse(result: unknown): Interaction['response'] {
  const r = result as RawResult;
  return {
    ...(r.isError ? { isError: true } : {}),
    ...(r.content
      ? {
          content: r.content.map((item): ContentExpectation => ({
            type: item.type,
            ...(item.text !== undefined ? { text: like(item.text) } : {}),
            ...(item.data !== undefined ? { data: like(item.data) } : {}),
            ...(item.mimeType ? { mimeType: item.mimeType } : {}),
          })),
        }
      : {}),
  };
}

/**
 * Wraps a live MCP client to record interactions with a real server.
 * Use this to bootstrap contract files from an existing server.
 */
export class McpRecorder {
  private readonly _consumer: string;
  private readonly _provider: string;
  private readonly _client: Client;
  private readonly _interactions: Interaction[] = [];

  constructor(consumer: string, provider: string, client: Client) {
    this._consumer = consumer;
    this._provider = provider;
    this._client = client;
  }

  /** Call a tool and record the interaction. Returns the raw server response. */
  async callTool(
    description: string,
    tool: string,
    args?: Record<string, unknown>
  ): Promise<unknown> {
    const result = await this._client.callTool({
      name: tool,
      arguments: args ?? {},
    });

    this._interactions.push({
      description,
      request: { tool, arguments: args },
      response: snapshotResponse(result),
    });

    return result;
  }

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

  /** Write the recorded contract to disk. */
  saveContract(filePath: string): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(this.toContract(), null, 2), 'utf-8');
    console.log(`[mcpact] Contract saved → ${filePath}`);
  }

  clearInteractions(): void {
    this._interactions.length = 0;
  }
}
