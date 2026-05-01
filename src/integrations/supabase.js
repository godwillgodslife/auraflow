const DEFAULT_TABLES = {
  conversations: 'conversations',
  messages: 'messages',
  contacts: 'contacts',
  channels: 'channels',
  agent_settings: 'agent_settings',
  follow_up_sequences: 'follow_up_sequences',
  automation_rules: 'automation_rules',
  integrations: 'integrations',
  activity_events: 'activity_events',
  reliability_events: 'reliability_events',
  voice_profiles: 'voice_profiles',
  voice_sessions: 'voice_sessions',
  voice_notes: 'voice_notes',
  workspace_members: 'workspace_members'
};

export function getSupabaseConfig() {
  const config = window.__AURAFLOW_CONFIG__ || {};
  return {
    url: config.supabaseUrl || '',
    anonKey: config.supabaseAnonKey || '',
    schema: config.supabaseSchema || 'public',
    tables: { ...DEFAULT_TABLES, ...(config.supabaseTables || {}) }
  };
}

export function hasSupabaseConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

function supabaseHeaders(anonKey) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    'Accept-Profile': 'public',
    'Content-Profile': 'public'
  };
}

async function queryTable(table, { select = '*', order = null, limit = null, filters = {} } = {}) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return { data: [], error: new Error('Supabase is not configured') };
  }

  const endpoint = new URL(`${url.replace(/\/$/, '')}/rest/v1/${table}`);
  endpoint.searchParams.set('select', select);

  if (order) {
    endpoint.searchParams.set('order', `${order.column}.${order.ascending === false ? 'desc' : 'asc'}`);
  }

  if (limit) {
    endpoint.searchParams.set('limit', String(limit));
  }

  for (const [key, value] of Object.entries(filters)) {
    endpoint.searchParams.set(key, value);
  }

  const response = await fetch(endpoint, {
    headers: supabaseHeaders(anonKey)
  });

  if (!response.ok) {
    const text = await response.text();
    return { data: [], error: new Error(text || `Supabase request failed with ${response.status}`) };
  }

  return { data: await response.json(), error: null };
}

export async function loadSupabaseSnapshot() {
  const config = getSupabaseConfig();

  if (!hasSupabaseConfig()) {
    return {
      source: 'demo',
      connected: false,
      channels: [],
      conversations: [],
      contacts: [],
      trainingSources: [],
      agentSettings: null,
      sequences: [],
      automationRules: [],
      integrations: []
    };
  }

  const [channels, conversations, contacts, trainingSources, agentSettings, sequences, automationRules, integrations] = await Promise.all([
    queryTable(config.tables.channels, { order: { column: 'created_at', ascending: false }, limit: 12 }),
    queryTable(config.tables.conversations, { order: { column: 'updated_at', ascending: false }, limit: 25 }),
    queryTable(config.tables.contacts, { order: { column: 'updated_at', ascending: false }, limit: 25 }),
    queryTable(config.tables.training_sources, { order: { column: 'updated_at', ascending: false }, limit: 25 }),
    queryTable(config.tables.agent_settings, { limit: 1 }),
    queryTable(config.tables.follow_up_sequences, { order: { column: 'updated_at', ascending: false }, limit: 25 }),
    queryTable(config.tables.automation_rules, { order: { column: 'updated_at', ascending: false }, limit: 25 }),
    queryTable(config.tables.integrations, { order: { column: 'updated_at', ascending: false }, limit: 25 })
  ]);

  const [messages, activityEvents, reliabilityEvents, voiceProfiles, voiceSessions, voiceNotes, members] = await Promise.all([
    queryTable(config.tables.messages, { order: { column: 'created_at', ascending: false }, limit: 50 }),
    queryTable(config.tables.activity_events, { order: { column: 'created_at', ascending: false }, limit: 50 }),
    queryTable(config.tables.reliability_events, { order: { column: 'created_at', ascending: false }, limit: 25 }),
    queryTable(config.tables.voice_profiles, { order: { column: 'updated_at', ascending: false }, limit: 10 }),
    queryTable(config.tables.voice_sessions, { order: { column: 'updated_at', ascending: false }, limit: 10 }),
    queryTable(config.tables.voice_notes, { order: { column: 'updated_at', ascending: false }, limit: 10 }),
    queryTable(config.tables.workspace_members, { order: { column: 'created_at', ascending: false }, limit: 10 })
  ]);

  return {
    source: 'supabase',
    connected: true,
    channels: channels.data,
    conversations: conversations.data,
    contacts: contacts.data,
    trainingSources: trainingSources.data,
    agentSettings: agentSettings.data?.[0] || null,
    sequences: sequences.data,
    automationRules: automationRules.data,
    integrations: integrations.data,
    messages: messages.data,
    activityEvents: activityEvents.data,
    reliabilityEvents: reliabilityEvents.data,
    voiceProfiles: voiceProfiles.data,
    voiceSessions: voiceSessions.data,
    voiceNotes: voiceNotes.data,
    members: members.data
  };
}
