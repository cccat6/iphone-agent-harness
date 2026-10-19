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
