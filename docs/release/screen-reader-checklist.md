# Release screen-reader checklist

This is an optional manual accessibility pass for a release candidate. Run it in a non-production
environment, using demo data and test identities. To check a flow with assistive technology, run it
with each combination below.

## Combinations

| Screen reader | Browser | Platform |
| ------------- | ------- | -------- |
| TalkBack      | Chrome  | Android  |
| VoiceOver     | Safari  | iOS      |
| NVDA          | Firefox | Windows  |

When a pass is recorded, note the versions of the operating system, browser and screen reader.

## Flows and expected announcements

1. **Public tournament overview.** Navigate by landmarks and headings, then follow a match link.
   The tournament title is the page's main heading; match links identify the participants and expose
   match state as text; table values are announced with their column headers.
2. **Public match page.** Navigate to the match summary and event timeline. The match title, both
   participants, score and state are available as text. Timeline entries expose localized event names
   and human-readable times, not raw codes or machine timestamps.
3. **Live match console.** Use an event valid for the fixture's discipline and record it, then repeat
   with the browser offline. Controls expose their labels; the event's sync state is announced. While
   offline, the header announces the offline state and queued count, the event is announced as
   `Queued`, and it is not announced as `Confirmed` before server acknowledgement.
4. **Registration review.** Filter to pending registrations, expand a test registration and approve
   or refuse it. The page heading precedes the table and tools; the filter, row and action have
   discernible names and context; the resulting registration status or action confirmation is
   announced.
5. **Login.** Move through the email and password fields, submit invalid credentials, then complete
   sign-in with the test identity. Both fields have announced labels; the authentication error is
   announced and associated with the form; successful sign-in moves to the authenticated page.

## Optional results record

To keep a record of a pass, copy this template into `docs/release/results/<version>-screen-reader.md`.
Record what the assistive technology announced in each cell, not only a pass/fail mark. Link any
failure to its tracking issue and record the retest result after it is fixed.

```markdown
# Screen-reader results — <version>

- Candidate commit:
- Test date:
- Tester:
- Test environment:

| Flow                       | TalkBack + Chrome / Android       | VoiceOver + Safari / iOS          | NVDA + Firefox / Windows          |
| -------------------------- | --------------------------------- | --------------------------------- | --------------------------------- |
| Public tournament overview | Result and observed announcement: | Result and observed announcement: | Result and observed announcement: |
| Public match page          | Result and observed announcement: | Result and observed announcement: | Result and observed announcement: |
| Live match console         | Result and observed announcement: | Result and observed announcement: | Result and observed announcement: |
| Registration review        | Result and observed announcement: | Result and observed announcement: | Result and observed announcement: |
| Login                      | Result and observed announcement: | Result and observed announcement: | Result and observed announcement: |
```

Do not include real credentials or personal data in results.
