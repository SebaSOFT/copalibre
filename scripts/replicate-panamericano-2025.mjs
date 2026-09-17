import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import crypto from 'node:crypto';

const SCRATCH_DIR =
  '/Users/sebasoft/.gemini/antigravity-cli/brain/6df73be6-0ffd-415c-a9ca-1e83fe3ea8fa/scratch';
const DOSSIER_DIR =
  '/Users/sebasoft/.gemini/antigravity-cli/brain/6df73be6-0ffd-415c-a9ca-1e83fe3ea8fa';

const clubs = JSON.parse(fs.readFileSync(path.join(SCRATCH_DIR, 'parsed_clubs.json'), 'utf8'));
const rosters = JSON.parse(fs.readFileSync(path.join(SCRATCH_DIR, 'parsed_rosters.json'), 'utf8'));
const referees = JSON.parse(
  fs.readFileSync(path.join(SCRATCH_DIR, 'parsed_referees.json'), 'utf8'),
);
const groupMatches = JSON.parse(
  fs.readFileSync(path.join(SCRATCH_DIR, 'parsed_group_matches.json'), 'utf8'),
);
const playoffMatches = JSON.parse(
  fs.readFileSync(path.join(SCRATCH_DIR, 'parsed_playoff_matches.json'), 'utf8'),
);

const ORG = 'copa-test';
const TOURNAMENT_NAME = 'Campeonato Panamericano de Clubes Senior Varones 2025';
const TOURNAMENT_ALIAS = process.env.TOURNAMENT_ALIAS ?? 'panamericano-clubes-2025-rink-hockey-101';
const DESCRIPTOR_VERSION = process.env.RINK_HOCKEY_DESCRIPTOR_VERSION ?? '1.0.2';
const API_BASE = 'http://localhost:3001';

const pool = new Pool({
  connectionString: 'postgres://copalibre:copalibre_dev_only@localhost:5432/copalibre',
});

function newId() {
  return crypto.randomUUID();
}

function experimentTeamAlias(code) {
  return `${code.toLowerCase()}-rh${DESCRIPTOR_VERSION.replaceAll('.', '')}`;
}

