import { Command, Option } from 'clipanion';
import type { CliContext } from '../cli-context.js';
import { runCommand } from '../command-support.js';
import { createOrganizationAdminInvitationFromEnv } from '../organization-admin.js';

export class OrganizationAddAdminCommand extends Command<CliContext> {
  static override paths = [['organization', 'add-admin']];

  organization = Option.String('--organization', { required: true });
  email = Option.String('--email', { required: true });

  async execute(): Promise<number> {
    return runCommand('organization add-admin', async () => {
      const invitation = await createOrganizationAdminInvitationFromEnv(
        this.organization,
        this.email,
        this.context.env,
      );
      process.stdout.write(
        `Administrator invitation created for ${this.email}. Setup link (shown once): ${invitation.setupUrl}\n`,
      );
      return 0;
    });
  }
}
