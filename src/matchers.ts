import type { McpactMatcher, ResponseExpectation } from './types.js';

export function like(value: unknown): McpactMatcher {
  return { 'mcpact:matcher': 'type', value, sample: value };
}

export function eachLike(value: unknown, min = 1): McpactMatcher {
  return { 'mcpact:matcher': 'each-like', value, min, sample: [value] };
}

export function term(pattern: string, sample: string): McpactMatcher {
  return { 'mcpact:matcher': 'regex', pattern, value: sample, sample };
}

export { term as regex };

export function include(substr: string): McpactMatcher {
  return { 'mcpact:matcher': 'include', value: substr, sample: substr };
}

export function integer(value?: number): McpactMatcher {
  return { 'mcpact:matcher': 'integer', value: value ?? 1, sample: value ?? 1 };
}

export function decimal(value?: number): McpactMatcher {
  return { 'mcpact:matcher': 'decimal', value: value ?? 1.0, sample: value ?? 1.0 };
}

export function boolean(value?: boolean): McpactMatcher {
  return { 'mcpact:matcher': 'boolean', value: value ?? true, sample: value ?? true };
}

export function string(value = ''): McpactMatcher {
  return { 'mcpact:matcher': 'type', value, sample: value };
}

export function nullValue(): McpactMatcher {
  return { 'mcpact:matcher': 'null', value: null, sample: null };
}

export function isMatcher(value: unknown): value is McpactMatcher {
  return (
    typeof value === 'object' &&
    value !== null &&
    'mcpact:matcher' in value
  );
}

/** Recursively extract concrete sample values from a matcher tree. */
export function getSample(value: unknown): unknown {
  if (isMatcher(value)) {
    if (value['mcpact:matcher'] === 'each-like') {
      const min = value.min ?? 1;
      return Array.from({ length: min }, () => getSample(value.value));
    }
    return value.sample ?? value.value;
  }
  if (Array.isArray(value)) {
    return value.map(getSample);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, getSample(v)])
    );
  }
  return value;
}

export interface MatchResult {
  match: boolean;
  error?: string;
}

export function matchValue(actual: unknown, expected: unknown): MatchResult {
  if (isMatcher(expected)) {
    return matchWithMatcher(actual, expected);
  }
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    return { match: true };
  }
  return {
    match: false,
    error: `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
  };
}

function matchWithMatcher(actual: unknown, matcher: McpactMatcher): MatchResult {
  switch (matcher['mcpact:matcher']) {
    case 'type': {
      const expectedType = typeof matcher.value;
      const actualType = typeof actual;
      if (actualType !== expectedType) {
        return { match: false, error: `Expected type "${expectedType}" but got "${actualType}"` };
      }
      return { match: true };
    }

    case 'regex': {
      if (typeof actual !== 'string') {
        return { match: false, error: `Expected string for regex match but got ${typeof actual}` };
      }
      const re = new RegExp(matcher.pattern!);
      if (!re.test(actual)) {
        return { match: false, error: `"${actual}" did not match /${matcher.pattern}/` };
      }
      return { match: true };
    }

    case 'include': {
      if (typeof actual !== 'string') {
        return { match: false, error: `Expected string for include check but got ${typeof actual}` };
      }
      const substr = matcher.value as string;
      if (!actual.includes(substr)) {
        return { match: false, error: `"${actual}" does not include "${substr}"` };
      }
      return { match: true };
    }

    case 'integer': {
      if (typeof actual !== 'number' || !Number.isInteger(actual)) {
        return { match: false, error: `Expected integer but got ${JSON.stringify(actual)}` };
      }
      return { match: true };
    }

    case 'decimal': {
      if (typeof actual !== 'number') {
        return { match: false, error: `Expected number but got ${typeof actual}` };
      }
      return { match: true };
    }

    case 'boolean': {
      if (typeof actual !== 'boolean') {
        return { match: false, error: `Expected boolean but got ${typeof actual}` };
      }
      return { match: true };
    }

    case 'null': {
      if (actual !== null) {
        return { match: false, error: `Expected null but got ${JSON.stringify(actual)}` };
      }
      return { match: true };
    }

    case 'each-like': {
      if (!Array.isArray(actual)) {
        return { match: false, error: `Expected array but got ${typeof actual}` };
      }
      const min = matcher.min ?? 1;
      if (actual.length < min) {
        return { match: false, error: `Expected at least ${min} item(s) but got ${actual.length}` };
      }
      // The template is treated as a type-matcher unless it is already a matcher itself
      const itemMatcher = isMatcher(matcher.value) ? matcher.value : like(matcher.value);
      for (let i = 0; i < actual.length; i++) {
        const r = matchValue(actual[i], itemMatcher);
        if (!r.match) {
          return { match: false, error: `Array[${i}]: ${r.error}` };
        }
      }
      return { match: true };
    }

    default: {
      const exhaustive: never = matcher['mcpact:matcher'] as never;
      return { match: false, error: `Unknown matcher type: ${String(exhaustive)}` };
    }
  }
}

export interface ResponseMatchResult {
  match: boolean;
  errors: string[];
}

export function matchResponse(
  actual: {
    content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    isError?: boolean;
  },
  expected: ResponseExpectation
): ResponseMatchResult {
  const errors: string[] = [];

  if (expected.isError !== undefined) {
    const r = matchValue(actual.isError ?? false, expected.isError);
    if (!r.match) errors.push(`isError: ${r.error}`);
  }

  if (expected.content !== undefined) {
    if (!actual.content) {
      errors.push('Expected content array but response had none');
    } else if (expected.content.length > actual.content.length) {
      errors.push(
        `Expected at least ${expected.content.length} content item(s) but got ${actual.content.length}`
      );
    } else {
      for (let i = 0; i < expected.content.length; i++) {
        const exp = expected.content[i] as Record<string, unknown>;
        const act = actual.content[i] as Record<string, unknown>;
        for (const [key, expVal] of Object.entries(exp)) {
          const r = matchValue(act[key], expVal);
          if (!r.match) errors.push(`content[${i}].${key}: ${r.error}`);
        }
      }
    }
  }

  return { match: errors.length === 0, errors };
}
