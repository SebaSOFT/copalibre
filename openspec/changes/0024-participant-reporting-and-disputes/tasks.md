## 1. Domain model

- [ ] 1.1 Add report/dispute fact types to `packages/domain` (match reference, submitter, evidence references, reason, status: pending/reviewed/dismissed)
- [ ] 1.2 Ensure report/dispute types carry no field capable of directly setting a result, standing, or advancement value

## 2. API endpoints

- [ ] 2.1 Add participant-scoped `POST` endpoint for submitting a proposed result report
- [ ] 2.2 Add participant-scoped `POST` endpoint for submitting a dispute against a recorded result
- [ ] 2.3 Add operator-scoped endpoints to list, review, and dismiss pending reports/disputes
- [ ] 2.4 Wire the existing phase-8 correction endpoint to accept a report/dispute ID as its `reason` reference

## 3. Evidence handling

- [ ] 3.1 Add evidence-upload handling through the existing S3-compatible object-storage adapter
- [ ] 3.2 Route evidence through the existing async validation/malware-check worker path
- [ ] 3.3 Add an audit record for each evidence upload (uploader identity, timestamp)

## 4. Authorization

- [ ] 4.1 Extend phase 18's resource-ownership policy with the "submit report/dispute for own match" scoped action
- [ ] 4.2 Add policy tests confirming a participant cannot submit for a match they are not a party to

## 5. Unit tests

- [ ] 5.1 Unit test report/dispute fact validation (rejects any field attempting to directly set authoritative state)
- [ ] 5.2 Unit test the resource-ownership scoped-action check in isolation

## 6. Integration tests

- [ ] 6.1 Integration test: participant submits a report for their own match — persisted, linked, no standings change
- [ ] 6.2 Integration test: participant attempts to submit for a match they are not a party to — rejected at the authorization layer
- [ ] 6.3 Integration test: operator applies a correction citing a dispute — correction follows the unchanged phase-8 actor/timestamp/reason/prior-state/replacement-state/recalculation-preview contract
- [ ] 6.4 Integration test: submitting a report/dispute alone, with no operator action, leaves all standings/results/advancement state unchanged

## 7. E2E tests

- [ ] 7.1 E2E: participant submits a dispute with evidence via control-web's participant self-service view, operator sees it in the pending-review queue
- [ ] 7.2 E2E: operator reviews and dismisses a dispute without applying a correction — result remains unchanged in the public/control UI

## 8. CI wiring

- [ ] 8.1 Add the participant-reporting unit, integration, and e2e tests to the existing `unit`/`integration`/`e2e` jobs in `.github/workflows/ci.yml`
