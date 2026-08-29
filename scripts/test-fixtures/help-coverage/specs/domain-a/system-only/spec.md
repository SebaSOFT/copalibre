# domain-a/system-only Specification

## Requirements

### Requirement: A job retries on failure

#### Scenario: A job fails and is retried

- **WHEN** a job fails processing
- **THEN** the job is retried up to the configured limit
