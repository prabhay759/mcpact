#!/usr/bin/env node
import { Command } from 'commander';
import { resolve } from 'node:path';
import { McpVerifier } from './provider/verifier.js';
import { printResults } from './reporter.js';

const program = new Command();

program
  .name('mcpact')
  .description('Consumer-driven contract testing for MCP servers')
  .version('1.0.0');

program
  .command('verify')
  .description('Verify an MCP server against consumer contracts')
  .requiredOption('-p, --provider <name>', 'Provider name (must match provider.name in contract files)')
  .requiredOption('-c, --contracts <dir>', 'Directory containing contract JSON files')
  .requiredOption('--command <cmd>', 'Command to start the MCP server process')
  .option('--args <list>', 'Comma-separated arguments for the server command')
  .option('--env <pairs>', 'Comma-separated KEY=VALUE environment variables for the server')
  .action(async (options: {
    provider: string;
    contracts: string;
    command: string;
    args?: string;
    env?: string;
  }) => {
    const args = options.args ? options.args.split(',') : [];

    const env: Record<string, string> = {};
    if (options.env) {
      for (const pair of options.env.split(',')) {
        const eq = pair.indexOf('=');
        if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1);
      }
    }

    const verifier = new McpVerifier({
      providerName: options.provider,
      contractsDir: resolve(options.contracts),
      providerCommand: options.command,
      providerArgs: args,
      providerEnv: env,
    });

    console.log(
      `\nVerifying "${options.provider}" against contracts in ${options.contracts}...\n`
    );

    try {
      const results = await verifier.verify();
      printResults(results);
      process.exit(results.every((r) => r.success) ? 0 : 1);
    } catch (err) {
      console.error('\nVerification error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
