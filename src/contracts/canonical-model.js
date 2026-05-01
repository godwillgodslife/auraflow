import {
  createWorkspaceEnvelope,
  createWorkspaceEnvelope as buildWorkspaceEnvelope
} from './auraflow-contract.js';

function trimText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  const stamp = Number(value) > 1e12 ? Number(value) : value;
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toNullableIso(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return toIso(value);
}

function normalizeChannelType(value = '', fallback = 'email') {
  const normalized = trimText(value, fallback).toLowerCase();
  if (normalized === 'gmail') return 'email';
  if (['email', 'whatsapp', 'sms', 'voice', 'instagram', 'messenger'].includes(normalized)) return normalized;
  return fallback;
}

export function canonicalizeContact(input = {}) {
  const workspaceId = trimText(input.workspace_id || input.workspaceId);
  const sourceProvider = trimText(input.source_provider || input.sourceProvider, 'manual');
  return {
    id: trimText(input.id, ''),
    workspace_id: workspaceId,
    source_provider: sourceProvider,
    external_contact_id: trimText(input.external_contact_id || input.externalContactId || input.external_id, ''),
    name: trimText(input.name, 'Unknown contact'),
    email: trimText(input.email, ''),
    phone: trimText(input.phone, ''),
    company: trimText(input.company, ''),
    lead_stage: trimText(input.lead_stage || input.leadStage, 'new'),
    owner_name: trimText(input.owner_name || input.ownerName, '') || null,
    tags: toArray(input.tags),
    metadata: input.metadata || {},
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeLead(input = {}) {
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    source_provider: trimText(input.source_provider || input.sourceProvider || input.source, 'manual'),
    external_lead_id: trimText(input.external_lead_id || input.externalLeadId || input.external_id, ''),
    contact_id: trimText(input.contact_id || input.contactId, '') || null,
    conversation_id: trimText(input.conversation_id || input.conversationId, '') || null,
    name: trimText(input.name, 'Lead'),
    email: trimText(input.email, ''),
    phone: trimText(input.phone, ''),
    phone_e164: trimText(input.phone_e164 || input.phoneE164, '') || null,
    company: trimText(input.company, ''),
    lead_stage: trimText(input.lead_stage || input.leadStage, 'new'),
    lead_score: Number.isFinite(Number(input.lead_score || input.leadScore)) ? Number(input.lead_score || input.leadScore) : 0,
    capture_reason: trimText(input.capture_reason || input.captureReason, ''),
    captured_from: trimText(input.captured_from || input.capturedFrom, ''),
    tags: toArray(input.tags),
    metadata: input.metadata || {},
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeContactIdentity(input = {}) {
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    contact_id: trimText(input.contact_id || input.contactId, '') || null,
    provider: trimText(input.provider, 'manual'),
    provider_account_id: trimText(input.provider_account_id || input.providerAccountId, '') || null,
    external_identity_id: trimText(input.external_identity_id || input.externalIdentityId, ''),
    external_thread_id: trimText(input.external_thread_id || input.externalThreadId, '') || null,
    email: trimText(input.email, '') || null,
    phone: trimText(input.phone, '') || null,
    display_name: trimText(input.display_name || input.displayName, '') || null,
    metadata: input.metadata || {},
    last_seen_at: toNullableIso(input.last_seen_at || input.lastSeenAt),
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeConversation(input = {}) {
  const workspaceId = trimText(input.workspace_id || input.workspaceId);
  const sourceProvider = trimText(input.source_provider || input.sourceProvider, 'manual');
  return {
    id: trimText(input.id, ''),
    workspace_id: workspaceId,
    contact_id: trimText(input.contact_id || input.contactId, '') || null,
    source_provider: sourceProvider,
    external_conversation_id: trimText(input.external_conversation_id || input.externalConversationId, ''),
    subject: trimText(input.subject, 'Incoming thread'),
    status: trimText(input.status, 'open'),
    priority: trimText(input.priority, 'normal'),
    source: trimText(input.source, sourceProvider),
    assigned_to: trimText(input.assigned_to || input.assignedTo, '') || null,
    summary: trimText(input.summary, '') || null,
    draft_reply: trimText(input.draft_reply || input.draftReply, '') || null,
    ai_draft_reply: trimText(input.ai_draft_reply || input.aiDraftReply, '') || null,
    intent: trimText(input.intent, '') || null,
    intent_confidence: Number.isFinite(Number(input.intent_confidence || input.intentConfidence))
      ? Number(input.intent_confidence || input.intentConfidence)
      : null,
    last_message_at: toIso(input.last_message_at || input.lastMessageAt),
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeMessage(input = {}) {
  const workspaceId = trimText(input.workspace_id || input.workspaceId);
  const sourceProvider = trimText(input.source_provider || input.sourceProvider, 'manual');
  return {
    id: trimText(input.id, ''),
    workspace_id: workspaceId,
    conversation_id: trimText(input.conversation_id || input.conversationId, '') || null,
    source_provider: sourceProvider,
    external_message_id: trimText(input.external_message_id || input.externalMessageId, ''),
    provider_message_id: trimText(input.provider_message_id || input.providerMessageId, '') || null,
    direction: trimText(input.direction, 'inbound'),
    sender_name: trimText(input.sender_name || input.senderName, '') || null,
    body: trimText(input.body, ''),
    delivery_state: trimText(
      input.delivery_state || input.deliveryState,
      String(trimText(input.direction, 'inbound')).toLowerCase() === 'outbound' ? 'sent' : 'received'
    ),
    delivery_receipts: Array.isArray(input.delivery_receipts || input.deliveryReceipts)
      ? (input.delivery_receipts || input.deliveryReceipts)
      : [],
    raw_payload: input.raw_payload || input.rawPayload || {},
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeChannel(input = {}) {
  const provider = trimText(input.provider, 'manual');
  const channelType = normalizeChannelType(input.channel_type || input.channelType, provider === 'gmail' ? 'email' : 'email');
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    provider,
    channel_type: channelType,
    display_name: trimText(input.display_name || input.displayName, 'Channel'),
    status: trimText(input.status, 'configured'),
    provider_account_id: trimText(input.provider_account_id || input.providerAccountId, '') || null,
    connection_state: trimText(input.connection_state || input.connectionState, 'disconnected'),
    webhook_status: trimText(input.webhook_status || input.webhookStatus, 'unknown'),
    last_sync_at: trimText(input.last_sync_at || input.lastSyncAt, '') || null,
    external_metadata: input.external_metadata || input.externalMetadata || {},
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeAgent(input = {}) {
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    name: trimText(input.name, 'AuraFlow Agent'),
    tone: trimText(input.tone, 'balanced'),
    instructions: trimText(input.instructions, '') || null,
    knowledge_sources: toArray(input.knowledge_sources || input.knowledgeSources),
    status: trimText(input.status, 'active'),
    channel_config: input.channel_config || input.channelConfig || {},
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeFollowUpSequence(input = {}) {
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    name: trimText(input.name, 'Follow-up sequence'),
    status: trimText(input.status, 'active'),
    steps: Number.isFinite(Number(input.steps)) ? Number(input.steps) : 0,
    replies: trimText(input.replies, '0%'),
    deliveries: trimText(input.deliveries, '0%'),
    next_run: trimText(input.next_run || input.nextRun, '') || null,
    steps_detail: trimText(input.steps_detail || input.stepsDetail, '') || null,
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeActivityEvent(input = {}) {
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    entity_type: trimText(input.entity_type || input.entityType, 'conversation'),
    entity_id: trimText(input.entity_id || input.entityId, '') || null,
    event_type: trimText(input.event_type || input.eventType, 'event_created'),
    payload: input.payload || {},
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeSyncJob(input = {}) {
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    type: trimText(input.type || input.jobType, 'workflow.inbound_recorded'),
    status: trimText(input.status, 'queued'),
    payload: input.payload || {},
    retry_count: Number.isFinite(Number(input.retry_count || input.retryCount)) ? Number(input.retry_count || input.retryCount) : 0,
    max_retries: Number.isFinite(Number(input.max_retries || input.maxRetries)) ? Number(input.max_retries || input.maxRetries) : 3,
    next_retry_at: trimText(input.next_retry_at || input.nextRetryAt, '') || null,
    assigned_to: trimText(input.assigned_to || input.assignedTo, '') || null,
    last_error: trimText(input.last_error || input.lastError, '') || null,
    note: trimText(input.note, '') || null,
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeVoiceProfile(input = {}) {
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    name: trimText(input.name, 'Voice profile'),
    label: trimText(input.label, ''),
    voice_source: trimText(input.voice_source || input.voiceSource, 'original'),
    prompt_style: trimText(input.prompt_style || input.promptStyle, ''),
    consent_status: trimText(input.consent_status || input.consentStatus, 'approved'),
    is_default: Boolean(input.is_default ?? input.isDefault),
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeVoiceSession(input = {}) {
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    contact_id: trimText(input.contact_id || input.contactId, '') || null,
    voice_profile_id: trimText(input.voice_profile_id || input.voiceProfileId, '') || null,
    status: trimText(input.status, 'queued'),
    disclosure_text: trimText(input.disclosure_text || input.disclosureText, ''),
    session_type: trimText(input.session_type || input.sessionType, 'call'),
    outcome: trimText(input.outcome, '') || null,
    analysis_status: trimText(input.analysis_status || input.analysisStatus, '') || null,
    analysis_summary: trimText(input.analysis_summary || input.analysisSummary, '') || null,
    analysis_sentiment: trimText(input.analysis_sentiment || input.analysisSentiment, '') || null,
    analysis_metadata: input.analysis_metadata || input.analysisMetadata || {},
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeVoiceNote(input = {}) {
  return {
    id: trimText(input.id, ''),
    workspace_id: trimText(input.workspace_id || input.workspaceId),
    contact_id: trimText(input.contact_id || input.contactId, '') || null,
    voice_profile_id: trimText(input.voice_profile_id || input.voiceProfileId, '') || null,
    voice_session_id: trimText(input.voice_session_id || input.voiceSessionId, '') || null,
    title: trimText(input.title, 'Voice note'),
    body: trimText(input.body, ''),
    transcript: trimText(input.transcript, '') || null,
    summary: trimText(input.summary, '') || null,
    sentiment: trimText(input.sentiment, '') || null,
    sentiment_score: Number.isFinite(Number(input.sentiment_score || input.sentimentScore))
      ? Number(input.sentiment_score || input.sentimentScore)
      : null,
    source_provider: trimText(input.source_provider || input.sourceProvider, '') || null,
    audio_source_url: trimText(input.audio_source_url || input.audioSourceUrl, '') || null,
    metadata: input.metadata || {},
    status: trimText(input.status, 'draft'),
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeWorkspace(input = {}) {
  return {
    id: trimText(input.id, ''),
    name: trimText(input.name, 'AuraFlow Workspace'),
    slug: trimText(input.slug, ''),
    plan: trimText(input.plan, 'starter'),
    created_at: toIso(input.created_at || input.createdAt),
    updated_at: toIso(input.updated_at || input.updatedAt)
  };
}

export function canonicalizeWorkspaceSnapshot(snapshot = {}) {
  const contactIdentities = toArray(snapshot.contactIdentities || snapshot.contact_identities).map((item) => canonicalizeContactIdentity(item));
  const identitiesByContactId = new Map();
  for (const identity of contactIdentities) {
    if (!identity.contact_id) continue;
    const existing = identitiesByContactId.get(identity.contact_id) || [];
    existing.push(identity);
    identitiesByContactId.set(identity.contact_id, existing);
  }

  return {
    workspace: canonicalizeWorkspace(snapshot.workspace || {}),
    members: toArray(snapshot.members).map((member) => ({
      id: trimText(member.id, ''),
      workspace_id: trimText(member.workspace_id || member.workspaceId),
      user_id: trimText(member.user_id || member.userId, ''),
      role: trimText(member.role, 'owner'),
      created_at: toIso(member.created_at || member.createdAt),
      updated_at: toIso(member.updated_at || member.updatedAt)
    })),
    contacts: toArray(snapshot.contacts).map((item) => {
      const contact = canonicalizeContact(item);
      return {
        ...contact,
        metadata: {
          ...(contact.metadata || {}),
          identities: identitiesByContactId.get(contact.id) || []
        }
      };
    }),
    leads: toArray(snapshot.leads).map((item) => canonicalizeLead(item)),
    contactIdentities,
    trainingSources: toArray(snapshot.trainingSources),
    workspaceKnowledge: toArray(snapshot.workspaceKnowledge || snapshot.workspace_knowledge),
    businessKnowledge: toArray(snapshot.businessKnowledge),
    conversations: toArray(snapshot.conversations).map((item) => canonicalizeConversation(item)),
    messages: toArray(snapshot.messages).map((item) => canonicalizeMessage(item)),
    channels: toArray(snapshot.channels).map((item) => canonicalizeChannel(item)),
    agents: toArray(snapshot.agents).map((item) => canonicalizeAgent(item)),
    sequences: toArray(snapshot.sequences).map((item) => canonicalizeFollowUpSequence(item)),
    voiceProfiles: toArray(snapshot.voiceProfiles).map((item) => canonicalizeVoiceProfile(item)),
    voiceSessions: toArray(snapshot.voiceSessions).map((item) => canonicalizeVoiceSession(item)),
    voiceNotes: toArray(snapshot.voiceNotes).map((item) => canonicalizeVoiceNote(item)),
    activityEvents: toArray(snapshot.activityEvents).map((item) => canonicalizeActivityEvent(item)),
    syncJobs: toArray(snapshot.syncJobs).map((item) => canonicalizeSyncJob(item)),
    workflowQueue: toArray(snapshot.workflowQueue).map((item) => canonicalizeSyncJob(item)),
    tagSuggestions: toArray(snapshot.tagSuggestions),
    sequenceStepTemplates: toArray(snapshot.sequenceStepTemplates),
    providerIssueNotes: toArray(snapshot.providerIssueNotes),
    reliabilityEvents: toArray(snapshot.reliabilityEvents).map((item) => ({
      id: trimText(item.id, ''),
      workspace_id: trimText(item.workspace_id || item.workspaceId),
      provider: trimText(item.provider, 'demo'),
      event_type: trimText(item.event_type || item.eventType, 'reliability.test_callback'),
      status: trimText(item.status, 'received'),
      replay_key: trimText(item.replay_key || item.replayKey, '') || null,
      dedupe_key: trimText(item.dedupe_key || item.dedupeKey, '') || null,
      payload: item.payload || {},
      error_message: trimText(item.error_message || item.errorMessage, '') || null,
      created_at: toIso(item.created_at || item.createdAt),
      updated_at: toIso(item.updated_at || item.updatedAt)
    })),
    reliability: snapshot.reliability || null,
    billing: snapshot.billing || null,
    team: toArray(snapshot.team),
    automations: toArray(snapshot.automations),
    integrations: toArray(snapshot.integrations)
  };
}

export function buildCanonicalWorkspaceEnvelope(input = {}) {
  const workspace = canonicalizeWorkspace(input.workspace || input);
  const member = {
    workspace_id: workspace.id,
    user_id: trimText(input.ownerUserId || input.owner_user_id || input.member?.user_id || input.member?.userId, ''),
    role: trimText(input.ownerRole || input.owner_role || input.member?.role, 'owner')
  };
  return {
    workspace,
    member,
    envelope: createWorkspaceEnvelope({
      workspaceId: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
      ownerUserId: member.user_id,
      ownerRole: member.role
    })
  };
}

export {
  buildWorkspaceEnvelope
};
