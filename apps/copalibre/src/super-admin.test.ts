import { jest } from '@jest/globals';
import { describeGrant } from './super-admin.js';
import { runCli } from './cli.js';
import { COMMAND_HELP } from './help-text.js';

describe('grant-first-super-admin', () => {
  it('is listed in the command help, with the flag it needs', () => {
    const entry = COMMAND_HELP.find((command) => command.name === 'grant-first-super-admin');
    expect(entry?.usage).toBe('copalibre grant-first-super-admin --email <email>');
    expect(entry?.flags?.map((flag) => flag.flag)).toEqual(['--email <email>']);
  });

  it('says when the grant takes effect, and that an open session keeps what it had', () => {
    expect(describeGrant({ email: 'admin@example.test', assignmentId: 'a-1' })).toBe(
      'Granted super-admin to admin@example.test. It takes effect the next time they sign in; ' +
        'a session that is already open keeps the access it had.\n',
    );
  });

  it('asks for the email when it is missing, before it touches a database', async () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(
        runCli(['grant-first-super-admin'], {}, { run: jest.fn(async () => 0) }),
      ).resolves.toBe(1);
      expect(stderr).toHaveBeenCalledWith(
        'copalibre grant-first-super-admin failed: --email is required\n',
      );
    } finally {
      stderr.mockRestore();
    }
  });
});
