# Background API probe

Metadata-only standalone research probe. See [`docs/research/background-api.md`](../../docs/research/background-api.md) for acceptance criteria and limits.

```sh
node research/background-api/verify.mjs
python3 research/background-api/services.py start
node research/background-api/public-preflight.mjs
python3 research/background-api/services.py stop
```

The service only listens on loopback. The temporary URL is recorded in ignored `processes.local.json`; it requires a random path token. Only explicitly listed static files are served; the user-authorized temporary bootstrap was same-origin, one-use and limited to ten minutes; it was removed after the phone test. Never host this directory with an unrestricted static file server: it also holds ignored local credentials.

The credentials template is `credentials.example.json`. Copy to `credentials.local.json` and keep file permissions private; the normal probe does not expose it. During the explicitly authorized phone test, a short-lived, one-use bootstrap transferred it over HTTPS into the test phone memory after the user clicked the real-test button. This entrance has now been removed. Real API requests in the test page go from the browser directly to the chosen endpoint, with credentials held only in page memory. No provider request can start without a user click.

`verification.json` is Mac Node protocol evidence, not iPhone evidence. `public-preflight.json` is Mac transport evidence through the temporary tunnel. Actual phone metadata stays in ignored `events.local.jsonl`; only a sanitized results summary should be committed later.

Quick Tunnels officially do not support SSE. Received chunks are exploratory observations, not a production transport guarantee. Test both foreground and background with the same endpoint before assigning failures to Safari.

Actual iPhone results: `phone-basic-results.json` and `phone-real-results.json`. Cleanup verified in `cleanup.json`; temporary services are stopped.
