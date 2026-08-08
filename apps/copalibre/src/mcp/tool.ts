export interface McpJsonSchema {
  readonly type: 'object';
  readonly properties?: Record<string, unknown>;
  readonly required?: readonly string[];
}

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: McpJsonSchema;
  readonly handler: (args: Record<string, unknown>) => Promise<string>;
}
