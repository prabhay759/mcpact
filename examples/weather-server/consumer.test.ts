/**
 * Consumer contract test for the weather-agent → weather-server interaction.
 *
 * This test:
 * 1. Declares the interactions weather-agent needs from weather-server
 * 2. Spins up an in-memory mock backed by those declarations
 * 3. Exercises the agent's actual code against the mock
 * 4. Writes a pact file that weather-server must satisfy
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mcpact, include, term } from '../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACTS_DIR = join(__dirname, 'pacts');

// ---------- agent code under test ----------

type WeatherResult = { summary: string; hasTemperature: boolean };

async function getWeather(client: Client, city: string): Promise<WeatherResult> {
  const result = await client.callTool({
    name: 'get_current_weather',
    arguments: { city, units: 'celsius' },
  }) as { content: Array<{ type: string; text?: string }>; isError?: boolean };

  if (result.isError) throw new Error(`Server error for ${city}`);

  const summary = result.content.map((c) => c.text ?? '').join('');
  return { summary, hasTemperature: summary.includes('temperature') };
}

// -------------------------------------------

describe('weather-agent → weather-server (consumer)', () => {
  const pact = new Mcpact({
    consumer: 'weather-agent',
    provider: 'weather-server',
    contractsDir: PACTS_DIR,
  });

  let client: Client;

  beforeAll(async () => {
    pact
      .given('weather data available for London')
      .interaction('get current weather in London (celsius)')
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

    pact
      .given('weather data available for Paris')
      .interaction('get current weather in Paris (celsius)')
      .callsTool('get_current_weather', { city: 'Paris', units: 'celsius' })
      .willRespondWith({
        content: [
          {
            type: 'text',
            text: include('temperature'),
          },
        ],
      });

    pact
      .given('weather data available for London')
      .interaction('get 3-day forecast for London')
      .callsTool('get_forecast', { city: 'London', days: 3 })
      .willRespondWith({
        content: [
          {
            type: 'text',
            text: term(
              '3-day forecast for London',
              '3-day forecast for London:\nDay 1: partly cloudy, 17°C\nDay 2: partly cloudy, 19°C\nDay 3: partly cloudy, 18°C'
            ),
          },
        ],
      });

    client = await pact.buildMockClient();
  });

  afterAll(() => {
    pact.writePact();
  });

  it('retrieves London weather and reports temperature', async () => {
    const result = await getWeather(client, 'London');
    expect(result.hasTemperature).toBe(true);
    expect(result.summary).toMatch(/temperature \d+°C/);
  });

  it('retrieves Paris weather', async () => {
    const result = await getWeather(client, 'Paris');
    expect(result.summary).toContain('temperature');
  });

  it('retrieves a 3-day forecast for London', async () => {
    const raw = await client.callTool({
      name: 'get_forecast',
      arguments: { city: 'London', days: 3 },
    }) as { content: Array<{ type: string; text?: string }> };

    const text = raw.content[0]?.text ?? '';
    expect(text).toMatch(/3-day forecast for London/);
  });
});
