/**
 * Provider verification test for weather-server.
 *
 * Reads the pact files written by the consumer test and replays every
 * declared interaction against the real weather-server process.  Run the
 * consumer test first so the pact file exists:
 *
 *   vitest run examples/weather-server/consumer.test.ts
 *   vitest run examples/weather-server/provider.test.ts
 *
 * Or run both via:
 *
 *   npm run test:examples
 */
import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpVerifier, printResults } from '../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACTS_DIR  = join(__dirname, 'pacts');
const SERVER_BIN = join(__dirname, 'server.ts');

describe('weather-server provider verification', () => {
  it('satisfies all consumer contracts', async () => {
    const verifier = new McpVerifier({
      providerName: 'weather-server',
      contractsDir: PACTS_DIR,
      providerCommand: 'tsx',
      providerArgs: [SERVER_BIN],
    });

    const results = await verifier.verify();
    printResults(results);

    for (const result of results) {
      expect(
        result.schemaViolations,
        `Schema violations for ${result.consumer}: ${result.schemaViolations.map((v) => v.message).join(', ')}`
      ).toHaveLength(0);

      for (const interaction of result.interactions) {
        expect(
          interaction.success,
          `"${interaction.description}" failed: ${interaction.error ?? ''}`
        ).toBe(true);
      }
    }
  });
});
