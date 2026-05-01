import { renderTwilioVoiceTwiML } from '../../src/server/twilio-voice-live.js';

function collectParams(req) {
  if (req?.method === 'GET' && req?.url) {
    const url = new URL(req.url);
    return Object.fromEntries(url.searchParams.entries());
  }
  if (typeof req?.body === 'string') {
    const params = new URLSearchParams(req.body);
    return Object.fromEntries(params.entries());
  }
  return {};
}

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const body = collectParams(req);
    const origin = req?.headers?.get?.('x-forwarded-proto') && req?.headers?.get?.('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('x-forwarded-host')}`
      : (req?.headers?.get?.('origin') || process.env.URL || '');
    const twiml = renderTwilioVoiceTwiML(body, process.env, origin);
    return new Response(twiml, {
      status: 200,
      headers: {
        'content-type': 'text/xml; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Failed to render Twilio Voice TwiML.' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
};
