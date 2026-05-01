import { getIngestContract, hasSupabaseAdminConfig, ingestProviderPayload, validateIngestSecret } from '../../src/integrations/supabase-admin.js';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'GET') {
    return json(200, {
      ok: true,
      configured: hasSupabaseAdminConfig(),
      contract: getIngestContract()
    });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!validateIngestSecret(event.headers || {})) {
    return json(401, { error: 'Invalid ingest secret' });
  }

  if (!hasSupabaseAdminConfig()) {
    return json(500, { error: 'Supabase admin config is missing' });
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  try {
    const result = await ingestProviderPayload(body);
    return json(200, result);
  } catch (error) {
    return json(500, { error: error?.message || 'Provider ingestion failed' });
  }
};
