# mcpact

Consumer-driven contract testing for MCP (Model Context Protocol) servers.

Inspired by Pact for REST/gRPC, mcpact lets agents record the contracts they expect from MCP servers and verifies those contracts are still honored on every deploy. When a server silently renames a tool, changes a schema, or breaks a response shape, the contract test catches it before the agent does.

---

## How it works

```
Consumer (agent)                          Provider (MCP server)
─────────────────                         ─────────────────────
1. Declare interactions                   3. Load pact files written
   using the DSL                             by consumer tests

2. Test agent code against                4. Replay interactions against
   in-memory mock server      ──pacts──▶     the real server process
   → write pact JSON                      5. Verify responses match
                                             declared expectations
```

---

## Quick start

### Consumer side

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Mcpact, include, term } from 'mcpact';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const pact = new Mcpact({
  consumer: 'weather-agent',
  provider: 'weather-server',
  contractsDir: './pacts',
});

describe('weather-agent → weather-server contract', () => {
  let client: Client;

  beforeAll(async () => {
    pact
      .given('weather data available for London')
      .interaction('get current weather in London')
      .callsTool('get_current_weather', { city: 'London', units: 'celsius' })
      .willRespondWith({
        content: [
          {
            type: 'text',
            text: term(
              'temperature \\d+°C',
              'Current weather in London: partly cloudy, temperature 18°C, humidity 72%'
            ),
          },
        ],
      });

    client = await pact.buildMockClient();
  });

  afterAll(() => {
    pact.writePact(); // writes pacts/weather-agent-weather-server.json
  });

  it('fetches weather and reports temperature', async () => {
    const result = await client.callTool({
      name: 'get_current_weather',
      arguments: { city: 'London', units: 'celsius' },
    }) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toMatch(/temperature \d+°C/);
  });
});
```

### Provider side

```typescript
import { describe, expect, it } from 'vitest';
import { McpVerifier, printResults } from 'mcpact';

describe('weather-server provider verification', () => {
  it('satisfies all consumer contracts', async () => {
    const verifier = new McpVerifier({
      providerName: 'weather-server',
      contractsDir: './pacts',
      providerCommand: 'node',
      providerArgs: ['dist/server.js'],
      stateHandlers: {
        'weather data available for London': async () => {
          // seed test fixtures
        },
      },
    });

    const results = await verifier.verify();
    printResults(results);

    for (const result of results) {
      expect(result.schemaViolations).toHaveLength(0);
      for (const interaction of result.interactions) {
        expect(interaction.success, interaction.error).toBe(true);
      }
    }
  });
});
```

### CLI

```bash
npx mcpact verify \
  --provider weather-server \
  --contracts ./pacts \
  --command node \
  --args dist/server.js
```

---

## Matchers

Matchers let contracts survive natural response variation (timestamps, IDs, phrasing) while still catching breaking changes.

| Matcher | What it checks |
|---------|----------------|
| `like(value)` | Same type as `value` |
| `include(substr)` | String contains `substr` |
| `term(regex, sample)` | String matches `regex`; `sample` is returned by the mock |
| `eachLike(item, min?)` | Array where every element is the same type as `item` |
| `integer(n?)` | Value is an integer |
| `decimal(n?)` | Value is any number |
| `boolean(b?)` | Value is a boolean |
| `nullValue()` | Value is `null` |

---

## Contract format

Pact files are plain JSON stored in your repo (e.g. `pacts/`) and committed alongside the consumer. Share them with the provider team via git or a contract broker.

```json
{
  "consumer": { "name": "weather-agent" },
  "provider": { "name": "weather-server" },
  "interactions": [
    {
      "description": "get current weather in London",
      "providerState": "weather data available for London",
      "request": {
        "tool": "get_current_weather",
        "arguments": { "city": "London", "units": "celsius" }
      },
      "response": {
        "content": [
          {
            "type": "text",
            "text": {
              "mcpact:matcher": "regex",
              "pattern": "temperature \\d+°C",
              "sample": "Current weather in London: partly cloudy, temperature 18°C, humidity 72%",
              "value": "Current weather in London: partly cloudy, temperature 18°C, humidity 72%"
            }
          }
        ]
      }
    }
  ],
  "metadata": { "mcpactVersion": "1.0.0", "createdAt": "..." }
}
```

---

## Recording contracts from a live server

Already have a running server? Use `McpRecorder` to bootstrap contracts from real interactions instead of writing them by hand:

```typescript
import { McpRecorder } from 'mcpact';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'node', args: ['server.js'] });
const rawClient = new Client({ name: 'recorder', version: '1.0.0' });
await rawClient.connect(transport);

const recorder = new McpRecorder('my-agent', 'my-server', rawClient);

await recorder.callTool('get weather',  'get_current_weather', { city: 'London' });
await recorder.callTool('get forecast', 'get_forecast',         { city: 'London', days: 3 });

recorder.saveContract('./pacts/my-agent-my-server.json');
await rawClient.close();
```

The recorded contract uses `like()` matchers so response values can vary while the shape is pinned.

---

## Schema verification

The verifier also checks whether the server still exposes every tool the consumer references. If a tool is renamed or removed, you get a schema violation before any interaction is replayed:

```
✗ FAILED  weather-agent → weather-server
  Schema violations:
    ✗ [missing_tool] Tool "get_current_weather" (required by consumer "weather-agent") is not exposed by "weather-server"
```

---

## Running the examples

```bash
# 1. Consumer test — generates pacts/weather-agent-weather-server.json
npx vitest run examples/weather-server/consumer.test.ts

# 2. Provider verification — replays interactions against the real server
npx vitest run examples/weather-server/provider.test.ts

# Or run both in sequence:
npm run test:examples
```

---

## Installation

```bash
npm install mcpact
```

Requires `@modelcontextprotocol/sdk` as a peer dependency (already a dependency of most MCP projects).