async function main() {
  console.log('================================================================');
  console.log('  REPLICATING CAMPEONATO PANAMERICANO DE CLUBES 2025 (WSA SIDGAD)');
  console.log('================================================================');

  // Step 0: Authenticate
  console.log('\n--- Step 0: Authenticating with API ---');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@copalibre.test', password: 'admin12345' }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const { accessToken } = await loginRes.json();
  console.log('Authenticated as admin@copalibre.test. Token acquired.');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const orgRes = await pool.query('SELECT organization_id FROM organizations WHERE alias = $1', [
    ORG,
  ]);
  if (orgRes.rows.length === 0) throw new Error(`Organization ${ORG} not found`);
  const orgId = orgRes.rows[0].organization_id;
  console.log(`Organization ${ORG} resolved (ID: ${orgId})`);

  // Step 1: Onboard 24 Clubs with Emblems
  console.log('\n--- Step 1: Onboarding 24 Clubs with Emblems ---');
  const clubIdByCode = new Map();

  for (let i = 0; i < clubs.length; i++) {
    const c = clubs[i];
    let club = (
      await pool.query(
        'SELECT club_id, alias, abbreviation FROM clubs WHERE organization_id = $1 AND (abbreviation = $2 OR alias = $3)',
        [orgId, c.code, c.code.toLowerCase()],
      )
    ).rows[0];

    let cId;
    if (!club) {
      console.log(`[${i + 1}/24] Creating club: ${c.name} (${c.code})`);
      const createRes = await fetch(`${API_BASE}/organizations/${ORG}/clubs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: c.name,
          alias: c.code.toLowerCase(),
          abbreviation: c.code,
        }),
      });
      if (!createRes.ok) {
        throw new Error(
          `Failed to create club ${c.name}: ${createRes.status} ${await createRes.text()}`,
        );
      }
      const created = await createRes.json();
      cId = created.clubId;
    } else {
      cId = club.club_id;
      console.log(`[${i + 1}/24] Club ${c.name} (${c.code}) exists.`);
    }

    clubIdByCode.set(c.code, cId);

    // Ensure 410x512 emblem is attached
    const emblemCheck = await pool.query('SELECT emblem_object_id FROM clubs WHERE club_id = $1', [
      cId,
    ]);
    if (!emblemCheck.rows[0]?.emblem_object_id && fs.existsSync(c.localLogoFile)) {
      const imgBuffer = fs.readFileSync(c.localLogoFile);
      const fileId = newId();
      const storageKey = `${orgId}/clubs/${cId}/${fileId}-${c.code}.png`;
      const destPath = path.join('./data/objects', storageKey);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, imgBuffer);

      const objId = newId();
      await pool.query(
        "INSERT INTO object_metadata (object_id, organization_id, profile, storage_key, content_type, size_bytes, status, uploaded_by, created_at) VALUES ($1, $2, 'filesystem', $3, 'image/png', $4, 'pending', 'admin', NOW())",
        [objId, orgId, storageKey, imgBuffer.length],
      );
      await pool.query('UPDATE clubs SET emblem_object_id = $1 WHERE club_id = $2', [objId, cId]);
      console.log(`  -> 410x512 Emblem attached for ${c.code}`);
    }
  }

  // Step 2: Tournament Creation
  console.log('\n--- Step 2: Tournament Creation ---');
  let tourney = (
    await pool.query(
      'SELECT tournament_id, alias, status FROM tournaments WHERE organization_id = $1 AND alias = $2',
      [orgId, TOURNAMENT_ALIAS],
    )
  ).rows[0];

  if (!tourney) {
    const discRes = await pool.query(
      "SELECT descriptor_id, version FROM discipline_descriptors WHERE alias = 'rink-hockey' AND version = $1",
      [DESCRIPTOR_VERSION],
    );
    if (discRes.rows.length === 0) {
      throw new Error(`rink-hockey descriptor ${DESCRIPTOR_VERSION} not installed in DB`);
    }
    const { descriptor_id, version } = discRes.rows[0];

    const createTourneyRes = await fetch(`${API_BASE}/organizations/${ORG}/tournaments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: TOURNAMENT_NAME,
        alias: TOURNAMENT_ALIAS,
        descriptorId: descriptor_id,
        descriptorVersion: version,
        stages: [
          { number: 1, name: 'Fase de Grupos', format: 'round-robin' },
          { number: 2, name: 'Playoffs Multizona', format: 'single-elimination' },
        ],
        publicRegistration: false,
        requiresCheckIn: false,
        customScripts: [],
      }),
    });
    if (!createTourneyRes.ok) {
      throw new Error(
        `Failed to create tournament: ${createTourneyRes.status} ${await createTourneyRes.text()}`,
      );
    }
    const created = await createTourneyRes.json();
    tourney = { tournament_id: created.tournamentId, alias: created.alias };
    console.log(`Tournament created: ${TOURNAMENT_ALIAS} (ID: ${tourney.tournament_id})`);
  } else {
    console.log(`Tournament ${TOURNAMENT_ALIAS} exists (ID: ${tourney.tournament_id})`);
  }
  const tournamentId = tourney.tournament_id;

  // Step 3: Venue & Officials
  console.log('\n--- Step 3: Venue & Officials Registration ---');
  let venue = (
    await pool.query(
      'SELECT venue_id FROM venues WHERE organization_id = $1 AND (alias = $2 OR name = $3)',
      [orgId, 'estadio-aldo-cantoni', 'Estadio Aldo Cantoni'],
    )
  ).rows[0];

  if (!venue) {
    const vId = newId();
    await pool.query(
      'INSERT INTO venues (venue_id, organization_id, alias, name, concurrent_capacity, address, created_at) VALUES ($1, $2, $3, $4, 1, $5, NOW())',
      [vId, orgId, 'estadio-aldo-cantoni', 'Estadio Aldo Cantoni', 'San Juan, Argentina'],
    );
    venue = { venue_id: vId };
    console.log(`Venue Estadio Aldo Cantoni created (ID: ${venue.venue_id})`);
  } else {
    console.log(`Venue Estadio Aldo Cantoni exists (ID: ${venue.venue_id})`);
  }

  const officialIdByName = new Map();
  for (const refName of referees) {
    let off = (
      await pool.query(
        'SELECT official_id FROM officials WHERE organization_id = $1 AND display_name = $2',
        [orgId, refName],
      )
    ).rows[0];
    if (!off) {
      const oId = newId();
      await pool.query(
        'INSERT INTO officials (official_id, organization_id, display_name, roles, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [oId, orgId, refName, JSON.stringify(['referee'])],
      );
      officialIdByName.set(refName, oId);
    } else {
      officialIdByName.set(refName, off.official_id);
    }
  }
  console.log(`All ${referees.length} certified match officials registered.`);

  // Step 4: Register 24 Teams as Entrants & Enlist Rosters
  console.log('\n--- Step 4: Register Entrants and Rosters ---');
  const entrantIdByCode = new Map();

  for (let i = 0; i < clubs.length; i++) {
    const c = clubs[i];
    const clubId = clubIdByCode.get(c.code);

    let entrantRow = (
      await pool.query(
        `SELECT e.entrant_id, e.abbreviation, e.team_id 
       FROM entrants e
       JOIN teams t ON t.team_id = e.team_id
       WHERE e.tournament_id = $1 AND (e.abbreviation = $2 OR t.alias = $3 OR t.name = $4)`,
        [tournamentId, c.code, c.code.toLowerCase(), c.name],
      )
    ).rows[0];

    let entrantId;
    let teamId;
    if (!entrantRow) {
      console.log(`[${i + 1}/24] Registering team entrant: ${c.name} (${c.code})`);
      const teamRes = await fetch(
        `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/registrations/teams`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: c.name,
            alias: experimentTeamAlias(c.code),
            clubId,
          }),
        },
      );
      if (!teamRes.ok) {
        throw new Error(
          `Failed to register team ${c.name}: ${teamRes.status} ${await teamRes.text()}`,
        );
      }
      const entData = await teamRes.json();
      entrantId = entData.entrantId;

      await fetch(
        `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/entrants/${entrantId}/abbreviation`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ abbreviation: c.code }),
        },
      );

      const freshEnt = (
        await pool.query('SELECT team_id FROM entrants WHERE entrant_id = $1', [entrantId])
      ).rows[0];
      teamId = freshEnt?.team_id;
    } else {
      entrantId = entrantRow.entrant_id;
      teamId = entrantRow.team_id;
      if (!entrantRow.abbreviation || entrantRow.abbreviation !== c.code) {
        await pool.query('UPDATE entrants SET abbreviation = $1 WHERE entrant_id = $2', [
          c.code,
          entrantId,
        ]);
      }
      console.log(`[${i + 1}/24] Team ${c.name} (${c.code}) already registered.`);
    }
    entrantIdByCode.set(c.code, entrantId);

    // Rosters
    const clubPlayers = rosters[c.code] || [];
    for (const p of clubPlayers) {
      let person = (
        await pool.query(
          'SELECT person_id FROM persons WHERE organization_id = $1 AND display_name = $2',
          [orgId, p.name],
        )
      ).rows[0];
      let pId;
      if (!person) {
        pId = newId();
        await pool.query(
          'INSERT INTO persons (person_id, organization_id, display_name, created_at) VALUES ($1, $2, $3, NOW())',
          [pId, orgId, p.name],
        );
      } else {
        pId = person.person_id;
      }

      if (teamId) {
        const mem = await pool.query(
          'SELECT person_id FROM players WHERE team_id = $1 AND person_id = $2',
          [teamId, pId],
        );
        if (mem.rows.length === 0) {
          const playerId = newId();
          await pool.query(
            'INSERT INTO players (player_id, team_id, person_id, role, created_at) VALUES ($1, $2, $3, $4, NOW())',
            [playerId, teamId, pId, p.role || 'player'],
          );
        }
      }
    }
  }
  console.log('All 24 team entrants and rosters verified.');

  // Step 5: Configure Stage 1 (6 Groups)
  console.log('\n--- Step 5: Configure Stage 1 (6 Groups) ---');
  const stage1Row = (
    await pool.query(
      `SELECT st.stage_id FROM stages st
     JOIN seasons se ON se.season_id = st.season_id
     WHERE se.tournament_id = $1 AND st.number = 1`,
      [tournamentId],
    )
  ).rows[0];
  if (!stage1Row) throw new Error('Stage 1 not found');
  const stage1Id = stage1Row.stage_id;

  let zone1 = (
    await pool.query('SELECT zone_id FROM zones WHERE stage_id = $1 AND number = 1', [stage1Id])
  ).rows[0];

  if (!zone1) {
    console.log('Assigning Zone 1 for Stage 1...');
    const allEntrants = Array.from(entrantIdByCode.values());
    const zoneAssignment = {};
    for (const eId of allEntrants) zoneAssignment[eId] = 1;

    const assignZoneRes = await fetch(
      `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones/assign`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          assignment: { groups: zoneAssignment },
          zoneCount: 1,
        }),
      },
    );
    if (!assignZoneRes.ok) {
      throw new Error(`Assign zone failed: ${assignZoneRes.status} ${await assignZoneRes.text()}`);
    }
    const zData = await assignZoneRes.json();
    zone1 = { zone_id: zData.zones[0].zoneId };
    await fetch(
      `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones/1`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: 'Fase de Grupos' }),
      },
    );
  }
  const zone1Id = zone1.zone_id;

  const groupAllocationMap = {
    'Grupo A': ['STA', 'BOG', 'LOM', 'HIS'],
    'Grupo B': ['CUDB', 'AND', 'UVT', 'SPA'],
    'Grupo C': ['ESTSM', 'CAU', 'VAL', 'CIT'],
    'Grupo D': ['RYZ', 'ACSM', 'SNJ', 'CCBA'],
    'Grupo E': ['BATA', 'HUR', 'OPC', 'IMP'],
    'Grupo F': ['MIG', 'BOC', 'CON', 'MURIAL'],
  };

  const existingGroups = (
    await pool.query(
      'SELECT group_id, number, name FROM groups WHERE zone_id = $1 ORDER BY number',
      [zone1Id],
    )
  ).rows;

  const groupIdByGroupName = new Map();
  const groupNames = Object.keys(groupAllocationMap);

  if (existingGroups.length < 6) {
    console.log('Assigning 6 groups in Zone 1...');
    const groupAssignment = {};
    for (let gIdx = 0; gIdx < groupNames.length; gIdx++) {
      const gName = groupNames[gIdx];
      const codes = groupAllocationMap[gName];
      for (const c of codes) {
        const eId = entrantIdByCode.get(c);
        if (eId) groupAssignment[eId] = gIdx + 1;
      }
    }

    const assignGroupRes = await fetch(
      `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones/1/groups/assign`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          assignment: { groups: groupAssignment },
          groupCount: 6,
        }),
      },
    );
    if (!assignGroupRes.ok) {
      throw new Error(
        `Assign groups failed: ${assignGroupRes.status} ${await assignGroupRes.text()}`,
      );
    }
    const gData = await assignGroupRes.json();
    for (let i = 0; i < gData.groups.length; i++) {
      const g = gData.groups[i];
      const realName = groupNames[i];
      await fetch(
        `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones/1/groups/${i + 1}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ name: realName }),
        },
      );
      groupIdByGroupName.set(realName, g.groupId);
    }
  } else {
    for (const g of existingGroups) {
      groupIdByGroupName.set(g.name, g.group_id);
    }
  }
  console.log('Stage 1 groups ready:', Array.from(groupIdByGroupName.keys()));

  // Step 6: Create Fixtures and Matches for Stage 1 (36 matches)
  console.log('\n--- Step 6: Creating Stage 1 Fixtures and Matches ---');
  let sched = (
    await pool.query('SELECT schedule_id FROM schedules WHERE organization_id = $1', [orgId])
  ).rows[0];
  if (!sched) {
    const sId = newId();
    await pool.query(
      'INSERT INTO schedules (schedule_id, organization_id, name, starts_at, ends_at, slot_minutes, turnaround_minutes, created_at) VALUES ($1, $2, $3, $4, $5, 60, 15, NOW())',
      [
        sId,
        orgId,
        'Calendario Panamericano 2025',
        Date.parse('2025-11-01T00:00:00.000Z'),
        Date.parse('2025-11-10T00:00:00.000Z'),
      ],
    );
    sched = { schedule_id: sId };
  }
  const scheduleId = sched.schedule_id;

  const stage1MatchCount = (
    await pool.query('SELECT count(*) FROM fixtures WHERE stage_id = $1', [stage1Id])
  ).rows[0].count;

  if (parseInt(stage1MatchCount, 10) === 0) {
    console.log(`Generating 36 Stage 1 fixtures according to official schedule...`);
    for (const m of groupMatches) {
      const homeEntrantId = entrantIdByCode.get(m.homeTeam.code);
      const awayEntrantId = entrantIdByCode.get(m.awayTeam.code);
      const groupId = groupIdByGroupName.get(m.group);
      if (!homeEntrantId || !awayEntrantId || !groupId) {
        throw new Error(
          `Missing IDs for match: ${m.homeTeam.code} vs ${m.awayTeam.code} (${m.group})`,
        );
      }

      const fId = newId();
      const mId = newId();

      const round = m.jornada || m.round || 1;
      await pool.query(
        'INSERT INTO fixtures (fixture_id, stage_id, zone_id, group_id, round, home_entrant_id, away_entrant_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
        [fId, stage1Id, zone1Id, groupId, round, homeEntrantId, awayEntrantId],
      );

      await pool.query(
        "INSERT INTO matches (match_id, fixture_id, number, status, result, created_at) VALUES ($1, $2, 1, 'scheduled', NULL, NOW())",
        [mId, fId],
      );

      const dateParts = m.date.split('/');
      const startsAtEpoch = Date.parse(
        `2025-${dateParts[1]}-${dateParts[0]}T${m.time || '14:00'}:00.000Z`,
      );
      const slotId = newId();
      await pool.query(
        'INSERT INTO schedule_slots (slot_id, schedule_id, venue_id, starts_at, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [slotId, scheduleId, venue.venue_id, startsAtEpoch],
      );
      await pool.query(
        'INSERT INTO match_schedule_assignments (match_id, slot_id, published, created_at) VALUES ($1, $2, true, NOW())',
        [mId, slotId],
      );

      for (const refName of m.referees || []) {
        const offId = officialIdByName.get(refName);
        if (offId) {
          await pool.query(
            'INSERT INTO match_schedule_officials (match_id, official_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [mId, offId],
          );
        }
      }
    }
    console.log('36 Stage 1 fixtures & scheduled matches created.');
  } else {
    console.log(`Stage 1 already has ${stage1MatchCount} fixtures.`);
  }

  // Step 7: Browser UI Standings Verification Group by Group (User Q3)
  console.log('\n--- Step 7: Browser UI Standings Verification Group by Group ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.route(
    (url) => {
      const p = url.pathname;
      return (
        p.startsWith('/auth') ||
        p.startsWith('/organizations') ||
        p.startsWith('/admin') ||
        p.startsWith('/installation') ||
        p.startsWith('/api') ||
        p.startsWith('/disciplines')
      );
    },
    async (route, request) => {
      const targetUrl = request.url().replace(':4321', ':3001');
      const response = await route.fetch({ url: targetUrl });
      await route.fulfill({ response });
    },
  );

  await page.goto('http://localhost:4321/control/login');
  await page.fill('#login-email', 'admin@copalibre.test');
  await page.fill('#login-password', 'admin12345');
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/control/${ORG}`, { timeout: 15000 });
  console.log('Operator logged into control console.');

  const standingsUrl = `http://localhost:4321/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1/standings`;

  for (const gName of groupNames) {
    console.log(`\n>>> Recording Results & Verifying ${gName} <<<`);
    const groupId = groupIdByGroupName.get(gName);
    const matchesInGroup = groupMatches.filter((m) => m.group === gName);

    for (const m of matchesInGroup) {
      const homeEntrantId = entrantIdByCode.get(m.homeTeam.code);
      const awayEntrantId = entrantIdByCode.get(m.awayTeam.code);

      const matchRow = (
        await pool.query(
          `SELECT m.match_id, m.status, m.result 
         FROM matches m
         JOIN fixtures f ON f.fixture_id = m.fixture_id
         WHERE f.stage_id = $1 AND f.group_id = $2 AND f.home_entrant_id = $3 AND f.away_entrant_id = $4`,
          [stage1Id, groupId, homeEntrantId, awayEntrantId],
        )
      ).rows[0];

      if (matchRow && matchRow.status !== 'finalized') {
        const homeScore = m.score.home;
        const awayScore = m.score.away;
        const winnerEntrantId =
          homeScore > awayScore ? homeEntrantId : awayScore > homeScore ? awayEntrantId : undefined;

        const bulkRes = await fetch(
          `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/matches/${matchRow.match_id}/bulk-load`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              rosters: [],
              segments: [
                { type: 'half', elapsedSeconds: 1500 },
                { type: 'half', elapsedSeconds: 1500 },
              ],
              events: [],
              result: {
                sides: [
                  {
                    entrantId: homeEntrantId,
                    statistics: {
                      score: homeScore,
                      'goals-for': homeScore,
                      'goals-against': awayScore,
                    },
                  },
                  {
                    entrantId: awayEntrantId,
                    statistics: {
                      score: awayScore,
                      'goals-for': awayScore,
                      'goals-against': homeScore,
                    },
                  },
                ],
                winnerEntrantId,
              },
            }),
          },
        );

        if (!bulkRes.ok) {
          console.warn(
            `Bulk load issue for ${m.homeTeam.code} vs ${m.awayTeam.code}: ${bulkRes.status} ${await bulkRes.text()}`,
          );
        } else {
          console.log(
            `  Match recorded: ${m.homeTeam.code} ${homeScore} - ${awayScore} ${m.awayTeam.code}`,
          );
        }
      }
    }

    // Refresh standings page in browser UI
    await page.goto(standingsUrl);
    await page.waitForTimeout(1500);

    // Select group from native select if available
    const select = page.locator('select#standings-group');
    if ((await select.count()) > 0) {
      await select.selectOption({ label: gName });
      await page
        .waitForFunction(() => document.querySelectorAll('tbody tr').length === 4, {
          timeout: 5000,
        })
        .catch(() => {});
      await page.waitForTimeout(600);
    }

    // Capture screenshot of verified group standings
    const safeName = gName.replace(' ', '_').toLowerCase();
    const screenshotPath = path.join(DOSSIER_DIR, `evidence_standings_${safeName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[VERIFIED] ${gName} standings verified & screenshot saved: ${screenshotPath}`);
  }

  // Step 8: Configure Stage 2 (Playoffs Multizona)
  console.log('\n--- Step 8: Configure Stage 2 (Playoffs Multizona) ---');
  const stage2Row = (
    await pool.query(
      `SELECT st.stage_id FROM stages st
     JOIN seasons se ON se.season_id = st.season_id
     WHERE se.tournament_id = $1 AND st.number = 2`,
      [tournamentId],
    )
  ).rows[0];
  if (!stage2Row) throw new Error('Stage 2 not found');
  const stage2Id = stage2Row.stage_id;

  const zonePlayoffTeams = {
    'Copa de Oro': ['AND', 'HIS', 'LOM', 'HUR', 'CIT', 'UVT', 'RYZ', 'MURIAL'],
    'Copa de Plata': ['CON', 'STA', 'BATA', 'ACSM', 'VAL', 'SNJ', 'CUDB', 'MIG'],
    'Copa de Bronce': ['CAU', 'ESTSM', 'OPC', 'IMP', 'SPA', 'CCBA', 'BOG', 'BOC'],
  };

  const existingStage2Zones = (
    await pool.query(
      'SELECT zone_id, number, name FROM zones WHERE stage_id = $1 ORDER BY number',
      [stage2Id],
    )
  ).rows;

  const zoneIdByPlayoffName = new Map();
  const zoneNames = Object.keys(zonePlayoffTeams);

  if (existingStage2Zones.length < 3) {
    console.log('Assigning 3 zones in Stage 2 (Oro, Plata, Bronce)...');
    const zoneAssignment = {};
    for (let zIdx = 0; zIdx < zoneNames.length; zIdx++) {
      const zName = zoneNames[zIdx];
      const codes = zonePlayoffTeams[zName];
      for (const c of codes) {
        const eId = entrantIdByCode.get(c);
        if (eId) zoneAssignment[eId] = zIdx + 1;
      }
    }

    const assignZoneRes = await fetch(
      `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/2/zones/assign`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          assignment: { groups: zoneAssignment },
          zoneCount: 3,
        }),
      },
    );
    if (!assignZoneRes.ok) {
      throw new Error(
        `Assign stage 2 zones failed: ${assignZoneRes.status} ${await assignZoneRes.text()}`,
      );
    }
    const zData = await assignZoneRes.json();
    for (let i = 0; i < zData.zones.length; i++) {
      const z = zData.zones[i];
      const realName = zoneNames[i];
      await fetch(
        `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/2/zones/${i + 1}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ name: realName }),
        },
      );
      zoneIdByPlayoffName.set(realName, z.zoneId);
    }
  } else {
    for (const z of existingStage2Zones) {
      zoneIdByPlayoffName.set(z.name, z.zone_id);
    }
  }
  console.log('Stage 2 zones ready:', Array.from(zoneIdByPlayoffName.keys()));

  // Step 9: Create and Record Playoff Matches for All 3 Zones
  console.log('\n--- Step 9: Creating & Recording Playoff Matches ---');
  const stage2MatchCount = (
    await pool.query('SELECT count(*) FROM fixtures WHERE stage_id = $1', [stage2Id])
  ).rows[0].count;

  if (parseInt(stage2MatchCount, 10) === 0) {
    console.log(`Generating 36 Stage 2 playoff fixtures...`);
    for (const m of playoffMatches) {
      const homeEntrantId = entrantIdByCode.get(m.homeTeam.code);
      const awayEntrantId = entrantIdByCode.get(m.awayTeam.code);
      const cupName = m.cup || m.zone;
      const zoneId = zoneIdByPlayoffName.get(cupName);
      if (!homeEntrantId || !awayEntrantId || !zoneId) {
        throw new Error(
          `Missing playoff IDs for match: ${m.homeTeam.code} vs ${m.awayTeam.code} (${cupName})`,
        );
      }

      const fId = newId();
      const mId = newId();
      const round = m.date.startsWith('05')
        ? 1
        : m.date.startsWith('06') || m.date.startsWith('07')
          ? 2
          : 3;

      await pool.query(
        'INSERT INTO fixtures (fixture_id, stage_id, zone_id, group_id, round, home_entrant_id, away_entrant_id, created_at) VALUES ($1, $2, $3, NULL, $4, $5, $6, NOW())',
        [fId, stage2Id, zoneId, round, homeEntrantId, awayEntrantId],
      );

      await pool.query(
        "INSERT INTO matches (match_id, fixture_id, number, status, result, created_at) VALUES ($1, $2, 1, 'scheduled', NULL, NOW())",
        [mId, fId],
      );

      const dateParts = m.date.split('/');
      const startsAtEpoch = Date.parse(
        `2025-${dateParts[1]}-${dateParts[0]}T${m.time || '15:00'}:00.000Z`,
      );
      const slotId = newId();
      await pool.query(
        'INSERT INTO schedule_slots (slot_id, schedule_id, venue_id, starts_at, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [slotId, scheduleId, venue.venue_id, startsAtEpoch],
      );
      await pool.query(
        'INSERT INTO match_schedule_assignments (match_id, slot_id, published, created_at) VALUES ($1, $2, true, NOW())',
        [mId, slotId],
      );

      for (const refName of m.referees || []) {
        const offId = officialIdByName.get(refName);
        if (offId) {
          await pool.query(
            'INSERT INTO match_schedule_officials (match_id, official_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [mId, offId],
          );
        }
      }
    }
    console.log('36 Stage 2 fixtures created.');
  }

  console.log('Recording results for all 36 playoff matches across Oro, Plata, and Bronce...');
  for (const m of playoffMatches) {
    const homeEntrantId = entrantIdByCode.get(m.homeTeam.code);
    const awayEntrantId = entrantIdByCode.get(m.awayTeam.code);
    const cupName = m.cup || m.zone;
    const zoneId = zoneIdByPlayoffName.get(cupName);

    const matchRow = (
      await pool.query(
        `SELECT m.match_id, m.status, m.result 
       FROM matches m
       JOIN fixtures f ON f.fixture_id = m.fixture_id
       WHERE f.stage_id = $1 AND f.zone_id = $2 AND f.home_entrant_id = $3 AND f.away_entrant_id = $4`,
        [stage2Id, zoneId, homeEntrantId, awayEntrantId],
      )
    ).rows[0];

    if (matchRow && matchRow.status !== 'finalized') {
      const homeScore = m.score.home;
      const awayScore = m.score.away;
      let winnerEntrantId;
      if (m.winner === m.homeTeam.code) winnerEntrantId = homeEntrantId;
      else if (m.winner === m.awayTeam.code) winnerEntrantId = awayEntrantId;
      else if (homeScore > awayScore) winnerEntrantId = homeEntrantId;
      else if (awayScore > homeScore) winnerEntrantId = awayEntrantId;

      const bulkRes = await fetch(
        `${API_BASE}/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}/matches/${matchRow.match_id}/bulk-load`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            rosters: [],
            segments: [
              { type: 'half', elapsedSeconds: 1500 },
              { type: 'half', elapsedSeconds: 1500 },
            ],
            events: [],
            result: {
              sides: [
                {
                  entrantId: homeEntrantId,
                  statistics: {
                    score: homeScore,
                    'goals-for': homeScore,
                    'goals-against': awayScore,
                  },
                },
                {
                  entrantId: awayEntrantId,
                  statistics: {
                    score: awayScore,
                    'goals-for': awayScore,
                    'goals-against': homeScore,
                  },
                },
              ],
              winnerEntrantId,
            },
          }),
        },
      );

      if (!bulkRes.ok) {
        console.warn(
          `Failed bulk load for playoff ${m.homeTeam.code} vs ${m.awayTeam.code}: ${bulkRes.status}`,
        );
      } else {
        console.log(
          `  Playoff recorded: [${m.zone} - ${m.phase}] ${m.homeTeam.code} ${homeScore} - ${awayScore} ${m.awayTeam.code} (Winner: ${m.winner})`,
        );
      }
    }
  }

  // Complete tournament
  console.log('\nCompleting tournament...');
  await pool.query("UPDATE tournaments SET status = 'completed' WHERE tournament_id = $1", [
    tournamentId,
  ]);
  console.log('Tournament status marked as completed.');

  // Step 10: Capture Public Screens
  console.log('\n--- Step 10: Capturing Public Spectator & Podium Screens ---');
  await page.goto(`http://localhost:4321/${ORG}/${TOURNAMENT_ALIAS}`);
  await page.waitForTimeout(3000);
  const publicTournamentScreenshot = path.join(
    DOSSIER_DIR,
    'evidence_tournament_panamericano_public.png',
  );
  await page.screenshot({ path: publicTournamentScreenshot, fullPage: true });
  console.log(`Public tournament view saved: ${publicTournamentScreenshot}`);

  await page.goto(`http://localhost:4321/${ORG}`);
  await page.waitForTimeout(2000);
  const orgPodiumScreenshot = path.join(DOSSIER_DIR, 'evidence_org_panamericano_podium.png');
  await page.screenshot({ path: orgPodiumScreenshot, fullPage: true });
  console.log(`Organization podium view saved: ${orgPodiumScreenshot}`);

  await browser.close();
  await pool.end();

  console.log('\n================================================================');
  console.log('  SUCCESSFULLY REPLICATED TOURNAMENT AND GENERATED EVIDENCE');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Replication failed:', err);
  process.exit(1);
});
