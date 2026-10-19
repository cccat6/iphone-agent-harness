# Skill community API

The community at `https://igent.cc/skills` uses `/api/skills` to list, publish and update skills. The API runs in the root Cloudflare Worker with D1 storage; its routes and tables are defined here.

A published skill contains its content, version and author signature. The server checks the signature and saves the new version. Conversations and model credentials stay in the browser.

## Endpoints

| Method and path | Result |
|---|---|
| `GET /api/skills?limit=30&cursor=…` | Latest version of each skill; follow the returned cursor for more results |
| `GET /api/skills/{creatorId}/{slug}` | Latest published package and its revision metadata |
| `POST /api/skills` | Publish a signed skill package or a newer version |

Publication uses a JSON object with `publicKey`, `payload` and `signature`. The payload contains the skill package, author ID, target origin, timestamps, nonce and previous revision. [CommunityClient.publish](../community/client.js) constructs the request; [verifyEnvelope](../community/common.js) defines its fields and validation. The database keeps earlier revisions; the read endpoints return the latest version.

See [skill publishing](../../../docs/architecture/skill-community.md) for ownership and update behavior.

Run the API tests with:

```sh
node --test tests/web/community.test.mjs
```
