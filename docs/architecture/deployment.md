# Official website deployment

The official site is [igent.cc](https://igent.cc). Worker `igent-web` serves the static website and the public skill API. The D1 binding and routes are defined in [wrangler.jsonc](../../wrangler.jsonc).

## Routes

| Route | Content |
|---|---|
| `/` | Harness on iPhone/iPad; homepage on desktop |
| `/main` | Homepage and setup links |
| `/skills` | Skill community |
| `/flash` | Browser firmware installer |
| `/api/skills` | Public skill packages and publication API |

Document routes return `index.html`. Missing assets return 404. `build/site` contains the complete website, firmware manifest and precompiled binary parts.

## Publishing a release

Use the [manual release workflow](manual-release.md). It checks the source, selects matching firmware, builds the site, applies the community schema, deploys the Worker and verifies served files against the build.

The workflow reads `CLOUDFLARE_API_TOKEN` from repository secrets. Ordinary pushes and pull requests leave the deployed site unchanged. Production deployments run one at a time.

The public skill API stores published packages, signatures and revisions. Conversations, screen images and model credentials remain in the user's browser; selected task context goes directly to the configured model service.
