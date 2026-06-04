import type { SchemaViolation } from './types.js';

type JsonSchemaLike = {
  type?: string | string[];
  properties?: Record<string, { type?: string | string[] }>;
  required?: string[];
};

/**
 * Check whether `actualSchema` is backward-compatible with `contractSchema`.
 * Reports violations that would break a consumer relying on `contractSchema`.
 */
export function checkSchemaCompatibility(
  toolName: string,
  contractSchema: JsonSchemaLike,
  actualSchema: JsonSchemaLike
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];

  const contractRequired = contractSchema.required ?? [];
  const actualRequired = actualSchema.required ?? [];
  const actualProps = actualSchema.properties ?? {};

  // Every field the consumer declared as required must still be present
  for (const field of contractRequired) {
    if (!actualProps[field]) {
      violations.push({
        tool: toolName,
        type: 'schema_incompatible',
        message: `Required field "${field}" (declared by consumer) is missing from provider schema`,
      });
    }
  }

  // Provider must not add new required fields — that breaks existing consumers
  for (const field of actualRequired) {
    if (!contractRequired.includes(field)) {
      violations.push({
        tool: toolName,
        type: 'extra_required_field',
        message: `Provider added new required field "${field}" which would break existing consumers`,
      });
    }
  }

  // Property types must not change
  const contractProps = contractSchema.properties ?? {};
  for (const [field, contractProp] of Object.entries(contractProps)) {
    const actualProp = actualProps[field];
    if (!actualProp || !contractProp.type || !actualProp.type) continue;

    const normalize = (t: string | string[]) =>
      (Array.isArray(t) ? t.slice().sort() : [t]).join('|');

    if (normalize(contractProp.type) !== normalize(actualProp.type)) {
      violations.push({
        tool: toolName,
        type: 'type_changed',
        message: `Field "${field}" type changed from "${normalize(contractProp.type)}" to "${normalize(actualProp.type)}"`,
      });
    }
  }

  return violations;
}
