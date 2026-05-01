export function getNangoConfig() {
  const config = window.__AURAFLOW_CONFIG__ || {};
  return {
    baseUrl: config.nangoBaseUrl || '',
    connectUrl: config.nangoConnectUrl || '',
    publicKey: config.nangoPublicKey || ''
  };
}

export function hasNangoConfig() {
  const { baseUrl } = getNangoConfig();
  return Boolean(baseUrl);
}

export async function createConnectSession(payload = {}) {
  const response = await fetch('/.netlify/functions/nango-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Nango session request failed with ${response.status}`);
  }

  return text ? JSON.parse(text) : {};
}

export async function getChannelStatus() {
  if (!hasNangoConfig()) {
    return {
      source: 'local',
      connected: false,
      providers: []
    };
  }

  const response = await fetch('/.netlify/functions/provider-readiness', {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    return {
      source: 'local',
      connected: false,
      providers: [],
      error: `Provider readiness failed with ${response.status}`
    };
  }

  return {
    source: 'local',
    connected: true,
    providers: await response.json()
  };
}

export function buildConnectUrl(provider, workspaceId) {
  const { connectUrl } = getNangoConfig();
  if (!connectUrl) return '';
  const url = new URL(connectUrl);
  url.searchParams.set('provider', provider);
  if (workspaceId) url.searchParams.set('workspace_id', workspaceId);
  return url.toString();
}
