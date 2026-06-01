import type { VerificationResult } from './types.js';

export function printResults(results: VerificationResult[]): void {
  if (results.length === 0) {
    console.log('No contracts found to verify.');
    return;
  }

  for (const result of results) {
    const badge = result.success ? '✓ PASSED' : '✗ FAILED';
    console.log(`\n${badge}  ${result.consumer} → ${result.provider}`);

    if (result.schemaViolations.length > 0) {
      console.log('  Schema violations:');
      for (const v of result.schemaViolations) {
        console.log(`    ✗ [${v.type}] ${v.message}`);
      }
    }

    for (const interaction of result.interactions) {
      const icon = interaction.success ? '  ✓' : '  ✗';
      console.log(`${icon} ${interaction.description}`);
      if (!interaction.success && interaction.error) {
        const indented = interaction.error.replace(/\n/g, '\n        ');
        console.log(`      → ${indented}`);
      }
    }
  }

  console.log();
  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log(`All ${results.length} contract(s) verified successfully.`);
  } else {
    const failed = results.filter((r) => !r.success).length;
    console.error(`${failed}/${results.length} contract(s) FAILED.`);
  }
}
