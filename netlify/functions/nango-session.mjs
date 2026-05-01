export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const secret = process.env.NANGO_SECRET_KEY;
  const baseUrl = process.env.NANGO_BASE_URL;

  if (!secret || !baseUrl) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ error: 'Nango is not configured' })
    };
  }

  const body = event.body ? JSON.parse(event.body) : {};
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/connect/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      end_user: body.end_user || body.endUser || { id: body.workspaceId || 'auraflow-netlify', display_name: body.displayName || 'AuraFlow User' },
      allowed_integrations: body.allowed_integrations || body.allowedIntegrations || [],
      expires_in: body.expires_in || body.expiresIn || 3600
    })
  });

  return {
    statusCode: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: await response.text()
  };
};
