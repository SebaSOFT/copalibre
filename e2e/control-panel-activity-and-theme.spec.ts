import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Control panel activity feed, roster role editor, and dark-theme form controls
 * (openspec 0196, tasks 5.1, 5.2, 5.3).
 */

const ORG_ALIAS = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TEAM_ENTRANT_ID = 'entrant-team-1';
const TEAM_ID = 'team-1';
const PERSON_1_ID = 'person-1';
const PERSON_2_ID = 'person-2';

interface MockAuditRecord {
  readonly auditId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly occurredAt: string;
  readonly outcome: 'applied' | 'refused';
  readonly reason?: string;
  readonly organizationId?: string;
}

interface MockTeamMember {
  readonly personId: string;
  readonly displayName: string;
  role: 'player' | 'substitute' | 'coach' | 'staff';
}

let mockTeamMembers: MockTeamMember[] = [
  { personId: PERSON_1_ID, displayName: 'Carlos Bianchi', role: 'player' },
  { personId: PERSON_2_ID, displayName: 'Lionel Scaloni', role: 'player' },
];

const mockAuditRecords: MockAuditRecord[] = [
  {
    auditId: 'audit-1',
    entityType: 'match',
    entityId: 'match-101',
    action: 'match.finalized',
    actor: 'user:referee-1',
    authorizationContext: 'copalibre.control',
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    outcome: 'applied',
    organizationId: 'org-1',
  },
  {
    auditId: 'audit-2',
    entityType: 'entrant',
    entityId: 'entrant-202',
    action: 'entrant.registered',
    actor: 'user:admin-1',
    authorizationContext: 'copalibre.control',
    occurredAt: new Date(Date.now() - 300_000).toISOString(),
    outcome: 'applied',
    reason: 'Inscripción confirmada',
    organizationId: 'org-1',
  },
  {
    auditId: 'audit-3',
    entityType: 'club',
    entityId: 'club-303',
    action: 'club.created',
    actor: 'user:admin-1',
    authorizationContext: 'copalibre.control',
    occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
    outcome: 'applied',
    organizationId: 'org-1',
  },
];

