# Official website deployment

The official site is [igent.cc](https://igent.cc). Worker `igent-web` serves the static website, public skill API, stateless ChatGPT subscription relay and public OpenAI verification keys. [wrangler.jsonc](../../wrangler.jsonc) defines the routes, the D1 binding for the skill community and the KV binding for public JWKS caching. The relay does not use either binding for account credentials or model traffic.

## Routes

| Route | Content |
|---|---|
| `/` | Harness on iPhone/iPad; homepage on desktop |
| `/main` | Homepage and setup links |
| `/skills` | Skill community |
| `/flash` | Browser firmware installer |
| `/api/skills` | Public skill packages and publication API |
| `/api/openai/models` | `GET`: ChatGPT subscription model directory through the stateless relay |
| `/api/openai/responses` | `POST`: ChatGPT subscription Responses stream through the stateless relay |
| `/api/openai/jwks` | `GET`: public OpenAI verification keys with bounded public KV caching |

Document routes return `index.html`. Missing assets return 404. `build/site` contains the complete website, firmware manifest and precompiled binary parts.

## Publishing a release

Use the [manual release workflow](manual-release.md). It checks the source, selects matching firmware, builds the site, applies the community schema, deploys the Worker and verifies served files against the build.

The workflow reads `CLOUDFLARE_API_TOKEN` from repository secrets. Ordinary pushes and pull requests leave the deployed site unchanged. Production deployments run one at a time.

The public skill API stores published packages, signatures and revisions. Conversations, saved screen images and credentials persist in the user's browser. Ordinary model APIs are direct; ChatGPT subscriptions use the configured stateless relay for selected inputs, images, output and a short-lived access token. The relay application does not persist these data or log request bodies or credentials. Sign-in and refresh are direct to OpenAI; refresh and ID tokens are not relayed.

## Host only the ChatGPT relay

Set `ALLOWED_ORIGINS` in [`wrangler.relay.jsonc`](../../wrangler.relay.jsonc) to the web origin allowed to use your relay; separate several origins with commas. Deploy with `npx wrangler deploy --config wrangler.relay.jsonc` and set the account’s advanced `subscriptionRelayUrl` to the resulting HTTPS URL plus `/api/openai`. This also works with the hosted Harness.

This standalone Worker exposes only `GET /api/openai/models` and `POST /api/openai/responses`. It requires no OpenAI secret, database or KV binding. The browser supplies the short-lived access token for each request.
