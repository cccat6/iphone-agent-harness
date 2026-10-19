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
const apiSecret = record => record?.kind === 'api' && typeof record.apiKey === 'string' && record.apiKey.trim() ? record.apiKey : '';
// A configured profile is not proof that a credential was ever persisted. Older
// versions kept keys only in page memory unless the owner enabled encryption.
// Inspect only this profile's record: accountId belongs to subscription metadata
// and must never be used to borrow another API profile's key.
export async function inspectProviderCredential(store, profile, {settings, accountReady = false} = {}) {
  if (!profile?.id) return {status:'missing',ready:false,messageKey:'providerCredential.missing'};
  let record;
  try { record = await store.getLocalCredential(localId(profile.id)); }
  catch { return {status:'unavailable',ready:false,messageKey:'providerCredential.unavailable'}; }
  const codex = profile.protocol === 'codex';
  const persisted = codex ? record?.kind === 'codex' && typeof record.tokens?.access_token === 'string' && Boolean(record.tokens.access_token.trim()) : Boolean(apiSecret(record));
  if (persisted) return {status:'saved',ready:true,messageKey:'providerCredential.saved'};
  if (codex ? accountReady : hasCredential(profile.id)) return {status:'temporary',ready:true,messageKey:'providerCredential.temporary'};
  let saved = settings;
  try { if (!saved) saved = await store.getSettings(); }
  catch { return {status:'unavailable',ready:false,messageKey:'providerCredential.unavailable'}; }
  return saved?.credentialVault?.[profile.id]
    ? {status:'locked',ready:false,messageKey:'providerCredential.locked'}
    : {status:'missing',ready:false,messageKey:'providerCredential.missing'};
}
// API profiles own their key by profile ID. accountId is subscription metadata
// and can be left over when a profile previously used another sign-in method.
export async function resolveProviderCredential(store, profile, {settings, requireCredential} = {}) {
  if (profile?.protocol === 'codex') return '';
  if (!profile?.id) throw credentialError('PROVIDER_CREDENTIAL_MISSING');
  let secret = getCredential(profile.id);
  if (!secret && typeof store?.getLocalCredential === 'function') {
    const record = await store.getLocalCredential(localId(profile.id));
    if (apiSecret(record)) {
      secret = apiSecret(record);
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
      else if (profile.protocol !== 'codex' && apiSecret(record)) setCredential(profile.id, apiSecret(record));
    } catch (error) { onError(error, profile); }
  }
}
