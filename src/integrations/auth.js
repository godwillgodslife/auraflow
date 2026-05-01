export function getAuthState() {
  const config = window.__AURAFLOW_CONFIG__ || {};
  return {
    supabaseUrl: config.supabaseUrl || '',
    supabaseAnonKey: config.supabaseAnonKey || '',
    workspaceId: window.localStorage.getItem('auraflow.workspaceId') || '',
    sessionEmail: window.localStorage.getItem('auraflow.sessionEmail') || '',
    accessToken: window.localStorage.getItem('auraflow.accessToken') || '',
    refreshToken: window.localStorage.getItem('auraflow.refreshToken') || ''
  };
}

export function hasAuthConfig() {
  const { supabaseUrl, supabaseAnonKey } = getAuthState();
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function saveWorkspaceContext({ workspaceId, sessionEmail }) {
  if (workspaceId) window.localStorage.setItem('auraflow.workspaceId', workspaceId);
  if (sessionEmail) window.localStorage.setItem('auraflow.sessionEmail', sessionEmail);
}

export function saveAccessToken(accessToken) {
  if (accessToken) window.localStorage.setItem('auraflow.accessToken', accessToken);
}

export function saveRefreshToken(refreshToken) {
  if (refreshToken) window.localStorage.setItem('auraflow.refreshToken', refreshToken);
}

export function clearWorkspaceContext() {
  window.localStorage.removeItem('auraflow.workspaceId');
  window.localStorage.removeItem('auraflow.sessionEmail');
  window.localStorage.removeItem('auraflow.accessToken');
  window.localStorage.removeItem('auraflow.refreshToken');
}
