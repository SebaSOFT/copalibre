import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { startMcpServer } from '../mcp/server.js';

/**
 * Runs until stdin closes, the same way an MCP client's spawned server
 * process is expected to. Protocol messages go over stdout/stdin only —
 * stderr (the banner, and any logging) never mixes with them.
 */
export class McpCommand extends Command<CliContext> {
  static override paths = [['mcp']];

  args = Option.Proxy();

  async execute(): Promise<number> {
    return runCommand('mcp', async () => {
      await startMcpServer(this.context.env);
      return 0;
    });
  }
}
