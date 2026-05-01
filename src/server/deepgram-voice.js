import { createAiAssistResponse } from './ai-assist.js';

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function clampNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDeepgramConfig(runtimeEnv = {}) {
  return {
    apiKey: firstNonEmpty(runtimeEnv.DEEPGRAM_API_KEY, process.env.DEEPGRAM_API_KEY),
    sttModel: firstNonEmpty(runtimeEnv.DEEPGRAM_MODEL, process.env.DEEPGRAM_MODEL, 'nova-2-phonecall'),
    auraModel: firstNonEmpty(runtimeEnv.DEEPGRAM_AURA_MODEL, process.env.DEEPGRAM_AURA_MODEL, 'aura-2-thalia-en'),
    language: firstNonEmpty(runtimeEnv.DEEPGRAM_LANGUAGE, process.env.DEEPGRAM_LANGUAGE, 'en'),
    fillerDelayMs: Math.max(250, clampNumber(firstNonEmpty(runtimeEnv.DEEPGRAM_FILLER_DELAY_MS, process.env.DEEPGRAM_FILLER_DELAY_MS, '1500'), 1500))
  };
}

export function hasDeepgramConfig(runtimeEnv = {}) {
  return Boolean(getDeepgramConfig(runtimeEnv).apiKey);
}

async function deepgramFetch(url, { method = 'POST', headers = {}, body } = {}, runtimeEnv = {}) {
  const config = getDeepgramConfig(runtimeEnv);
  if (!config.apiKey) {
    throw new Error('DEEPGRAM_API_KEY is not configured.');
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Token ${config.apiKey}`,
      ...headers
    },
    body
  });
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const text = buffer.toString('utf8');

  if (!response.ok) {
    throw new Error(text || `Deepgram request failed with ${response.status}`);
  }

  return {
    response,
    buffer,
    text
  };
}

function buildDeepgramListenUrl({ model = '', language = 'en' } = {}) {
  const params = new URLSearchParams({
    model,
    smart_format: 'true',
    sentiment: 'true',
    summarize: 'v2',
    language
  });
  return `https://api.deepgram.com/v1/listen?${params.toString()}`;
}

function buildDeepgramReadUrl({ language = 'en' } = {}) {
  const params = new URLSearchParams({
    sentiment: 'true',
    summarize: 'v2',
    language
  });
  return `https://api.deepgram.com/v1/read?${params.toString()}`;
}

function normalizeTranscript(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function extractTranscriptFromResults(results = {}) {
  const channel = Array.isArray(results.channels) ? results.channels[0] : null;
  const alternative = channel && Array.isArray(channel.alternatives) ? channel.alternatives[0] : null;
  return normalizeTranscript(alternative?.transcript || '');
}

function extractSummaryFromResults(results = {}) {
  if (results?.summary?.result === 'success' && results?.summary?.short) {
    return normalizeTranscript(results.summary.short);
  }
  return normalizeTranscript(results?.summary?.short || '');
}

function extractSentiment(results = {}) {
  const average = results?.sentiments?.average || {};
  return {
    sentiment: String(average?.sentiment || '').trim().toLowerCase() || 'neutral',
    sentimentScore: clampNumber(average?.sentiment_score, 0),
    segments: Array.isArray(results?.sentiments?.segments) ? results.sentiments.segments.slice(0, 6) : []
  };
}

export async function analyzeVoiceAudio(
  {
    audioUrl = '',
    audioBase64 = '',
    mimeType = 'audio/wav',
    language = '',
    model = ''
  } = {},
  runtimeEnv = {}
) {
  const config = getDeepgramConfig(runtimeEnv);
  const resolvedModel = firstNonEmpty(model, config.sttModel);
  const resolvedLanguage = firstNonEmpty(language, config.language);
  const url = buildDeepgramListenUrl({ model: resolvedModel, language: resolvedLanguage });

  let request;
  if (audioUrl) {
    request = deepgramFetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: audioUrl })
      },
      runtimeEnv
    );
  } else if (audioBase64) {
    request = deepgramFetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': mimeType || 'audio/wav'
        },
        body: Buffer.from(audioBase64, 'base64')
      },
      runtimeEnv
    );
  } else {
    throw new Error('Provide audioUrl or audioBase64 for Deepgram audio analysis.');
  }

  const { text } = await request;
  const payload = text ? JSON.parse(text) : {};
  const results = payload?.results || {};
  const transcript = extractTranscriptFromResults(results);
  const summary = extractSummaryFromResults(results);
  const sentiment = extractSentiment(results);

  return {
    transcript,
    summary: summary || transcript,
    sentiment: sentiment.sentiment,
    sentimentScore: sentiment.sentimentScore,
    sentimentSegments: sentiment.segments,
    provider: 'deepgram',
    sourceType: 'audio',
    requestId: payload?.metadata?.request_id || '',
    model: resolvedModel,
    raw: payload
  };
}

