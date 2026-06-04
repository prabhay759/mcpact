export const MCPACT_VERSION = '1.0.0';

export interface McpContract {
  consumer: Party;
  provider: Party;
  interactions: Interaction[];
  metadata: ContractMetadata;
}

export interface Party {
  name: string;
}

export interface Interaction {
  description: string;
  providerState?: string;
  request: ToolRequest;
  response: ResponseExpectation;
}

export interface ToolRequest {
  tool: string;
  arguments?: Record<string, unknown>;
}

export interface ResponseExpectation {
  content?: ContentExpectation[];
  isError?: boolean;
}

export interface ContentExpectation {
  type?: string | McpactMatcher;
  text?: string | McpactMatcher;
  data?: string | McpactMatcher;
  mimeType?: string | McpactMatcher;
}

export interface McpactMatcher {
  'mcpact:matcher': MatcherType;
  value?: unknown;
  pattern?: string;
  sample?: unknown;
  min?: number;
}

export type MatcherType =
  | 'type'
  | 'regex'
  | 'include'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'null'
  | 'each-like';

export interface ContractMetadata {
  mcpactVersion: string;
  createdAt: string;
}

export interface VerificationResult {
  success: boolean;
  consumer: string;
  provider: string;
  interactions: InteractionResult[];
  schemaViolations: SchemaViolation[];
}

export interface InteractionResult {
  description: string;
  success: boolean;
  error?: string;
  request: ToolRequest;
  actualResponse?: unknown;
}

export interface SchemaViolation {
  tool: string;
  type: 'missing_tool' | 'schema_incompatible' | 'extra_required_field' | 'type_changed';
  message: string;
}
