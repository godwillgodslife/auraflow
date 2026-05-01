export const CORE_ENTITY_TYPES = {
  workspace: 'workspaces',
  member: 'workspace_members',
  contact: 'contacts',
  contactIdentity: 'contact_identities',
  conversation: 'conversations',
  message: 'messages',
  channel: 'channels',
  workspaceConnection: 'workspace_connections',
  agent: 'agents',
  followUpSequence: 'follow_up_sequences',
  followUpStep: 'follow_up_steps',
  trainingSource: 'training_sources',
  trainingDocument: 'training_documents',
  refundCase: 'refund_cases',
  activityEvent: 'activity_events',
  voiceProfile: 'voice_profiles',
  voiceSession: 'voice_sessions',
  voiceNote: 'voice_notes'
};

export const CORE_EVENT_TYPES = [
  'auth.session_created',
  'auth.workspace_bootstrapped',
  'conversation.created',
  'conversation.updated',
  'conversation.assigned',
  'conversation.escalated',
  'message.created',
  'message.updated',
  'message.delivered',
  'message.read',
  'message.failed',
  'channel.connected',
  'channel.reconnected',
  'agent.created',
  'agent.updated',
  'follow_up.sequence_saved',
  'training.source_added',
  'training.source_synced',
  'refund.created',
  'refund.approved',
  'refund.rejected',
  'voice.profile_created',
  'voice.session_queued',
  'voice.note_saved'
];

export const CORE_MODEL_FIELDS = {
  workspace: ['id', 'name', 'slug', 'plan', 'created_at', 'updated_at'],
  member: ['id', 'workspace_id', 'user_id', 'role', 'created_at', 'updated_at'],
  contact: ['id', 'workspace_id', 'source_provider', 'external_contact_id', 'name', 'email', 'phone', 'company', 'lead_stage', 'owner_name', 'tags', 'metadata', 'created_at', 'updated_at'],
  contactIdentity: ['id', 'workspace_id', 'contact_id', 'provider', 'provider_account_id', 'external_identity_id', 'external_thread_id', 'email', 'phone', 'display_name', 'metadata', 'last_seen_at', 'created_at', 'updated_at'],
  conversation: ['id', 'workspace_id', 'contact_id', 'source_provider', 'external_conversation_id', 'subject', 'status', 'priority', 'source', 'assigned_to', 'summary', 'last_message_at', 'created_at', 'updated_at'],
  message: ['id', 'workspace_id', 'conversation_id', 'source_provider', 'external_message_id', 'direction', 'sender_name', 'body', 'delivery_state', 'delivery_receipts', 'raw_payload', 'created_at', 'updated_at'],
  channel: ['id', 'workspace_id', 'provider', 'channel_type', 'display_name', 'status', 'provider_account_id', 'external_metadata', 'created_at', 'updated_at'],
  workspaceConnection: ['id', 'workspace_id', 'provider', 'connection_type', 'status', 'display_name', 'external_account_id', 'external_account_label', 'connection_metadata', 'credentials', 'scopes', 'token_expires_at', 'last_connected_at', 'last_refreshed_at', 'last_error_at', 'last_error_message', 'created_at', 'updated_at'],
  agent: ['id', 'workspace_id', 'name', 'tone', 'instructions', 'knowledge_sources', 'status', 'channel_config', 'created_at', 'updated_at'],
  followUpSequence: ['id', 'workspace_id', 'name', 'status', 'steps', 'replies', 'deliveries', 'next_run', 'steps_detail', 'created_at', 'updated_at'],
  activityEvent: ['id', 'workspace_id', 'entity_type', 'entity_id', 'event_type', 'payload', 'created_at', 'updated_at'],
  voiceProfile: ['id', 'workspace_id', 'name', 'label', 'voice_source', 'prompt_style', 'consent_status', 'is_default', 'created_at', 'updated_at'],
  voiceSession: ['id', 'workspace_id', 'contact_id', 'voice_profile_id', 'status', 'disclosure_text', 'session_type', 'outcome', 'analysis_status', 'analysis_summary', 'analysis_sentiment', 'analysis_metadata', 'created_at', 'updated_at'],
  voiceNote: ['id', 'workspace_id', 'contact_id', 'voice_profile_id', 'voice_session_id', 'title', 'body', 'transcript', 'summary', 'sentiment', 'sentiment_score', 'source_provider', 'audio_source_url', 'metadata', 'status', 'created_at', 'updated_at']
};

