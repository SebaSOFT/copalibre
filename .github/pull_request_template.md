## Summary

<!-- What does this PR change and why? Link the OpenSpec change it implements, e.g.
     openspec/changes/<id>-<slug> -->

## OpenSpec change

- Change: `openspec/changes/____`
- Tasks completed: <!-- e.g. 3.1–3.4 -->

## Changed interface strings

<!-- Paste the output of `node scripts/list-changed-strings.mjs` for control/public catalogues in a
     fenced json block. List email-copy changes manually by language and field. Write `None` only
     when neither catalogue nor email strings changed. Keep each key, language, old text and new text together. -->

## UI screenshots

<!-- Embed before/after pairs for every touched screen here. -->

## Checklist

- [ ] `yarn lint` passes with zero warnings
- [ ] `yarn format:check` passes
- [ ] `yarn typecheck` passes
- [ ] `yarn test` passes (unit)
- [ ] `yarn license:check` passes
- [ ] Integration/e2e suites pass where the change touches Postgres/Nest/outbox or a
      user-facing surface (see `docs/TESTING.md`)
- [ ] New third-party or vendored code is recorded in `THIRD_PARTY_NOTICES.md`
- [ ] Task checkboxes updated in the OpenSpec change's `tasks.md`
- [ ] Changed interface strings are listed above (key, language, old → new)
- [ ] UI changes include before/after screenshot pairs for each touched screen (1440×900 desktop,
      390×844 mobile, TV 1920×1080), captured in Spanish on the Panamericano demo, committed under
      `docs/assets/screenshots` and embedded above
