// Credentials are deliberately separate from persistent UI settings and exports.
const values = new Map();
export function setCredential(providerId, secret) {
  if (!providerId) throw new Error('缺少后端标识');
  if (secret) values.set(providerId, String(secret)); else values.delete(providerId);
}
export function getCredential(providerId) { return values.get(providerId) || ''; }
export function hasCredential(providerId) { return values.has(providerId); }
export function clearCredentials() { values.clear(); }

// Browser-local records are separate from settings and all session exports.
const localId = id => 'provider:' + id;
const credentialError = code => Object.assign(new Error(code), {code});
// API profiles own their key by profile ID. accountId is subscription metadata
// and can be left over when a profile previously used another sign-in method.
export async function resolveProviderCredential(store, profile, {settings, requireCredential} = {}) {
  if (profile?.protocol === 'codex') return '';
  if (!profile?.id) throw credentialError('PROVIDER_CREDENTIAL_MISSING');
  let secret = getCredential(profile.id);
  if (!secret && typeof store?.getLocalCredential === 'function') {
    const record = await store.getLocalCredential(localId(profile.id));
    if (record?.kind === 'api' && typeof record.apiKey === 'string' && record.apiKey.trim()) {
      secret = record.apiKey;
      setCredential(profile.id, secret);
    }
  }
  if (secret) return secret;
  // Never discard or silently overwrite an old encrypted record. Its passphrase
  // was never persisted, so it needs a one-time explicit recovery by its owner.
  const saved = settings || (typeof store?.getSettings === 'function' ? await store.getSettings() : {});
  if (saved?.credentialVault?.[profile.id]) throw credentialError('PROVIDER_CREDENTIAL_LOCKED');
  let authenticatedHost=false;try{authenticatedHost=['api.openai.com','api.deepseek.com','api.anthropic.com'].includes(new URL(profile.baseUrl).hostname);}catch{}
  if (requireCredential ?? authenticatedHost) throw credentialError('PROVIDER_CREDENTIAL_MISSING');
  return '';
}
export async function saveProviderCredential(store, id, value) {
  if (!id || !value || !['api', 'codex'].includes(value.kind)) throw new Error('Invalid provider credential');
  await store.saveLocalCredential(localId(id), structuredClone(value));
  if (value.kind === 'api') setCredential(id, value.apiKey || '');
}
export async function removeProviderCredential(store, id) {
  await store.deleteLocalCredential(localId(id)); setCredential(id, '');
}
export async function restoreProviderCredentials(store, profiles, {registerAccount = () => {}, onError = () => {}} = {}) {
  for (const profile of profiles || []) {
    try {
      const record = await store.getLocalCredential(localId(profile.id));
      if (profile.protocol === 'codex' && record?.kind === 'codex') registerAccount(profile.id, record.tokens);
      else if (profile.protocol !== 'codex' && record?.kind === 'api') setCredential(profile.id, record.apiKey || '');
    } catch (error) { onError(error, profile); }
  }
}
