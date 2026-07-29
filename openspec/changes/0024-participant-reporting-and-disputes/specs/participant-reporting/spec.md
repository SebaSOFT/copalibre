## Purpose

Lets a participant self-report a match result or dispute a recorded one, with evidence, as an input
that an operator must still authorize through the existing correction workflow — never a direct
mutation path — realizing TMS-013.

## ADDED Requirements

### Requirement: Scoped self-service result reporting
A participant SHALL be able to submit a proposed result and optional evidence for a match they are a
party to, and SHALL NOT be able to submit for a match they are not a party to.

#### Scenario: Participant reports their own match
- **WHEN** a participant submits a proposed result for a match they are registered in
- **THEN** the submission is recorded and linked to that match, visible to operators as a pending
  candidate input

#### Scenario: Participant cannot report another match
- **WHEN** a participant attempts to submit a proposed result for a match they are not a party to
- **THEN** the system rejects the request at the authorization layer

### Requirement: Dispute submission with evidence
A participant SHALL be able to flag a recorded result for their own match as disputed, attaching a
reason and optional evidence files.

#### Scenario: Dispute is recorded without altering the result
- **WHEN** a participant submits a dispute with evidence against a recorded result
- **THEN** the dispute and its evidence are stored and linked to that match's result, and the
  recorded result itself remains unchanged

### Requirement: Reports and disputes never bypass the correction workflow
A participant-submitted report or dispute SHALL NOT itself alter a recorded result, standing, or
advancement outcome; it becomes actionable only through an operator-authorized correction.

#### Scenario: Submission alone changes nothing authoritative
- **WHEN** a participant submits a report or dispute
- **THEN** no standings, results, or advancement state change until and unless an operator applies an
  authorized correction referencing that submission

#### Scenario: Operator applies a correction sourced from a dispute
- **WHEN** an operator reviews a dispute and applies the existing audited correction workflow citing
  it as the reason
- **THEN** the correction follows the same actor/timestamp/reason/prior-state/replacement-state/
  recalculation-preview contract as any other correction, with the dispute retained as supporting
  evidence in the audit trail

### Requirement: Evidence storage and audit
Uploaded evidence SHALL be stored via the object-storage adapter with an audit record of who uploaded
it and when.

#### Scenario: Evidence upload is audited
- **WHEN** a participant uploads evidence with a report or dispute
- **THEN** an audit record captures the uploading participant's identity and the upload timestamp,
  retained regardless of the submission's eventual disposition
