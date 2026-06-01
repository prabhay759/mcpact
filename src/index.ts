// Consumer
export { Mcpact, GivenBuilder, InteractionBuilder, ResponseBuilder, McpRecorder } from './consumer/index.js';
export type { McpactOptions } from './consumer/index.js';

// Provider
export { McpVerifier } from './provider/index.js';
export type { VerifierOptions, StateHandler } from './provider/index.js';

// Matchers
export {
  like,
  eachLike,
  term,
  regex,
  include,
  integer,
  decimal,
  boolean,
  string,
  nullValue,
  isMatcher,
  getSample,
  matchValue,
  matchResponse,
} from './matchers.js';

// Types
export type {
  McpContract,
  Party,
  Interaction,
  ToolRequest,
  ResponseExpectation,
  ContentExpectation,
  McpactMatcher,
  MatcherType,
  ContractMetadata,
  VerificationResult,
  InteractionResult,
  SchemaViolation,
} from './types.js';
export { MCPACT_VERSION } from './types.js';

// Utilities
export { printResults } from './reporter.js';
export { checkSchemaCompatibility } from './schema-validator.js';
