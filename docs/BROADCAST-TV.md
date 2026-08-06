# Broadcast and venue TV surfaces

`/tv/**` renders published tournament data for unattended venue screens (kiosk mode) and
transparent streaming-software overlays (`?mode=overlay`, for OBS/chroma-key capture). It has no
session in the person-JWT sense: nobody is present to log in, dismiss an error, or click retry.

## Device-scoped display tokens

Access is authorized by a **display token** — long-lived, revocable, bound to exactly one
`/tv/**` route, issued by an organization admin. It is not a person's JWT: revoking one device
never touches any person's session, and revoking a person's access never touches a kiosk.

Issue one from the control API:

```
POST /organizations/{organizationAlias}/tournaments/{tournamentAlias}/display-tokens
{ "label": "Cancha 1 - TV entrada" }              # full rotation
{ "matchId": "...", "label": "Cancha 1 - Semifinal" }  # pinned to one match
```

The response's `token` is shown once and stored only as a hash; the response's `url` is the full
`/tv/**` launch URL, the token included as a query parameter.

Revoke one device without affecting any other: `DELETE .../display-tokens/{displayTokenId}`.

## Provisioning a device

**Do not rely on `localStorage`.** A kiosk can lose power and restart with its browser profile
wiped; a token that only lives in `localStorage` is a device that needs re-provisioning every
outage. Two supported methods:

1. **Launch-URL query parameter** (simplest): configure the kiosk's browser to open the `url` the
   issuance response returned, and to always reopen exactly that URL on restart (most kiosk
   browsers — Chromium `--kiosk <url>`, a systemd unit restarting the browser, a dedicated
   digital-signage player — support a fixed startup URL). The token then lives in the device's own
   launch configuration, which survives a power-cycle by construction.
2. **Config file the launcher reads on boot**: for a managed fleet, write the token into a config
   file your launcher script reads and injects into the page URL at startup, rather than the
   device's browser storage.

Either way, the token reaches the page once per boot from durable device configuration, not from
browser storage the OS or browser could clear.

## What the token authorizes

The `/tv/**` page and the SSE stream it opens both require the token. The page reads it from the
URL client-side and sends it as an `Authorization: Bearer` header on the stream request — the
token is in a URL only at the device's own launch, never on the repeated stream request, matching
every other authenticated stream in this system.

A leaked display token grants read-only access to one route until revoked — never a person's
identity, never write access, never another route.
