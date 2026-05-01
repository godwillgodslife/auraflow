import { createVoiceSessionRecord } from '../../src/server/twilio-voice-live.js';

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

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const body = await readJsonBody(req);
    const result = await createVoiceSessionRecord(body, process.env);
    return new Response(JSON.stringify({
      session: result.session,
      localCallState: 'dialing',
      relayUrl: result.relayUrl,
      twimlUrl: result.twimlUrl
    }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Failed to start softphone call session.' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
};
