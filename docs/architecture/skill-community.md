# Skill ownership and public publishing

The public Skills page works on desktop and phone. It supports reading builtins, downloading community packages, creating/editing owned skills and explicit publication. A local-only installation needs no publishing backend.

| Source | Editable locally | Directly publishable |
|---|---|---|
| Builtin | No | No |
| Authored by current identity | Yes | Only on explicit user action |
| Downloaded community package | No | No |

The browser generates a WebCrypto P-256 identity and derives creator ID from its public key. This is a publishing key identity, not a person, account, iOS UID or proof of originality. Export an encrypted identity backup and restore it explicitly to continue ownership in another browser. Losing both browser data and backup loses that identity.

Publishing sends only the chosen package, public key, signature and revision metadata. It never uploads the private identity key, conversation, model credential or screenshot. The server verifies signatures, audience, expiry, nonce and conditional previous revision; published revisions are immutable. Downloads verify identity, signature, digest and revision before becoming read-only local installs.

Bundles allow bounded relative Markdown/JSON resources, not scripts or path traversal. Refresh checks unchanged installed downloads; failed updates preserve the active version and existing enable state. Author drafts are not silently replaced.

The official API is `/api/skills` on igent.cc. Self-hosters may configure or disable a backend; a static host cannot receive publication writes by itself. Operators remain responsible for abuse prevention, quotas, moderation and lawful content. No full reporting/deletion/key-migration service is claimed.

[API implementation](../../apps/web/api/README.md) · [Skills](skills.md)
