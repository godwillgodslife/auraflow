import { createAiAssistResponse } from '../../src/server/ai-assist.js';

async function readRequestBody(req) {
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
      headers: {
        'content-type': 'application/json; charset=utf-8'
      }
    });
  }

  const body = await readRequestBody(req);
  const result = await createAiAssistResponse(body, {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GEMINI_MODEL: process.env.GEMINI_MODEL || ''
  });
  return new Response(result.body, {
    status: result.statusCode || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
};
