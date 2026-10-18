# igent.cc deployment

The official site for **iPhone Agent Harness** is [igent.cc](https://igent.cc). This document records the official Cloudflare deployment and separates executed checks from remaining physical acceptance.

## Components and data

- **Static Web:** publishes the clean `build/site` output at `https://igent.cc`. On iPhone/iPad it opens the Harness; desktop users get the project home, community and ESP32 setup pages.
- **Local private data:** conversations, attachments and settings remain in the user's browser. Credentials are memory-only by default, with optional encrypted local storage and explicit unlock. Selected context and images still go directly to the AI backend the user configures.
- **Optional public Skill API:** it uses the official site path `https://igent.cc/api/skills`; the client base URL is `https://igent.cc/api`. No separate Skill subdomain is used. It stores only Skills the user explicitly publishes, together with public ownership proofs and version metadata. It does not store private sessions, model credentials or phone captures. The signature audience remains `https://igent.cc`, without the `/api` prefix. Route `/api/*` to the Skill handler and keep the precise site origin in its allowlist; static hosting alone does not implement uploads.

Browser storage is origin-specific. Data on an earlier development hostname does not automatically appear on igent.cc; users need an explicit export/import or supported migration. A brand change does not change protocol identifiers, database keys or the existing Arduino source directory.

## Deployment acceptance

| Check | Verified result |
|---|---|
| Cloudflare deployment and version | Live single Worker `igent-web`; exact version recorded in release acceptance |
| igent.cc DNS and HTTPS certificate | Real HTTPS requests succeeded with certificate validation; HTTP redirects to HTTPS |
| Root page, modules and static assets | `/`, `/main`, `/skills`, `/flash` return HTML; missing modules return 404 |
| iPhone/iPad and desktop entry routing | Native desktop Safari root goes to `/main`; iOS 26.4 UA root shows mandatory gate. Actual latest iPhone product flow remains separate |
| Eight-language selection and navigation | Locale tests and native browser dialog switching passed; user text stays unchanged |
| Public Skill API endpoint and allowed origin | `/api/skills` live; exact-origin preflight and signed publish/download/version checks passed; disposable test revisions removed |
| Local session persistence and reload | Store/browser checks recorded in `harness-ui-verification.md`; does not guarantee iOS never evicts storage |
| No local secrets or test artifacts in build | Build allowlist excludes research, local files and backend source; final release also scans known local secrets |

A successful static deployment does not validate Safari-to-LAN control, real Codex subscription login, physical ESP32 gestures or indefinite background execution. Those retain their separate acceptance requirements.

Live service evidence: [deployment-verification.json](../research/deployment-verification.json). The site uses `/` for Harness, `/main` for home, `/skills` for the public page and `/flash` for desktop firmware setup. `/api/skills` is a JSON endpoint, not a user page.

## Self-hosted page routing

Serve the contents of `build/site` under HTTPS. The host must return `index.html` for the explicit document routes `/`, `/main`, `/skills` and `/flash` (or the equivalent paths below a chosen base directory), while missing scripts and other assets remain true 404s. Do not use an unconditional HTML fallback for every path. The included Cloudflare Worker and local preview implement these rules; an arbitrary static host needs equivalent routing configuration. Uploading files alone does not establish that direct links and reloads on clean routes work. A community write service is optional and configured separately; browser access to model/device services still requires their TLS and CORS support.

## Manual publication policy

Ordinary pushes no longer run GitHub Actions. The owner must explicitly request each release. The [manual release workflow](manual-release.md) selects or compiles four firmware profiles, publishes their binaries to GitHub Releases, includes the same bytes in the website, deploys Cloudflare and verifies served files. Its new execution is separate from the historical acceptance evidence above; the required Cloudflare repository secret must first be provisioned.
