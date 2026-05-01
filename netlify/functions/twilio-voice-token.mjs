import { createTwilioVoiceAccessToken } from '../../src/server/twilio-voice-live.js';

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
    const token = await createTwilioVoiceAccessToken(body, process.env);
    return new Response(JSON.stringify(token), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Failed to create Twilio Voice token.' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
};
