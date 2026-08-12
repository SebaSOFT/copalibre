# platform/api-cors Specification

## Purpose
The API must accept client-side requests from the frontend web shell to enable interactive features like the control panel.
## Requirements
### Requirement: Explicit CORS Origin
The API must return `Access-Control-Allow-Origin: <COPALIBRE_APP_URL>` for cross-origin requests.

#### Scenario: Allowed cross-origin request
- **WHEN** a client-side request is made from the web shell's domain (configured as `COPALIBRE_APP_URL`)
- **THEN** the API responds with CORS headers permitting the request

#### Scenario: Rejected cross-origin request
- **WHEN** a client-side request is made from an origin that does not match `COPALIBRE_APP_URL`
- **THEN** the API does not emit CORS headers permitting the request, causing the browser to block it

#### Scenario: Integration and MCP Requests (Server-to-Server)
- **WHEN** an external system or MCP client makes an API request without an `Origin` header
- **THEN** the API processes the request normally, as CORS restrictions only apply to browser-based origin enforcement

