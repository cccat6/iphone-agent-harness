# Hosting and deployment

The official site is [igent.cc](https://igent.cc). Self-hosting uses the clean `build/site` output under HTTPS. Private conversations, images and credentials remain browser-local; selected context goes directly to configured model services.

## Self-hosted page routing

Return `index.html` only for the document routes `/`, `/main`, `/skills` and `/flash`, or their equivalents under a chosen base path. Missing scripts/assets must remain true 404s. `/api/skills` is JSON, not a user page. The included Worker and local preview implement these rules; another host needs equivalent routing.

Phone/tablet entry opens Harness, while desktop entry opens the homepage. Phone screen sharing needs HTTPS. Local bridge setup uses its separate HTTP manager; normal control uses WebRTC Direct. Model/MCP endpoints require browser CORS and reachable HTTPS.

## Optional public skill API

Static hosting alone does not accept publication writes. Configure the included Worker/D1 API or another compatible service, or leave community publishing disabled. The official client base is `https://igent.cc/api`; signatures use the exact site origin as audience. Allow only configured browser origins. The API stores explicit public packages, signatures and revisions, not conversations, model credentials or screenshots.

Browser data belongs to its origin: moving hosts requires explicit export/import, including a separate encrypted creator-identity backup for authorship. Never embed API keys, local configuration or private user data in a static build.

## Releases

Normal pushes do not start GitHub Actions. An explicitly requested [manual release](manual-release.md) validates source, reuses or builds all declared firmware profiles, publishes release assets, includes the same binaries in the site, deploys and verifies served files. Configure required deployment credentials before dispatch. A deployment success is not physical-phone acceptance.
