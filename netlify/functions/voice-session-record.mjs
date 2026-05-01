import { patchVoiceSessionRecord } from '../../src/server/twilio-voice-live.js';

export const config = {
  path: '/api/voice-sessions/:id'
};

async function readJsonBody(req) {
  if (!req) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  if (typeof req.json === 'function') {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
  return {};
}

export default async (req, context) => {
  if (req.method !== 'PATCH') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const url = req?.url ? new URL(req.url) : null;
    const id = context?.params?.id || url?.searchParams?.get?.('id') || '';
    const body = await readJsonBody(req);
    const record = await patchVoiceSessionRecord(id, body, process.env);
    return new Response(JSON.stringify(record), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Failed to update voice session.' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
};
