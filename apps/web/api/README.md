# Skill community API

The community at `https://igent.cc/skills` uses `/api/skills` to list, publish and update skills. The API runs in the root Cloudflare Worker with D1 storage; its routes and tables are defined here.

A published skill contains its content, version and author signature. The server checks the signature and saves the new version. Conversations and model credentials stay in the browser.

See [skill publishing](../../../docs/architecture/skill-community.md) for the request format and ownership rules.

Run the API tests with:

```sh
node --test tests/web/community.test.mjs
```
