async function authRequest(path, options = {}) {
  const response = await fetch(`/api/auth/${path}`, { ...options, cache: 'no-store', credentials: 'same-origin' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Authentication request failed.');
  return payload;
}
export async function loginUser(email, password) {
  return (await authRequest('login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).user;
}
export async function getSession() {
  const response = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' });
  if (response.status === 401) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not check server session.');
  return result.user;
}
export async function logoutUser() { await authRequest('logout', { method: 'POST' }); }