export const API_SURFACES = {
  auth: [
    'signInWithPassword',
    'signUpWithPassword',
    'getUser',
    'listWorkspaces',
    'createWorkspace',
    'createWorkspaceMember'
  ],
  inbox: [
    'loadWorkspaceSnapshot',
    'updateConversation',
    'createMessage',
    'createActivityEvent',
    'updateMessageState'
  ],
  messages: [
    'updateMessageState'
  ],
  channels: [
    'createChannel',
    'updateChannel',
    'createConnectSession',
    'getChannelStatus'
  ],
  connections: [
    'listWorkspaceConnections',
    'createWorkspaceConnection',
    'updateWorkspaceConnection',
    'startProviderOAuth'
  ],
  agents: [
    'createAgent',
    'updateAgent',
    'createAiAssist'
  ],
  voice: [
    'createVoiceProfile',
    'createVoiceSession',
    'createVoiceNote',
    'analyzeVoiceNote'
  ],
  ai: [
    'requestAiReply',
    'requestAiSummary',
    'requestAiClassification',
    'requestAiNextAction',
    'requestAiBriefing',
    'requestVoiceAgentTurn'
  ],
  webhooks: [
    'normalizeWebhookPayload',
    'ingestWebhookPayload',
    'testWebhookRelay'
  ],
  api: [
    'sync',
    'webhook',
    'testCallback'
  ],
  jobs: [
    'listSyncJobs',
    'createSyncJob',
    'updateSyncJob'
  ],
  reliability: [
    'getWorkspaceReliability',
    'retryWebhookReplay'
  ]
};

export const BACKEND_CONTRACT = {
  tables: CORE_ENTITY_TYPES,
  modelFields: CORE_MODEL_FIELDS,
  eventTypes: CORE_EVENT_TYPES,
  apiSurfaces: API_SURFACES,
  endpoints: {
    auth: {
      signIn: 'POST /auth/sign-in',
      signUp: 'POST /auth/sign-up',
      session: 'GET /auth/session',
      signOut: 'POST /auth/sign-out'
    },
    workspaces: {
      list: 'GET /workspaces',
      create: 'POST /workspaces',
      select: 'POST /workspaces/:id/select',
      members: 'GET /workspaces/:id/members',
      createMember: 'POST /workspaces/:id/members',
      snapshot: 'GET /workspaces/:id/snapshot',
      conversations: 'GET /workspaces/:id/conversations',
      messages: 'GET /workspaces/:id/messages',
      contactIdentities: 'GET /workspaces/:id/contact-identities',
      channels: 'GET /workspaces/:id/channels',
      agents: 'GET /workspaces/:id/agents',
      followUps: 'GET /workspaces/:id/follow-ups',
      voiceProfiles: 'GET /workspaces/:id/voice-profiles',
      voiceSessions: 'GET /workspaces/:id/voice-sessions',
      voiceNotes: 'GET /workspaces/:id/voice-notes'
    },
    inbox: {
      snapshot: 'GET /workspaces/:id/snapshot',
      conversations: 'GET /workspaces/:id/conversations',
      messages: 'GET /conversations/:id/messages',
      updateConversation: 'PATCH /conversations/:id',
      reply: 'POST /conversations/:id/reply',
      queueReply: 'POST /conversations/:id/reply-queue'
    },
    contacts: {
      list: 'GET /workspaces/:id/contacts',
      identities: 'GET /workspaces/:id/contact-identities',
      upsert: 'POST /workspaces/:id/contacts',
      update: 'PATCH /contacts/:id',
      merge: 'POST /contacts/:id/merge'
    },
    channels: {
      list: 'GET /workspaces/:id/channels',
      create: 'POST /workspaces/:id/channels',
      update: 'PATCH /channels/:id',
      connectSession: 'POST /workspaces/:id/channels/connect-session',
      sync: 'POST /api/sync'
    },
    connections: {
      list: 'GET /workspaces/:id/connections',
      create: 'POST /workspaces/:id/connections',
      update: 'PATCH /connections/:id',
      start: 'POST /workspaces/:id/connections/:provider/start'
    },
    agents: {
      list: 'GET /workspaces/:id/agents',
      create: 'POST /workspaces/:id/agents',
      update: 'PATCH /agents/:id',
      draft: 'POST /agents/:id/draft'
    },
    followUps: {
      list: 'GET /workspaces/:id/follow-ups',
      create: 'POST /workspaces/:id/follow-ups',
      update: 'PATCH /follow-ups/:id'
    },
    voice: {
      list: 'GET /workspaces/:id/voice',
      profiles: 'GET /workspaces/:id/voice-profiles',
      sessions: 'GET /workspaces/:id/voice-sessions',
      notes: 'GET /workspaces/:id/voice-notes',
      analyze: 'POST /workspaces/:id/voice-notes/analyze',
      createProfile: 'POST /workspaces/:id/voice-profiles',
      queue: 'POST /workspaces/:id/voice-sessions',
      note: 'POST /workspaces/:id/voice-notes'
    },
    activity: {
      list: 'GET /workspaces/:id/activity-events',
      create: 'POST /workspaces/:id/activity-events'
    },
    search: {
      query: 'GET /workspaces/:id/search?q=:query'
    },
    jobs: {
      list: 'GET /workspaces/:id/sync-jobs',
      create: 'POST /workspaces/:id/sync-jobs',
      update: 'PATCH /workspaces/:id/sync-jobs/:jobId'
    },
    reliability: {
      read: 'GET /workspaces/:id/reliability',
      retryReplay: 'POST /workspaces/:id/replay-events/:replayKey/retry'
    },
    messages: {
      updateState: 'PATCH /messages/provider/:providerMessageId/state'
    },
    ai: {
      reply: 'POST /ai-reply',
      summary: 'POST /ai-summary',
      classify: 'POST /ai-classify',
      nextAction: 'POST /ai-next-action',
      briefing: 'POST /ai-briefing',
      voiceTurn: 'POST /voice-agent-turn'
    },
    webhooks: {
      ingest: 'POST /api/webhook/:provider',
      testRelay: 'POST /api/test-callback/:provider'
    },
    api: {
      sync: 'POST /api/sync',
      webhook: 'POST /api/webhook/:provider',
      testCallback: 'POST /api/test-callback/:provider'
    }
  },
  normalizationNotes: [
    'Normalize provider payloads before inserting records.',
    'Resolve provider identities before creating a new contact when email, phone, or an existing identity matches.',
    'Keep channel adapters behind an orchestration layer.',
    'Persist inbound and outbound events with idempotency keys.',
    'Treat workspace membership as the gate for all scoped access.'
  ]
};