export async function analyzeVoiceText(
  {
    text = '',
    language = 'en'
  } = {},
  runtimeEnv = {}
) {
  const normalizedText = normalizeTranscript(text);
  if (!normalizedText) {
    throw new Error('Text is required for transcript analysis.');
  }

  const { text: responseText } = await deepgramFetch(
    buildDeepgramReadUrl({ language }),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: normalizedText })
    },
    runtimeEnv
  );
  const payload = responseText ? JSON.parse(responseText) : {};
  const results = payload?.results || {};
  const summary = extractSummaryFromResults(results);
  const sentiment = extractSentiment(results);

  return {
    transcript: normalizedText,
    summary: summary || normalizedText,
    sentiment: sentiment.sentiment,
    sentimentScore: sentiment.sentimentScore,
    sentimentSegments: sentiment.segments,
    provider: 'deepgram',
    sourceType: 'text',
    requestId: payload?.metadata?.request_id || '',
    model: 'text-intelligence',
    raw: payload
  };
}

export function buildVoiceNoteFromAnalysis(
  {
    workspaceId = '',
    contactId = '',
    voiceProfileId = '',
    voiceSessionId = '',
    title = '',
    body = '',
    status = 'analyzed',
    audioUrl = '',
    metadata = {}
  } = {},
  analysis = {}
) {
  const transcript = normalizeTranscript(analysis?.transcript || body);
  const summary = normalizeTranscript(analysis?.summary || transcript);
  const sentiment = String(analysis?.sentiment || '').trim().toLowerCase() || 'neutral';
  const sentimentScore = clampNumber(analysis?.sentimentScore, 0);

  return {
    workspace_id: workspaceId,
    contact_id: contactId || null,
    voice_profile_id: voiceProfileId || null,
    voice_session_id: voiceSessionId || null,
    title: firstNonEmpty(title, summary.slice(0, 72), 'Voice note'),
    body: summary || transcript,
    transcript,
    summary,
    sentiment,
    sentiment_score: sentimentScore,
    status,
    source_provider: 'deepgram',
    audio_source_url: audioUrl || null,
    metadata: {
      ...(metadata || {}),
      deepgram: {
        provider: 'deepgram',
        source_type: analysis?.sourceType || 'audio',
        model: analysis?.model || '',
        request_id: analysis?.requestId || '',
        sentiment_segments: Array.isArray(analysis?.sentimentSegments) ? analysis.sentimentSegments : [],
        summary_result: analysis?.raw?.results?.summary || null,
        sentiment_average: analysis?.raw?.results?.sentiments?.average || null
      }
    }
  };
}

export async function synthesizeAuraSpeech(
  {
    text = '',
    model = '',
    encoding = 'mp3'
  } = {},
  runtimeEnv = {}
) {
  const config = getDeepgramConfig(runtimeEnv);
  const resolvedText = normalizeTranscript(text);
  if (!resolvedText) {
    throw new Error('Text is required for Aura TTS.');
  }

  const params = new URLSearchParams({
    model: firstNonEmpty(model, config.auraModel),
    encoding
  });
  const { response, buffer } = await deepgramFetch(
    `https://api.deepgram.com/v1/speak?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: resolvedText })
    },
    runtimeEnv
  );

  return {
    model: firstNonEmpty(model, config.auraModel),
    mimeType: response.headers.get('content-type') || 'audio/mpeg',
    audioBase64: buffer.toString('base64'),
    text: resolvedText
  };
}

function pickLocalFillerPhrase() {
  const options = [
    'One moment, let me check that for you.',
    'Please hold on small, let me confirm that.',
    'Let me check that quickly for you.'
  ];
  const index = Math.floor(Date.now() / 1000) % options.length;
  return options[index];
}

export async function createVoiceAgentTurnResponse(body = {}, runtimeEnv = {}) {
  const config = getDeepgramConfig(runtimeEnv);
  const startTime = Date.now();
  const aiPromise = createAiAssistResponse({
    ...body,
    mode: body.mode || 'reply'
  }, runtimeEnv);

  let filler = null;
  let aiResponse = null;

  const race = await Promise.race([
    aiPromise.then((result) => ({ result })),
    new Promise((resolve) => setTimeout(() => resolve({ delayed: true }), config.fillerDelayMs))
  ]);

  if (race?.delayed) {
    const fillerText = pickLocalFillerPhrase();
    let fillerAudio = null;
    if (hasDeepgramConfig(runtimeEnv)) {
      fillerAudio = await synthesizeAuraSpeech({ text: fillerText }, runtimeEnv).catch(() => null);
    }
    filler = {
      text: fillerText,
      audio: fillerAudio
    };
    aiResponse = await aiPromise;
  } else {
    aiResponse = race.result;
  }

  const durationMs = Date.now() - startTime;
  let parsedBody = {};
  try {
    parsedBody = aiResponse?.body ? JSON.parse(aiResponse.body) : {};
  } catch {
    parsedBody = {};
  }
  const replyText = firstNonEmpty(parsedBody.reply, parsedBody.output);
  let replyAudio = null;

  if (replyText && hasDeepgramConfig(runtimeEnv)) {
    replyAudio = await synthesizeAuraSpeech({ text: replyText }, runtimeEnv).catch(() => null);
  }

  return {
    statusCode: aiResponse?.statusCode || 200,
    body: JSON.stringify({
      ...parsedBody,
      provider: 'deepgram',
      responseDurationMs: durationMs,
      filler,
      audio: replyAudio
    })
  };
}
