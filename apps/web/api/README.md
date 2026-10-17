# Optional Skill community API

Part of the Web product. The official deployment is `https://igent.cc/api/skills`, using the root Worker and D1 configuration in the repository root. The static frontend also works locally without this API.

Set your own Worker name, D1 database ID and exact static-site origins in the repository-root `wrangler.jsonc`; apply `schema.sql` to that database before deployment. The example contains placeholders and no credentials. The operator must configure their own rate limits and moderation policy before a public launch.

The module exports a standard Worker fetch handler. It stores only explicitly published signed Skill packages and version metadata. It has no session, model-key, screen-capture or device-control endpoint. See [`docs/architecture/skill-community.md`](../../../docs/architecture/skill-community.md) for signature and ownership rules.

Offline verification: `node --test tests/web/community.test.mjs`. This uses actual SQLite SQL and WebCrypto; it does not deploy the Worker or emulate all Cloudflare behavior.
