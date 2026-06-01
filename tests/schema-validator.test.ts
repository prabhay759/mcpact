import { describe, expect, it } from 'vitest';
import { checkSchemaCompatibility } from '../src/schema-validator.js';

const base = {
  type: 'object',
  properties: { city: { type: 'string' }, units: { type: 'string' } },
  required: ['city'],
};

describe('checkSchemaCompatibility()', () => {
  it('returns no violations when schemas are identical', () => {
    expect(checkSchemaCompatibility('my_tool', base, base)).toHaveLength(0);
  });

  it('returns no violations when provider adds optional fields', () => {
    const actual = {
      ...base,
      properties: { ...base.properties, locale: { type: 'string' } },
    };
    expect(checkSchemaCompatibility('my_tool', base, actual)).toHaveLength(0);
  });

  it('detects a required field removed from provider schema', () => {
    const actual = { type: 'object', properties: {}, required: [] };
    const violations = checkSchemaCompatibility('my_tool', base, actual);
    expect(violations.some((v) => v.type === 'schema_incompatible')).toBe(true);
    expect(violations.find((v) => v.type === 'schema_incompatible')?.message).toContain('"city"');
  });

  it('detects a new required field added by provider', () => {
    const actual = {
      ...base,
      properties: { ...base.properties, region: { type: 'string' } },
      required: ['city', 'region'],
    };
    const violations = checkSchemaCompatibility('my_tool', base, actual);
    expect(violations.some((v) => v.type === 'extra_required_field')).toBe(true);
    expect(violations.find((v) => v.type === 'extra_required_field')?.message).toContain('"region"');
  });

  it('detects a field type change', () => {
    const actual = {
      ...base,
      properties: { city: { type: 'number' }, units: { type: 'string' } },
    };
    const violations = checkSchemaCompatibility('my_tool', base, actual);
    expect(violations.some((v) => v.type === 'type_changed')).toBe(true);
    expect(violations.find((v) => v.type === 'type_changed')?.message).toContain('"city"');
  });

  it('identifies the correct tool name in all violation messages', () => {
    const actual = { type: 'object', properties: {}, required: [] };
    const violations = checkSchemaCompatibility('special_tool', base, actual);
    expect(violations.every((v) => v.tool === 'special_tool')).toBe(true);
  });
});
