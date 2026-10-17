// Credentials are deliberately separate from persistent UI settings and exports.
const values = new Map();
export function setCredential(providerId, secret) {
  if (!providerId) throw new Error('缺少后端标识');
  if (secret) values.set(providerId, String(secret)); else values.delete(providerId);
}
export function getCredential(providerId) { return values.get(providerId) || ''; }
export function hasCredential(providerId) { return values.has(providerId); }
export function clearCredentials() { values.clear(); }