export function listContractTables() {
  return Object.values(CORE_ENTITY_TYPES);
}

function stableId(prefix, seed = '') {
  const normalized = String(seed || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${prefix}-${normalized || 'item'}`;
}

export function createWorkspaceEnvelope({
  workspaceId,
  name,
  slug,
  plan = 'starter',
  ownerUserId = '',
  ownerRole = 'owner'
}) {
  return {
    workspace: {
      id: workspaceId || stableId('ws', name || slug),
      name,
      slug,
      plan
    },
    member: {
      workspace_id: workspaceId || stableId('ws', name || slug),
      user_id: ownerUserId,
      role: ownerRole
    }
  };
}

export function createContactPayload({
  workspaceId,
  sourceProvider,
  externalContactId,
  name,
  email = '',
  phone = '',
  company = '',
  leadStage = 'new',
  ownerName = '',
  tags = []
}) {
  return {
    workspace_id: workspaceId,
    source_provider: sourceProvider,
    external_contact_id: externalContactId || stableId('contact', `${sourceProvider}:${email || phone || name}`),
    name,
    email,
    phone,
    company,
    lead_stage: leadStage,
    owner_name: ownerName || null,
    tags,
    metadata: {
      source_provider: sourceProvider
    }
  };
}

export function createConversationPayload({
  workspaceId,
  contactId = null,
  sourceProvider,
  externalConversationId,
  subject,
  status = 'open',
  priority = 'normal',
  source = sourceProvider,
  assignedTo = '',
  summary = '',
  lastMessageAt = new Date().toISOString()
}) {
  return {
    workspace_id: workspaceId,
    contact_id: contactId,
    source_provider: sourceProvider,
    external_conversation_id: externalConversationId || stableId('conversation', `${sourceProvider}:${subject}`),
    subject,
    status,
    priority,
    source,
    assigned_to: assignedTo || null,
    summary: summary || null,
    last_message_at: lastMessageAt
  };
}

export function createMessagePayload({
  workspaceId,
  conversationId,
  sourceProvider,
  externalMessageId,
  direction = 'inbound',
  senderName = '',
  body,
  createdAt = new Date().toISOString(),
  rawPayload = {},
  deliveryState = '',
  deliveryReceipts = [],
  providerMessageId = ''
}) {
  return {
    workspace_id: workspaceId,
    conversation_id: conversationId,
    source_provider: sourceProvider,
    external_message_id: externalMessageId || stableId('message', `${sourceProvider}:${conversationId}:${createdAt}`),
    direction,
    sender_name: senderName || null,
    body,
    provider_message_id: providerMessageId || '',
    delivery_state: deliveryState || (String(direction || '').toLowerCase() === 'outbound' ? 'sent' : 'received'),
    delivery_receipts: Array.isArray(deliveryReceipts) ? deliveryReceipts : [],
    raw_payload: {
      ...rawPayload,
      source_provider: sourceProvider
    },
    created_at: createdAt
  };
}

export function createChannelPayload({
  workspaceId,
  provider,
  channelType,
  displayName,
  status = 'configured',
  providerAccountId = '',
  externalMetadata = {}
}) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const resolvedChannelType = channelType || (normalizedProvider === 'gmail' || normalizedProvider === 'email' ? 'email' : normalizedProvider);
  return {
    workspace_id: workspaceId,
    provider,
    channel_type: resolvedChannelType,
    display_name: displayName,
    status,
    provider_account_id: providerAccountId || null,
    external_metadata: externalMetadata
  };
}

export function createAgentPayload({
  workspaceId,
  name,
  tone = 'balanced',
  instructions = '',
  knowledgeSources = [],
  status = 'active',
  channelConfig = {}
}) {
  return {
    workspace_id: workspaceId,
    name,
    tone,
    instructions,
    knowledge_sources: knowledgeSources,
    status,
    channel_config: channelConfig
  };
}

export function createActivityEventPayload({
  workspaceId,
  entityType,
  entityId = null,
  eventType,
  payload = {}
}) {
  return {
    workspace_id: workspaceId,
    entity_type: entityType,
    entity_id: entityId,
    event_type: eventType,
    payload
  };
}

export function createVoiceProfilePayload({
  workspaceId,
  name,
  label,
  voiceSource = 'original',
  promptStyle = '',
  consentStatus = 'approved',
  isDefault = false
}) {
  return {
    workspace_id: workspaceId,
    name,
    label,
    voice_source: voiceSource,
    prompt_style: promptStyle,
    consent_status: consentStatus,
    is_default: isDefault
  };
}

export function createVoiceSessionPayload({
  workspaceId,
  contactId = null,
  voiceProfileId = null,
  status = 'queued',
  disclosureText = '',
  sessionType = 'call',
  outcome = '',
  analysisStatus = '',
  analysisSummary = '',
  analysisSentiment = '',
  analysisMetadata = {}
}) {
  return {
    workspace_id: workspaceId,
    contact_id: contactId,
    voice_profile_id: voiceProfileId,
    status,
    disclosure_text: disclosureText,
    session_type: sessionType,
    outcome,
    analysis_status: analysisStatus,
    analysis_summary: analysisSummary,
    analysis_sentiment: analysisSentiment,
    analysis_metadata: analysisMetadata
  };
}

export function createVoiceNotePayload({
  workspaceId,
  contactId = null,
  voiceProfileId = null,
  voiceSessionId = null,
  title,
  body,
  status = 'draft',
  transcript = '',
  summary = '',
  sentiment = '',
  sentimentScore = 0,
  sourceProvider = '',
  audioSourceUrl = '',
  metadata = {}
}) {
  return {
    workspace_id: workspaceId,
    contact_id: contactId,
    voice_profile_id: voiceProfileId,
    voice_session_id: voiceSessionId,
    title,
    body,
    transcript,
    summary,
    sentiment,
    sentiment_score: sentimentScore,
    source_provider: sourceProvider,
    audio_source_url: audioSourceUrl,
    metadata,
    status
  };
}

export const BACKEND_RUNTIME_SURFACES = {
  providerReadiness: 'GET /provider-readiness',
  aiReply: 'POST /ai-reply',
  aiSummary: 'POST /ai-summary',
  aiClassification: 'POST /ai-classify',
  aiNextAction: 'POST /ai-next-action',
  providerIngest: 'POST /provider-ingest',
  webhookIngest: 'POST /webhooks/:provider'
};
