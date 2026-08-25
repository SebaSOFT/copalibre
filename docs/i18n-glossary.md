# i18n content glossary

Domain-specific terms whose generic dictionary meaning differs from the tournament-software
concept CopaLibre uses. A translation that renders one of these by its generic meaning is
plausible-looking but wrong. Any content-accuracy review — human or LLM-assisted — checks a
flagged string containing one of these terms against this table before accepting or rejecting
the flag (`platform/internationalization`'s "Domain-term glossary governs translation of
tournament-specific vocabulary" requirement).

Supported locales: `en` (source), `es`, `fr`, `pt`, `it`, `de`, `ru`, `zh`.

## How to use this table

- **Keep untranslated** means the term stays as the English word even in translated strings
  (matches how CopaLibre's own domain language treats it — see `AGENTS.md`'s `alias` rule).
- **Fixed rendering** gives the one term that string should use in that locale; a literal
  dictionary synonym is a translation error even if grammatically correct.
- A review flags a string using this term with anything other than the listed rendering; the
  human confirming the flag either agrees, or documents why this instance is a legitimate
  exception (e.g. a plain-English loanword UI label vs. running prose).

## Terms

### `roster`

English meaning: the set of players an entrant has selected for one match (never a persistent
team-membership list — `AGENTS.md`'s own roster/team-membership distinction).

| es                                            | fr                                   | pt        | it                              | de          | ru                                | zh                          |
| --------------------------------------------- | ------------------------------------ | --------- | ------------------------------- | ----------- | --------------------------------- | --------------------------- |
| plantilla de convocados / lista de convocados | feuille de match / effectif convoqué | escalação | formazione / distinta convocati | Aufstellung | заявка на матч (zayavka na match) | 出场名单 (chūchǎng míngdān) |

Avoid: `lista` alone (too generic), `équipe` (means the team, not the match roster),
`Kader` (German for the full squad, not the match-day selection).

### `seed` / `seeding`

English meaning: the ranking assigned to an entrant before bracket placement, used to keep
strong entrants apart in early rounds.

| es                        | fr            | pt              | it             | de                | ru                                    | zh                                         |
| ------------------------- | ------------- | --------------- | -------------- | ----------------- | ------------------------------------- | ------------------------------------------ |
| cabeza de serie / siembra | tête de série | cabeça de chave | testa di serie | Setzung / gesetzt | посев (posev) / посеянный (poseyanny) | 种子 (zhǒngzi) / 种子排位 (zhǒngzi páiwèi) |

Avoid: a literal "plant a seed" agricultural translation in any locale — the sports sense is
a distinct, lexicalized term in every supported language above, not a metaphor to re-derive.

### `bracket`

English meaning: the tree structure of matches leading to a champion.

| es             | fr      | pt    | it        | de          | ru                                 | zh                    |
| -------------- | ------- | ----- | --------- | ----------- | ---------------------------------- | --------------------- |
| cuadro / llave | tableau | chave | tabellone | Turnierbaum | турнирная сетка (turnirnaya setka) | 对阵表 (duìzhèn biǎo) |

Avoid: `soporte`/`support` (generic-object literal reading of "bracket").

### `entrant`

English meaning: whatever is entered into the tournament — an individual player or a team,
deliberately generic across disciplines (`DisciplineDescriptor`-driven).

| es           | fr          | pt           | it           | de         | ru                   | zh                 |
| ------------ | ----------- | ------------ | ------------ | ---------- | -------------------- | ------------------ |
| participante | participant | participante | partecipante | Teilnehmer | участник (uchastnik) | 参赛者 (cānsàizhě) |

Avoid: defaulting to `equipo`/`équipe`/`team`-only renderings — that silently drops the
individual-player case for disciplines that don't use teams.

### `tiebreak`

English meaning: the rule (and its computed trace) that orders entrants sharing the same
points/score in standings.

| es        | fr        | pt        | it                     | de                        | ru                                                  | zh                        |
| --------- | --------- | --------- | ---------------------- | ------------------------- | --------------------------------------------------- | ------------------------- |
| desempate | départage | desempate | spareggio (criteri di) | Tiebreak / Stichentscheid | тай-брейк (tay-breyk) / критерий распределения мест | 平局判定 (píngjú pàndìng) |

Avoid: a literal "break the tie" verb-phrase construction where the target language has a
single lexicalized noun instead.

### `standings`

English meaning: the ranked table of entrants within a stage/group, computed from results and
tiebreak rules.

| es                                  | fr         | pt                      | it         | de                  | ru                                      | zh                  |
| ----------------------------------- | ---------- | ----------------------- | ---------- | ------------------- | --------------------------------------- | ------------------- |
| tabla de posiciones / clasificación | classement | tabela de classificação | classifica | Tabelle / Rangliste | турнирная таблица (turnirnaya tablitsa) | 积分榜 (jīfēn bǎng) |

Avoid: `standing` (singular, means status/reputation, not the table).

### `zone` / `group`

English meaning: a subdivision of entrants within a stage (e.g. group-stage groups), distinct
from a geographic `timezone`.

| es           | fr            | pt           | it            | de     | ru              | zh            |
| ------------ | ------------- | ------------ | ------------- | ------ | --------------- | ------------- |
| zona / grupo | zone / groupe | zona / grupo | zona / girone | Gruppe | группа (gruppa) | 小组 (xiǎozǔ) |

Avoid: confusing this with `timezone` renderings in the same locale — check the message key's
namespace (`zoneGroup*` vs `platformTimezone`) before assuming which sense applies.

### `alias`

English meaning: CopaLibre's own term for a human-readable, URL-safe path identifier
(`AGENTS.md`: "alias" is CopaLibre's own term, never "slug"). This is a project-specific
convention, not a generic dictionary word.

| es    | fr    | pt    | it    | de    | ru            | zh             |
| ----- | ----- | ----- | ----- | ----- | ------------- | -------------- |
| alias | alias | alias | alias | Alias | алиас (alias) | 别名 (biémíng) |

**Keep untranslated / transliterated as `alias`-derived in every locale.** Never render as each
language's word for a generic URL "slug" (`ruta`, `chemin`, `Pfad`, etc.) — that loses the
project-specific concept this term names.

### `placement`

English meaning: an entrant's final rank/position in a completed stage or tournament (distinct
from `standings`, which is the live/ongoing table).

| es                         | fr              | pt        | it          | de          | ru                               | zh            |
| -------------------------- | --------------- | --------- | ----------- | ----------- | -------------------------------- | ------------- |
| posición final / ubicación | placement final | colocação | piazzamento | Platzierung | итоговое место (itogovoye mesto) | 名次 (míngcì) |

Avoid: reusing the same word chosen for `standings` — the two are related but distinct concepts
in the product (ongoing table vs. final rank), and collapsing them in translation loses that
distinction even where the source English also reuses similar wording.

### `draw` (additional term found via task 1.2 grep)

English meaning: **two unrelated senses that must not share a translation** —
(1) the random/seeded process that assigns entrants to bracket slots or groups
(`zoneGroupAutomaticDraw`, `zoneGroupConfirmDraw`, `zoneGroupSeed` "Draw seed"), and
(2) a match result with no winner (`loadMatchDataNoWinnerDraw` "No winner / draw").
A review flagging a `draw`-containing string must first determine which sense the message key's
context implies before checking a rendering against this table.

| sense                    | es     | fr               | pt      | it        | de            | ru                        | zh              |
| ------------------------ | ------ | ---------------- | ------- | --------- | ------------- | ------------------------- | --------------- |
| (1) seeding/bracket draw | sorteo | tirage (au sort) | sorteio | sorteggio | Auslosung     | жеребьёвка (zhereb'yovka) | 抽签 (chōuqiān) |
| (2) tied match result    | empate | match nul        | empate  | pareggio  | Unentschieden | ничья (nich'ya)           | 平局 (píngjú)   |

Avoid: using the seeding/bracket-draw term for a tied result or vice versa — in every locale
above, the two senses are genuinely different words, so a wrong choice reads as an outright
mistranslation, not a stylistic difference.

## Using the glossary in a review

`scripts/i18n-content-review.mjs` loads this file's terms (parsed from the `###` headings and
tables above) alongside a locale's message catalogue. When a flagged entry's current or English
translation contains a glossary term, the report's `concern` field names the glossary entry and
its expected rendering so the human confirming the flag can check it directly against this
document rather than trusting the review's paraphrase.

## Review workflow (task 2.3)

1. Run `node scripts/i18n-content-review.mjs --locale <code> --catalogue <path-to-catalogue.ts> --flags <path-to-flags.json>` (see `--help` for all flags). The script loads the target locale's catalogue, `en` as source, and this glossary, and writes a JSON report to the path given by `--out` (defaults to `docs/i18n-reports/<catalogue-basename>.<locale>.json`).
2. The `--flags` file supplies the actual flagged entries for this run (`{ key, concern, proposedReplacement? }[]`) — the script does not call an LLM itself; a reviewer (human or an LLM-assisted session working through the catalogue against this glossary) supplies that list out of band, and the script's job is validating it against the catalogue/glossary and writing it out in the fixed report shape. A future change may wire the script to call an LLM API directly to produce `--flags` automatically; not required today.
3. A human fluent in the target locale opens the report and, per flagged key, does exactly one of: **confirm** the proposed replacement (mark `status: "confirmed"` and copy the replacement into the message catalogue file by hand), **edit** it (supply their own replacement text, still `status: "confirmed"`), or **reject** it as a false positive (`status: "rejected"`, with a one-line reason).
4. A flagged entry with no recorded confirmation stays `status: "unconfirmed"` in the report and the message catalogue is **not** edited for that key. An unconfirmed entry is not a defect — a locale with no fluent reviewer available on the project today stays unconfirmed indefinitely; that is the documented safe failure mode (stale-but-known-adequate beats a confidently wrong replacement applied without confirmation).
5. Re-running the script for the same locale/catalogue after edits regenerates the report from the current catalogue state; it does not remember prior confirmations, so keep the confirmed report as the record referenced by task 3.3's per-locale count until the next review pass.
