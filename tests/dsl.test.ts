import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mcpact } from '../src/consumer/dsl.js';
import { include, like, term } from '../src/matchers.js';
import type { McpContract } from '../src/types.js';

const tmp = () => join(tmpdir(), `mcpact-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

describe('Mcpact DSL', () => {
  describe('toContract()', () => {
    it('captures consumer / provider names', () => {
      const pact = new Mcpact({ consumer: 'agent-a', provider: 'server-b', contractsDir: tmpdir() });
      const contract = pact.toContract();
      expect(contract.consumer.name).toBe('agent-a');
      expect(contract.provider.name).toBe('server-b');
    });

    it('records a basic interaction', () => {
      const pact = new Mcpact({ consumer: 'c', provider: 'p', contractsDir: tmpdir() });
      pact
        .interaction('fetch item')
        .callsTool('get_item', { id: '42' })
        .willRespondWith({ content: [{ type: 'text', text: like('result') }] });

      const { interactions } = pact.toContract();
      expect(interactions).toHaveLength(1);
      expect(interactions[0].description).toBe('fetch item');
      expect(interactions[0].request.tool).toBe('get_item');
      expect(interactions[0].request.arguments).toEqual({ id: '42' });
    });

    it('records providerState when given() is used', () => {
      const pact = new Mcpact({ consumer: 'c', provider: 'p', contractsDir: tmpdir() });
      pact
        .given('item exists')
        .interaction('get item')
        .callsTool('get_item', { id: '1' })
        .willRespondWith({ content: [] });

      const { interactions } = pact.toContract();
      expect(interactions[0].providerState).toBe('item exists');
    });

    it('allows multiple interactions', () => {
      const pact = new Mcpact({ consumer: 'c', provider: 'p', contractsDir: tmpdir() });
      pact.interaction('a').callsTool('tool_a').willRespondWith({ content: [] });
      pact.interaction('b').callsTool('tool_b').willRespondWith({ content: [] });
      expect(pact.toContract().interactions).toHaveLength(2);
    });

    it('reset() clears interactions', () => {
      const pact = new Mcpact({ consumer: 'c', provider: 'p', contractsDir: tmpdir() });
      pact.interaction('x').callsTool('t').willRespondWith({ content: [] });
      pact.reset();
      expect(pact.toContract().interactions).toHaveLength(0);
    });
  });

  describe('writePact()', () => {
    it('creates the directory and writes valid JSON', () => {
      const dir = tmp();
      const pact = new Mcpact({ consumer: 'writer', provider: 'srv', contractsDir: dir });
      pact.interaction('call').callsTool('do_thing').willRespondWith({ content: [] });

      pact.writePact();

      const filepath = join(dir, 'writer-srv.json');
      expect(existsSync(filepath)).toBe(true);

      const contract = JSON.parse(readFileSync(filepath, 'utf-8')) as McpContract;
      expect(contract.consumer.name).toBe('writer');
      expect(contract.provider.name).toBe('srv');
      expect(contract.interactions).toHaveLength(1);
      expect(contract.metadata.mcpactVersion).toBe('1.0.0');

      rmSync(dir, { recursive: true });
    });
  });

  describe('buildMockClient()', () => {
    it('responds to a declared tool call', async () => {
      const pact = new Mcpact({ consumer: 'c', provider: 'p', contractsDir: tmpdir() });
      pact
        .interaction('fetch data')
        .callsTool('fetch_data', { id: '7' })
        .willRespondWith({
          content: [{ type: 'text', text: like('some result') }],
        });

      const client = await pact.buildMockClient();
      const result = await client.callTool({
        name: 'fetch_data',
        arguments: { id: '7' },
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content[0].text).toBe('some result');
      await client.close();
    });

    it('resolves term() matchers to their sample value', async () => {
      const pact = new Mcpact({ consumer: 'c', provider: 'p', contractsDir: tmpdir() });
      pact
        .interaction('get weather')
        .callsTool('get_weather', { city: 'London' })
        .willRespondWith({
          content: [{ type: 'text', text: term('temperature \\d+°C', 'temperature 18°C') }],
        });

      const client = await pact.buildMockClient();
      const result = await client.callTool({
        name: 'get_weather',
        arguments: { city: 'London' },
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content[0].text).toBe('temperature 18°C');
      await client.close();
    });

    it('matches tool calls without declared arguments as wildcard', async () => {
      const pact = new Mcpact({ consumer: 'c', provider: 'p', contractsDir: tmpdir() });
      pact
        .interaction('ping')
        .callsTool('ping') // no args declared
        .willRespondWith({ content: [{ type: 'text', text: like('pong') }] });

      const client = await pact.buildMockClient();
      const r1 = await client.callTool({ name: 'ping', arguments: { x: 1 } }) as { content: Array<{ text: string }> };
      const r2 = await client.callTool({ name: 'ping', arguments: {} }) as { content: Array<{ text: string }> };

      expect(r1.content[0].text).toBe('pong');
      expect(r2.content[0].text).toBe('pong');
      await client.close();
    });

    it('throws for undeclared tool calls', async () => {
      const pact = new Mcpact({ consumer: 'c', provider: 'p', contractsDir: tmpdir() });
      pact
        .interaction('known call')
        .callsTool('known_tool', { key: 'val' })
        .willRespondWith({ content: [] });

      const client = await pact.buildMockClient();
      await expect(
        client.callTool({ name: 'unknown_tool', arguments: {} })
      ).rejects.toThrow();
      await client.close();
    });

    it('lists tools exposed through declared interactions', async () => {
      const pact = new Mcpact({ consumer: 'c', provider: 'p', contractsDir: tmpdir() });
      pact.interaction('a').callsTool('tool_alpha').willRespondWith({ content: [] });
      pact.interaction('b').callsTool('tool_beta').willRespondWith({ content: [] });
      pact.interaction('c').callsTool('tool_alpha').willRespondWith({ content: [] }); // duplicate

      const client = await pact.buildMockClient();
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(['tool_alpha', 'tool_beta']);
      await client.close();
    });
  });
});