async function setupMockApi(page: Page): Promise<void> {
  mockTeamMembers = [
    { personId: PERSON_1_ID, displayName: 'Carlos Bianchi', role: 'player' },
    { personId: PERSON_2_ID, displayName: 'Lionel Scaloni', role: 'player' },
  ];

  await page.addInitScript(
    ({ tokenEndpoint, orgAlias, tournamentAlias, teamEntrantId, teamId }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        if (url === '/organizations?mine=true' && method === 'GET') {
          return Response.json([
            {
              organizationId: 'org-1',
              organizationAlias: orgAlias,
              organizationName: 'Liga Mendocina',
              role: 'admin',
            },
          ]);
        }

        if (url === `/organizations/${orgAlias}` && method === 'GET') {
          return Response.json({
            organizationId: 'org-1',
            alias: orgAlias,
            name: 'Liga Mendocina',
            primaryLanguage: 'es',
            timezone: 'America/Argentina/San_Juan',
          });
        }

        if (url === `/organizations/${orgAlias}/tournaments` && method === 'GET') {
          return Response.json([
            {
              tournamentId: 't-1',
              organizationId: 'org-1',
              alias: tournamentAlias,
              name: 'Torneo Apertura 2026',
              status: 'in_progress',
            },
          ]);
        }

        if (
          url === `/organizations/${orgAlias}/tournaments/${tournamentAlias}` &&
          method === 'GET'
        ) {
          return Response.json({
            tournamentId: 't-1',
            organizationId: 'org-1',
            alias: tournamentAlias,
            name: 'Torneo Apertura 2026',
            status: 'in_progress',
          });
        }

        if (url.includes(`/organizations/${orgAlias}/audit-trail`) && method === 'GET') {
          const loaded = await (
            window as unknown as { __getAuditTrail: () => Promise<unknown> }
          ).__getAuditTrail();
          return Response.json(loaded);
        }

        if (
          url.endsWith(`/tournaments/${tournamentAlias}/registrations`) ||
          url.includes(`/tournaments/${tournamentAlias}/registrations?`)
        ) {
          if (method === 'GET') {
            const members = await (
              window as unknown as { __getTeamMembers: () => Promise<unknown> }
            ).__getTeamMembers();
            return Response.json([
              {
                entrantId: teamEntrantId,
                tournamentId: 't-1',
                status: 'pending',
                teamId,
                displayName: 'Boca Juniors',
                abbreviation: 'BOC',
                teamMembers: members,
              },
            ]);
          }
        }

        if (
          url.includes(
            `/tournaments/${tournamentAlias}/registrations/${teamEntrantId}/team-memberships`,
          ) &&
          method === 'POST'
        ) {
          const body = JSON.parse(String(init?.body)) as {
            members?: { personId: string; role: 'player' | 'substitute' | 'coach' | 'staff' }[];
          };
          const updatedMembers = await (
            window as unknown as {
              __updateTeamMembers: (
                members: { personId: string; role: 'player' | 'substitute' | 'coach' | 'staff' }[],
              ) => Promise<unknown>;
            }
          ).__updateTeamMembers(body.members ?? []);
          return Response.json({
            entrantId: teamEntrantId,
            tournamentId: 't-1',
            status: 'pending',
            teamId,
            displayName: 'Boca Juniors',
            abbreviation: 'BOC',
            teamMembers: updatedMembers,
          });
        }

        if (url.endsWith(`/organizations/${orgAlias}/clubs`) && method === 'GET') {
          return Response.json([]);
        }

        if (url.endsWith(`/organizations/${orgAlias}/venues`) && method === 'GET') {
          return Response.json([]);
        }

        if (url.endsWith(`/organizations/${orgAlias}/officials`) && method === 'GET') {
          return Response.json([]);
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      tokenEndpoint: TOKEN_ENDPOINT,
      orgAlias: ORG_ALIAS,
      tournamentAlias: TOURNAMENT_ALIAS,
      teamEntrantId: TEAM_ENTRANT_ID,
      teamId: TEAM_ID,
    },
  );

  await page.exposeFunction('__getAuditTrail', () => ({
    records: mockAuditRecords,
    total: mockAuditRecords.length,
    limit: 10,
    offset: 0,
  }));

  await page.exposeFunction('__getTeamMembers', () => mockTeamMembers);

  await page.exposeFunction(
    '__updateTeamMembers',
    (members: { personId: string; role: 'player' | 'substitute' | 'coach' | 'staff' }[]) => {
      for (const update of members) {
        const found = mockTeamMembers.find((m) => m.personId === update.personId);
        if (found) {
          found.role = update.role;
        }
      }
      return mockTeamMembers;
    },
  );
}

test.describe('Control Panel Activity Feed and Theme Polish (openspec 0196)', () => {
  test('5.1: populated dashboard renders "Actividad reciente" event cards with relative timestamps', async ({
    page,
  }) => {
    await setupMockApi(page);
    const target = `/control/${ORG_ALIAS}`;
    await seedLoginTransaction(page, target);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${target}`);

    // Verify "Actividad reciente" section is rendered
    await expect(page.getByText('Actividad reciente')).toBeVisible();

    // Verify localized action headings are displayed
    await expect(page.getByText('Partido finalizado')).toBeVisible();
    await expect(page.getByText('Inscripción registrada')).toBeVisible();
    await expect(page.getByText('Club creado')).toBeVisible();

    // Verify actor tag and reason appear
    await expect(page.getByText('user:referee-1')).toBeVisible();
    await expect(page.getByText('Inscripción confirmada')).toBeVisible();

    // Verify empty placeholder is NOT visible
    await expect(page.getByText('No hay actividad reciente registrada.')).toBeHidden();
  });

  test('5.2: team roster role editor changes member role to Coach and renders persisted badge', async ({
    page,
  }) => {
    await setupMockApi(page);
    const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/registrations`;
    await seedLoginTransaction(page, target);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${target}`);

    // Expand the team entrant accordion
    const summary = page.locator('summary', { hasText: 'Boca Juniors' });
    await expect(summary).toBeVisible();
    await summary.click();

    // Check initial members are displayed with Jugador badges
    await expect(page.getByText('Carlos Bianchi')).toBeVisible();
    await expect(page.getByText('Lionel Scaloni')).toBeVisible();

    // Open Edit Members dialog
    const editMembersBtn = page.getByRole('button', { name: 'Editar miembros' });
    await expect(editMembersBtn).toBeVisible();
    await editMembersBtn.click();

    // Modal dialog is shown
    const dialog = page.getByRole('dialog', { name: 'Editar miembros del equipo' });
    await expect(dialog).toBeVisible();

    // Change Carlos Bianchi role to coach
    const selectRole = dialog.getByLabel('Rol de Carlos Bianchi');
    await expect(selectRole).toBeVisible();
    await selectRole.selectOption('coach');

    // Save changes
    const saveBtn = dialog.getByRole('button', { name: 'Guardar miembros' });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Dialog closes
    await expect(dialog).toBeHidden();

    // Member now has Coach badge persisted in the roster list
    const carlosRow = page.locator('li', { hasText: 'Carlos Bianchi' });
    await expect(carlosRow).toBeVisible();
    await expect(carlosRow.getByText('Coach')).toBeVisible();
  });

  test('5.3: form controls on Clubs and Venues views do not render white browser defaults', async ({
    page,
  }) => {
    await setupMockApi(page);

    // 1. Check Clubs view form controls
    const clubsTarget = `/control/${ORG_ALIAS}/clubs`;
    await seedLoginTransaction(page, clubsTarget);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${clubsTarget}`);

    const clubNameInput = page.getByLabel('Nombre del club nuevo');
    await expect(clubNameInput).toBeVisible();

    const clubInputStyles = await clubNameInput.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        colorScheme: computed.colorScheme,
        backgroundColor: computed.backgroundColor,
      };
    });

    expect(clubInputStyles.colorScheme).toBe('dark');
    // Must not be browser default white
    expect(clubInputStyles.backgroundColor).not.toContain('255, 255, 255');

    // 2. Check Venues/Resources view form controls (including number input)
    const venuesTarget = `/control/${ORG_ALIAS}/resources`;
    await page.goto(venuesTarget);
    await page.waitForURL(`**${venuesTarget}`);

    const venueCapacityInput = page.getByLabel('Capacidad simultánea');
    await expect(venueCapacityInput).toBeVisible();

    const venueCapacityStyles = await venueCapacityInput.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        colorScheme: computed.colorScheme,
        backgroundColor: computed.backgroundColor,
      };
    });

    expect(venueCapacityStyles.colorScheme).toBe('dark');
    expect(venueCapacityStyles.backgroundColor).not.toContain('255, 255, 255');
  });
});
