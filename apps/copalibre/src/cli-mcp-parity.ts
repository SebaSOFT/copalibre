export interface ParityEntry {
  readonly cliCommand?: string;
  readonly mcpTool?: string;
  readonly exemptReason?: string;
}

/**
 * Pairs every real CLI command with its MCP tool, or an explicit, reviewable
 * exemption — the same technique `cli-docs-parity.test.ts` uses one level up
 * (reading the real command/tool lists, not a duplicated list), so a future
 * CLI-only or MCP-only addition fails `cli-mcp-parity.test.ts` instead of
 * silently reopening the asymmetry `0252`-`0254` closed.
 *
 * Exactly one of `mcpTool`/`exemptReason` accompanies a given `cliCommand`
 * (and symmetrically for an `mcpTool`-only entry) — enforced by
 * `cli-mcp-parity.test.ts`, not just this file's own shape.
 */
export const CLI_MCP_PARITY: readonly ParityEntry[] = [
  // Paired: the CLI command and the MCP tool call the same underlying logic.
  { cliCommand: 'doctor', mcpTool: 'copalibre_doctor' },
  { cliCommand: 'backup', mcpTool: 'copalibre_backup' },
  { cliCommand: 'upgrade-check', mcpTool: 'copalibre_upgrade_check' },
  { cliCommand: 'statistics-rebuild', mcpTool: 'copalibre_statistics_rebuild' },
  { cliCommand: 'organization', mcpTool: 'copalibre_get_organization' },
  { cliCommand: 'module add', mcpTool: 'copalibre_module_add' },
  { cliCommand: 'module list', mcpTool: 'copalibre_module_list' },
  { cliCommand: 'module remove', mcpTool: 'copalibre_module_remove' },
  { cliCommand: 'module verify', mcpTool: 'copalibre_module_verify' },
  { cliCommand: 'module scaffold', mcpTool: 'copalibre_module_scaffold' },
  { cliCommand: 'module validate-local', mcpTool: 'copalibre_module_validate_local' },
  { cliCommand: 'module submit', mcpTool: 'copalibre_module_submit' },
  { cliCommand: 'tournament list', mcpTool: 'copalibre_list_tournaments' },
  { cliCommand: 'tournament get', mcpTool: 'copalibre_get_tournament' },
  { cliCommand: 'tournament create', mcpTool: 'copalibre_create_tournament' },
  { cliCommand: 'tournament publish', mcpTool: 'copalibre_publish_tournament' },

  // CLI-only, structural: a long-running process, the MCP server itself, or
  // (init) an installation-bootstrap step — none expressible as a single
  // request/response tool call.
  {
    cliCommand: 'init',
    exemptReason:
      "Generates an installation's own secrets (JWT signing material, initial admin bootstrap) — the same class of risk as create-admin/login, per 0253's Why.",
  },
  {
    cliCommand: 'dev',
    exemptReason: 'A long-running development process, not a request/response tool call.',
  },
  {
    cliCommand: 'start',
    exemptReason:
      'A long-running process (starts every process role), not a request/response tool call.',
  },
  {
    cliCommand: 'mcp',
    exemptReason: 'Starts the MCP server itself — a tool cannot start its own server.',
  },

  // CLI-only, security: mints/bootstraps/revokes credentials, or is an
  // irreversible data/schema mutation (excluded per 0253's own Why).
  {
    cliCommand: 'migrate',
    exemptReason:
      'An irreversible schema mutation; copalibre_doctor already covers its decision-support half (pending migrations, listed without applying them).',
  },
  {
    cliCommand: 'restore',
    exemptReason: 'An irreversible data mutation that overwrites the current database.',
  },
  {
    cliCommand: 'create-admin',
    exemptReason: "Bootstraps a credential (an organization's first administrator account).",
  },
  {
    cliCommand: 'login',
    exemptReason: 'Mints/stores a personal access token.',
  },
  {
    cliCommand: 'revoke-legacy-personal-access-tokens',
    exemptReason: 'Revokes credentials as a security cutover.',
  },

  // MCP-only, agent-specific authoring ergonomics, not a human capability
  // gap: a human author already has the schema as a source file in
  // packages/domain and validates a whole module package directly via
  // `module validate-local` — there is no standalone-fragment-validation
  // step in that workflow the way there is in an agent's iterative
  // authoring loop.
  {
    mcpTool: 'copalibre_descriptor_schema',
    exemptReason:
      'Agent-specific authoring ergonomics — a human author reads the schema from packages/domain directly.',
  },
  {
    mcpTool: 'copalibre_descriptor_validate',
    exemptReason:
      'Agent-specific authoring ergonomics — a human author validates the whole package via `module validate-local`, not a standalone fragment.',
  },
  {
    mcpTool: 'copalibre_profile_schema',
    exemptReason:
      'Agent-specific authoring ergonomics — a human author reads the schema from packages/domain directly.',
  },
  {
    mcpTool: 'copalibre_profile_validate',
    exemptReason:
      'Agent-specific authoring ergonomics — a human author validates the whole package via `module validate-local`, not a standalone fragment.',
  },
];
