# Security alerts and response

## What raises an alert

The API records every refused request (401 or 403) in the audit log as `authorization.refused`,
with the actor (a principal, or `unauthenticated`), the method and the path. It never records a
credential, a request body or a query string's values.

Every five minutes the scheduler queues a check, and the worker counts each actor's refusals over
the last ten minutes. An actor at or above `COPALIBRE_SECURITY_ALERT_THRESHOLD` (default 20) raises
one alert:

- a structured log line from the worker, `{"event":"security.alert","actor":…,"refusals":…,
"windowMinutes":10,"topPaths":[…]}`;
- an audit entry `security.alert-raised`, which also keeps the same burst from alerting again within
  the window;
- when `COPALIBRE_SECURITY_ALERT_EMAIL` is set, one email per check listing every new burst, sent
  through the installation's email provider.

A threshold below 2 or not a whole number stops the worker from starting, so a typo cannot silence
alerting.

## Who responds

The installation's operator: whoever holds super-admin and receives
`COPALIBRE_SECURITY_ALERT_EMAIL`. Set that address to a mailbox someone reads; an alert with no
recipient reaches only the logs.

## Responding

1. **Read the burst.** Open the audit trail in Control (Platform) and filter on
   `authorization.refused` for the actor and window in the alert.
2. **Unauthenticated sign-in failures** (`POST /api/auth/login`, `/api/auth/reset-password`): the
   per-address rate limits already slow them. If they continue, block the source at the edge proxy.
   Check `COPALIBRE_TRUSTED_PROXIES` names the proxy, so limits key on the client and not on it.
3. **An authenticated principal refused on admin or another organization's routes:** treat its
   credentials as possibly stolen. Revoke its personal access tokens, reset its password (which
   ends its refresh sessions), and remove assignments it should not hold. An access token already
   issued stays valid until it expires, up to fifteen minutes.
4. **A credential found exposed:** record it as a finding with `kind: "credential"` in
   `docs/security/findings.json`, revoke and replace it with its provider, confirm the old value is
   refused, then record that in an attestation. Deleting it from the repository does not close it.
5. Keep the alert email, the audit entries and the actions taken with the incident record.
