import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { type DisciplineDescriptor, validateDisciplineDescriptorDocument } from '@copalibre/domain';
import { TournamentRepository, withTransaction, type Database } from '@copalibre/persistence';
import { buildTestApp } from './test-support/integration-harness.js';

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTIONS_DIRECTORY = join(
  SOURCE_DIRECTORY,
  '../../../web/src/authoring-docs/transcriptions',
);

/**
 * The authoring guide's two worked transcriptions (openspec 0163) are
 * proven against the real installation path here, not merely against the
 * schema validator in isolation — the same "propose → validate → revise"
 * loop the guide describes ends with "install", and a schema change that
 * invalidates a documented example must fail the build, not mislead an
 * agent reading the guide.
 */
describe('worked transcriptions install through the real path', () => {
  let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
  let organizationId: string;

  beforeAll(async () => {
    ({ scratch, organizationId } = await buildTestApp([]));
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it.each([
    { name: 'basketball', descriptorId: '01890000-0000-7000-8000-0000000ba511' },
    { name: 'track-sprint', descriptorId: '01890000-0000-7000-8000-0000000c5501' },
  ])('$name.descriptor.json validates and installs', async ({ name, descriptorId }) => {
    const raw = JSON.parse(
      readFileSync(join(TRANSCRIPTIONS_DIRECTORY, `${name}.descriptor.json`), 'utf8'),
    ) as unknown;

    const validated = validateDisciplineDescriptorDocument(raw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const descriptor: DisciplineDescriptor = { ...validated.value, descriptorId };
    const tournaments = new TournamentRepository(scratch.db);
    const saved = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    expect(saved.descriptorId).toBe(descriptorId);

    const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.create(uow, {
        organizationId,
        alias: `transcription-${name}`,
        name: `Transcription ${name}`,
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    expect(created.tournamentId).toBeTruthy();
  });
});
