# Skill ownership and public publishing

The public Skills page works on desktop and phone. It supports reading builtins, downloading community packages, creating/editing owned skills and explicit publication. The browser stores owned skills and installed packages locally.

| Source | Local use | Publishing |
|---|---|---|
| Builtin | Read-only installation | Published by the project |
| Authored by current identity | Editable | Publish from the authoring interface |
| Downloaded community package | Read-only installation | Updates come from its author |

The browser generates a WebCrypto P-256 identity and derives creator ID from its public key. The identity associates published skills with this browser. Export an encrypted identity backup and restore it explicitly to continue ownership in another browser. Losing both browser data and backup loses that identity.

Publishing sends only the chosen package, public key, signature and revision metadata. The private identity key, conversations, model credentials and screenshots stay in browser storage. The server verifies signatures, audience, expiry, nonce and conditional previous revision; published revisions are immutable. Downloads verify identity, signature, digest and revision before becoming read-only local installs.

Bundles support relative Markdown/JSON resources within the package. Refresh checks unchanged installed downloads; failed updates preserve the active version and existing enable state. Author drafts remain under the creator’s control.

The official API is `/api/skills` on igent.cc. The included Worker handles publication writes. Published packages and their revision history are available from that API.

[API implementation](../../apps/web/api/README.md) · [Skills](skills.md)
