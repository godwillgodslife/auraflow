import {
  workspace as demoWorkspace,
  contacts as demoContacts,
  conversations as demoConversations,
  conversationThread as demoConversationThread,
  sequences as demoSequences,
  automations as demoAutomations,
  integrations as demoIntegrations,
  team as demoTeam
} from '../data.js';
import {
  createActivityEventPayload,
  createAgentPayload,
  createChannelPayload,
  createContactPayload,
  createConversationPayload,
  createMessagePayload,
  createVoiceNotePayload,
  createVoiceProfilePayload,
  createVoiceSessionPayload,
  createWorkspaceEnvelope
} from '../contracts/auraflow-contract.js';
import { canonicalizeWorkspaceSnapshot } from '../contracts/canonical-model.js';
import { listWorkspaceJobs } from './job-queue.js';
import { getWebhookReplayDiagnostics } from './replay-store.js';

const workspaceStore = new Map();
const DEFAULT_WORKSPACE_ID = 'ws-northstar-commerce';

function nowIso() {
  return new Date().toISOString();
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workspace';
}

function makeId(prefix, seed = '') {
  const suffix = slugify(seed || 'item');
  return `${prefix}-${suffix}`;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function inferLeadStage(label = '') {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('refund')) return 'refund risk';
  if (normalized.includes('demo')) return 'demo booked';
  if (normalized.includes('support')) return 'support escalation';
  if (normalized.includes('sql')) return 'sql';
  return label || 'new';
}

function inferLifetimeValue(index, override = null) {
  if (Number.isFinite(Number(override))) return Number(override);
  return 980 + index * 4100;
}

function normalizeConversationStatus(value = '') {
  const normalized = String(value || '').trim();
  return normalized ? normalized : 'Open';
}

function buildConversationMessages(workspaceId, conversation, contact, index) {
  const baseMinutes = 20 + index * 18;
  const sourceProvider = String(conversation.channel || conversation.source || 'demo').toLowerCase();
  if (index === 0) {
    return demoConversationThread.messages.map((message, messageIndex) =>
      createMessagePayload({
        workspaceId,
        conversationId: conversation.id,
        sourceProvider,
        externalMessageId: makeId('message', `${conversation.id}-${messageIndex}`),
        direction: message.side === 'agent' ? 'outbound' : 'inbound',
        senderName: message.from,
        body: message.body,
        createdAt: minutesAgo(baseMinutes - messageIndex * 2)
      })
    );
  }

  return [
    createMessagePayload({
      workspaceId,
      conversationId: conversation.id,
      sourceProvider,
      externalMessageId: makeId('message', `${conversation.id}-in`),
      direction: 'inbound',
      senderName: contact.name,
      body: conversation.summary || conversation.subject || 'Need a quick update.',
      createdAt: minutesAgo(baseMinutes)
    }),
    createMessagePayload({
      workspaceId,
      conversationId: conversation.id,
      sourceProvider,
      externalMessageId: makeId('message', `${conversation.id}-out`),
      direction: 'outbound',
      senderName: `${demoWorkspace.name} Support`,
      body: 'Thanks. I am checking this now and will follow up with a clear next step.',
      createdAt: minutesAgo(baseMinutes - 3)
    })
  ];
}

function buildWorkspaceSnapshot(workspaceMeta = {}) {
  const envelope = createWorkspaceEnvelope({
    workspaceId: workspaceMeta.id || DEFAULT_WORKSPACE_ID,
    name: workspaceMeta.name || demoWorkspace.name,
    slug: workspaceMeta.slug || slugify(workspaceMeta.name || demoWorkspace.name),
    plan: workspaceMeta.plan || 'growth-suite',
    ownerUserId: workspaceMeta.ownerUserId || 'demo-user',
    ownerRole: 'owner'
  });

  const workspaceId = envelope.workspace.id;
  const workspace = {
    ...envelope.workspace,
    created_at: nowIso(),
    updated_at: nowIso()
  };

  const members = [
    {
      id: makeId('member', workspaceId),
      ...envelope.member,
      created_at: nowIso(),
      updated_at: nowIso()
    }
  ];

  const contacts = demoContacts.map((item, index) => {
    const sourceProvider = String(item.tags?.[0] || 'demo').toLowerCase();
    const contact = createContactPayload({
      workspaceId,
      sourceProvider,
      externalContactId: makeId('contact-external', `${item.name}-${item.company}`),
      name: item.name,
      email: `${slugify(item.name)}@${slugify(item.company)}.example.com`,
      company: item.company,
      leadStage: inferLeadStage(item.stage),
      ownerName: item.owner,
      tags: item.tags || []
    });
    return {
      id: makeId('contact', `${item.name}-${index}`),
      ...contact,
      lead_stage: inferLeadStage(item.stage),
      lifetime_value: inferLifetimeValue(index),
      created_at: minutesAgo(260 - index * 10),
      updated_at: minutesAgo(30 - index * 3)
    };
  });

  const contactByIndex = new Map(contacts.map((item, index) => [index, item]));

  const conversations = demoConversations.map((item, index) => {
    const contact = contactByIndex.get(index);
    const sourceProvider = String(item.channel || 'demo').toLowerCase();
    const conversation = createConversationPayload({
      workspaceId,
      contactId: contact?.id || null,
      sourceProvider,
      externalConversationId: makeId('conversation-external', `${item.name}-${item.company}`),
      subject: `${item.tag} with ${item.name}`,
      status: normalizeConversationStatus(item.status),
      priority: item.statusTone === 'danger' ? 'high' : item.statusTone === 'warning' ? 'medium' : 'normal',
      source: item.channel,
      assignedTo: item.owner,
      summary: item.lastMessage,
      lastMessageAt: minutesAgo(18 - index * 3)
    });
    return {
      id: makeId('conversation', `${item.name}-${index}`),
      ...conversation,
      created_at: minutesAgo(340 - index * 28),
      updated_at: minutesAgo(18 - index * 3)
    };
  });

  const messages = conversations.flatMap((conversation, index) =>
    buildConversationMessages(workspaceId, conversation, contacts[index], index)
  );

  const activityEvents = conversations.flatMap((conversation, index) => [
    createActivityEventPayload({
      workspaceId,
      entityType: 'conversation',
      entityId: conversation.id,
      eventType: 'conversation.created',
      payload: { subject: conversation.subject }
    }),
    createActivityEventPayload({
      workspaceId,
      entityType: 'conversation',
      entityId: conversation.id,
      eventType: index === 0 ? 'conversation.assigned' : 'conversation.updated',
      payload: {
        assigned_to: conversation.assigned_to || null,
        status: conversation.status
      }
    })
  ]).map((event, index) => ({
    id: makeId('activity', `${workspaceId}-${index}`),
    ...event,
    created_at: minutesAgo(60 - index * 4)
  }));

  const channels = [
    createChannelPayload({
      workspaceId,
      provider: 'whatsapp',
      channelType: 'whatsapp',
      displayName: 'WhatsApp Support',
      status: 'live',
      providerAccountId: '+2348015550101'
    }),
    createChannelPayload({
      workspaceId,
      provider: 'gmail',
      channelType: 'email',
      displayName: 'Gmail Support',
      status: 'live',
      providerAccountId: 'support@northstar.example'
    }),
    createChannelPayload({
      workspaceId,
      provider: 'instagram',
      channelType: 'instagram',
      displayName: 'Instagram Inbox',
      status: 'configured',
      providerAccountId: 'northstar.instagram'
    })
  ].map((channel, index) => ({
    id: makeId('channel', `${channel.provider}-${index}`),
    ...channel,
    display_name: channel.display_name,
    created_at: minutesAgo(420 - index * 12),
    updated_at: minutesAgo(12 - index * 2)
  }));

  const agents = [
    createAgentPayload({
      workspaceId,
      name: 'Northstar Support Agent',
      tone: 'balanced',
      instructions: 'Handle support, sales replies, and handoff requests with a calm, premium tone.',
      knowledgeSources: ['Product guide', 'Refund policy', 'Onboarding checklist'],
      status: 'active',
      channelConfig: { channels: ['whatsapp', 'gmail', 'instagram'] }
    })
  ].map((agent, index) => ({
    id: makeId('agent', `${agent.name}-${index}`),
    ...agent,
    created_at: minutesAgo(500 - index * 20),
    updated_at: minutesAgo(40 - index * 5)
  }));

  const sequences = demoSequences.map((sequence, index) => ({
    id: makeId('sequence', `${sequence.name}-${index}`),
    workspace_id: workspaceId,
    name: sequence.name,
    status: String(sequence.status || 'Active').toLowerCase(),
    steps: sequence.steps,
    replies: sequence.replies,
    deliveries: sequence.deliveries,
    next_run: sequence.nextRun,
    steps_detail: Array.from({ length: Number(sequence.steps || 0) || 0 }, (_, stepIndex) => `${sequence.name} step ${stepIndex + 1}`),
    created_at: minutesAgo(360 - index * 30),
    updated_at: minutesAgo(50 - index * 4)
  }));

  const voiceProfiles = [
    createVoiceProfilePayload({
      workspaceId,
      name: 'Receptionist Voice',
      label: 'Warm, concise, and consent-first',
      voiceSource: 'original',
      promptStyle: 'Premium, measured, and human'
    })
  ].map((profile, index) => ({
    id: makeId('voice-profile', `${profile.name}-${index}`),
    ...profile,
    created_at: minutesAgo(220 - index * 12),
    updated_at: minutesAgo(22 - index * 3)
  }));

  const voiceSessions = [
    createVoiceSessionPayload({
      workspaceId,
      contactId: contacts[0]?.id || null,
      voiceProfileId: voiceProfiles[0]?.id || null,
      status: 'queued',
      disclosureText: 'This call may be recorded for quality and support training.',
      sessionType: 'call'
    })
  ].map((session, index) => ({
    id: makeId('voice-session', `${workspaceId}-${index}`),
    ...session,
    created_at: minutesAgo(90 - index * 5),
    updated_at: minutesAgo(90 - index * 5)
  }));

  const voiceNotes = [
    createVoiceNotePayload({
      workspaceId,
      contactId: contacts[0]?.id || null,
      voiceProfileId: voiceProfiles[0]?.id || null,
      title: 'Call follow-up',
      body: 'Customer asked for a brief implementation checklist and approval flow summary.',
      status: 'draft'
    })
  ].map((note, index) => ({
    id: makeId('voice-note', `${workspaceId}-${index}`),
    ...note,
    created_at: minutesAgo(75 - index * 5),
    updated_at: minutesAgo(75 - index * 5)
  }));

  const automations = demoAutomations.map((automation, index) => ({
    id: makeId('automation', `${automation.trigger}-${index}`),
    workspace_id: workspaceId,
    ...automation,
    created_at: minutesAgo(600 - index * 14),
    updated_at: minutesAgo(25 - index * 2)
  }));

  const integrations = demoIntegrations.map((integration, index) => ({
    id: makeId('integration', `${integration.name}-${index}`),
    workspace_id: workspaceId,
    ...integration,
    created_at: minutesAgo(700 - index * 15),
    updated_at: minutesAgo(35 - index * 2)
  }));

  const tagSuggestions = Array.from(new Set(contacts.flatMap((item) => Array.isArray(item.tags) ? item.tags : []))).filter(Boolean);
  const sequenceStepTemplates = sequences.map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    steps_detail: Array.isArray(sequence.steps_detail) ? sequence.steps_detail : []
  }));
  const trainingSources = [
    {
      id: makeId('training-source', `${workspaceId}-refund-policy`),
      workspace_id: workspaceId,
      source_type: 'document',
      title: 'Refund policy overview',
      body: 'Acknowledge the customer, confirm the order id, and route refund requests through the refund workflow before promising a turnaround time.',
      tags: ['refunds', 'support'],
      relevance: 'high',
      metadata: { category: 'refunds', source: 'demo' },
      created_at: minutesAgo(180),
      updated_at: minutesAgo(18)
    },
    {
      id: makeId('training-source', `${workspaceId}-shipping-faq`),
      workspace_id: workspaceId,
      source_type: 'document',
      title: 'Shipping FAQ',
      body: 'Use a concise, reassuring tone. Share the latest tracking link when available and ask for the order email if tracking cannot be found.',
      tags: ['shipping', 'support'],
      relevance: 'medium',
      metadata: { category: 'shipping', source: 'demo' },
      created_at: minutesAgo(170),
      updated_at: minutesAgo(16)
    },
    {
      id: makeId('training-source', `${workspaceId}-handoff-guidelines`),
      workspace_id: workspaceId,
      source_type: 'document',
      title: 'Human handoff guidelines',
      body: 'Escalate when sentiment is negative, when a customer asks for a manager, or when the issue needs account-specific review.',
      tags: ['handoff', 'escalation'],
      relevance: 'high',
      metadata: { category: 'handoff', source: 'demo' },
      created_at: minutesAgo(160),
      updated_at: minutesAgo(14)
    }
  ];
  const providerIssueNotes = channels
    .map((channel) => {
      const liveStatus = String(channel.status || '').toLowerCase();
      const note = liveStatus === 'paused'
        ? 'Reconnect this provider to resume sync.'
        : liveStatus === 'needs_review'
          ? 'Review the readiness note before marking this provider live.'
          : liveStatus === 'configured'
            ? 'Configured locally and ready to connect.'
            : '';
      return {
        provider: channel.provider,
        label: channel.display_name || channel.provider,
        status: liveStatus || 'configured',
        note
      };
    })
    .filter((item) => ['missing', 'paused', 'needs_review'].includes(item.status));
  const reliabilityEvents = [];

  return canonicalizeWorkspaceSnapshot({
    workspace,
    members,
    contacts,
    conversations,
    messages,
    trainingSources,
    channels,
    connections: [],
    agents,
    sequences,
    voiceProfiles,
    voiceSessions,
    voiceNotes,
    activityEvents,
    automations,
    integrations,
    tagSuggestions,
    sequenceStepTemplates,
    providerIssueNotes,
    reliabilityEvents,
    billing: clone(demoWorkspace),
    team: clone(demoTeam)
  });
}

function ensureWorkspaceState(workspaceId = DEFAULT_WORKSPACE_ID, workspaceMeta = {}) {
  const nextId = workspaceId || DEFAULT_WORKSPACE_ID;
  if (!workspaceStore.has(nextId)) {
    workspaceStore.set(nextId, buildWorkspaceSnapshot({
      id: nextId,
      name: workspaceMeta.name || demoWorkspace.name,
      slug: workspaceMeta.slug || slugify(workspaceMeta.name || demoWorkspace.name),
      plan: workspaceMeta.plan || 'growth-suite',
      ownerUserId: workspaceMeta.ownerUserId || 'demo-user'
    }));
  }
  return workspaceStore.get(nextId);
}

function tableToCollectionKey(table) {
  switch (table) {
    case 'leads':
      return 'contacts';
    case 'follow_up_sequences':
      return 'sequences';
    case 'voice_profiles':
      return 'voiceProfiles';
    case 'voice_sessions':
      return 'voiceSessions';
    case 'voice_notes':
      return 'voiceNotes';
    case 'activity_events':
      return 'activityEvents';
    case 'training_sources':
      return 'trainingSources';
    case 'reliability_events':
      return 'reliabilityEvents';
    default:
      return table;
  }
}

function ensureCollection(state, table) {
  const key = tableToCollectionKey(table);
  if (!Array.isArray(state[key])) state[key] = [];
  return state[key];
}

function externalIdFieldForTable(table) {
  switch (tableToCollectionKey(table)) {
    case 'contacts':
      return 'external_contact_id';
    case 'conversations':
      return 'external_conversation_id';
    case 'messages':
      return 'external_message_id';
    case 'channels':
      return 'provider_account_id';
    case 'trainingSources':
      return 'id';
    default:
      return '';
  }
}

function findRecordByExternalId(table, externalId, workspaceId = '') {
  const key = tableToCollectionKey(table);
  const field = externalIdFieldForTable(table);
  if (!field || !externalId) return null;

  for (const state of workspaceStore.values()) {
    if (workspaceId && String(state.workspace?.id || '') !== String(workspaceId)) continue;
    const collection = ensureCollection(state, key);
    const record = collection.find((item) => String(item[field] || item.external_id || '') === String(externalId));
    if (record) {
      return { state, record, collection };
    }
  }

  return null;
}

function upsertCollectionRecord(table, workspaceId, body = {}, externalId = '') {
  const key = tableToCollectionKey(table);
  const collection = ensureCollection(ensureWorkspaceState(workspaceId), key);
  const field = externalIdFieldForTable(table);
  const nextExternalId = externalId || body[field] || body.externalId || body.external_id || '';
  if (field && nextExternalId) {
    const existing = collection.find((item) => String(item[field] || item.external_id || '') === String(nextExternalId));
    if (existing) {
      Object.assign(existing, clone(body), { updated_at: nowIso() });
      if (field && !existing[field]) existing[field] = nextExternalId;
      return clone(existing);
    }
  }
  return createDemoCollectionRecord(workspaceId, table, body);
}

function makeCollectionRecord(table, workspaceId, body = {}) {
  const now = nowIso();
  const key = tableToCollectionKey(table);
  const sourceProvider = body.source_provider || body.sourceProvider || 'demo';

  switch (key) {
    case 'contacts':
      return {
        id: body.id || makeId('contact', `${body.name || body.email || now}`),
        workspace_id: workspaceId,
        source_provider: sourceProvider,
        external_contact_id: body.external_contact_id || body.externalContactId || makeId('contact-external', `${body.name || body.email || now}`),
        name: body.name || 'Unknown contact',
        email: body.email || '',
        phone: body.phone || '',
        company: body.company || '',
        lead_stage: body.lead_stage || body.leadStage || 'new',
        owner_name: body.owner_name || body.ownerName || null,
        tags: Array.isArray(body.tags) ? body.tags : [],
        lifetime_value: Number(body.lifetime_value || body.lifetimeValue || 0),
        metadata: body.metadata || {},
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'conversations':
      return {
        id: body.id || makeId('conversation', `${body.subject || body.external_conversation_id || now}`),
        workspace_id: workspaceId,
        contact_id: body.contact_id || body.contactId || null,
        source_provider: sourceProvider,
        external_conversation_id: body.external_conversation_id || body.externalConversationId || makeId('conversation-external', `${body.subject || now}`),
        subject: body.subject || 'New conversation',
        status: body.status || 'open',
        priority: body.priority || 'normal',
        source: body.source || body.channel || sourceProvider,
        assigned_to: body.assigned_to || body.assignedTo || null,
        summary: body.summary || '',
        last_message_at: body.last_message_at || body.lastMessageAt || now,
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'messages':
      return {
        id: body.id || makeId('message', `${body.external_message_id || now}`),
        workspace_id: workspaceId,
        conversation_id: body.conversation_id || body.conversationId || null,
        source_provider: sourceProvider,
        external_message_id: body.external_message_id || body.externalMessageId || makeId('message-external', `${body.body || now}`),
        direction: body.direction || 'inbound',
        sender_name: body.sender_name || body.senderName || null,
        body: body.body || '',
        delivery_state: body.delivery_state || body.deliveryState || (String(body.direction || '').toLowerCase() === 'outbound' ? 'sent' : 'received'),
        delivery_receipts: Array.isArray(body.delivery_receipts || body.deliveryReceipts) ? (body.delivery_receipts || body.deliveryReceipts) : [],
        raw_payload: body.raw_payload || body.rawPayload || {},
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'channels':
      return {
        id: body.id || makeId('channel', `${body.provider || body.display_name || now}`),
        workspace_id: workspaceId,
        provider: body.provider || sourceProvider,
        channel_type: body.channel_type || body.channelType || 'email',
        display_name: body.display_name || body.displayName || body.provider || 'Channel',
        status: body.status || 'configured',
        provider_account_id: body.provider_account_id || body.providerAccountId || null,
        external_metadata: body.external_metadata || body.externalMetadata || {},
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'agents':
      return {
        id: body.id || makeId('agent', `${body.name || now}`),
        workspace_id: workspaceId,
        name: body.name || 'Northstar Support Agent',
        tone: body.tone || 'balanced',
        instructions: body.instructions || '',
        knowledge_sources: Array.isArray(body.knowledge_sources || body.knowledgeSources) ? (body.knowledge_sources || body.knowledgeSources) : [],
        status: body.status || 'active',
        channel_config: body.channel_config || body.channelConfig || {},
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'sequences':
      return {
        id: body.id || makeId('sequence', `${body.name || now}`),
        workspace_id: workspaceId,
        name: body.name || 'Follow-up sequence',
        status: body.status || 'draft',
        steps: body.steps || body.stepCount || 0,
        replies: body.replies || '0%',
        deliveries: body.deliveries || '0%',
        next_run: body.next_run || body.nextRun || '',
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'voiceProfiles':
      return {
        id: body.id || makeId('voice-profile', `${body.name || now}`),
        workspace_id: workspaceId,
        name: body.name || 'Voice profile',
        label: body.label || '',
        voice_source: body.voice_source || body.voiceSource || 'original',
        prompt_style: body.prompt_style || body.promptStyle || '',
        consent_status: body.consent_status || body.consentStatus || 'approved',
        is_default: Boolean(body.is_default || body.isDefault),
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'voiceSessions':
      return {
        id: body.id || makeId('voice-session', `${body.contact_id || body.contactId || now}`),
        workspace_id: workspaceId,
        contact_id: body.contact_id || body.contactId || null,
        voice_profile_id: body.voice_profile_id || body.voiceProfileId || null,
        status: body.status || 'queued',
        disclosure_text: body.disclosure_text || body.disclosureText || '',
        session_type: body.session_type || body.sessionType || 'call',
        outcome: body.outcome || '',
        analysis_status: body.analysis_status || body.analysisStatus || '',
        analysis_summary: body.analysis_summary || body.analysisSummary || '',
        analysis_sentiment: body.analysis_sentiment || body.analysisSentiment || '',
        analysis_metadata: body.analysis_metadata || body.analysisMetadata || {},
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'voiceNotes':
      return {
        id: body.id || makeId('voice-note', `${body.title || now}`),
        workspace_id: workspaceId,
        contact_id: body.contact_id || body.contactId || null,
        voice_profile_id: body.voice_profile_id || body.voiceProfileId || null,
        voice_session_id: body.voice_session_id || body.voiceSessionId || null,
        title: body.title || 'Voice note',
        body: body.body || '',
        transcript: body.transcript || '',
        summary: body.summary || '',
        sentiment: body.sentiment || '',
        sentiment_score: Number.isFinite(Number(body.sentiment_score ?? body.sentimentScore)) ? Number(body.sentiment_score ?? body.sentimentScore) : null,
        source_provider: body.source_provider || body.sourceProvider || '',
        audio_source_url: body.audio_source_url || body.audioSourceUrl || null,
        metadata: body.metadata || {},
        status: body.status || 'draft',
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'trainingSources':
      return {
        id: body.id || makeId('training-source', `${body.title || now}`),
        workspace_id: workspaceId,
        source_type: body.source_type || body.sourceType || 'document',
        title: body.title || 'Training source',
        body: body.body || '',
        tags: Array.isArray(body.tags) ? body.tags : [],
        relevance: body.relevance || '',
        metadata: body.metadata || {},
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'activityEvents':
      return {
        id: body.id || makeId('activity', `${body.event_type || body.eventType || now}`),
        workspace_id: workspaceId,
        entity_type: body.entity_type || body.entityType || 'conversation',
        entity_id: body.entity_id || body.entityId || null,
        event_type: body.event_type || body.eventType || 'event_created',
        payload: body.payload || {},
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    case 'reliabilityEvents':
      return {
        id: body.id || makeId('reliability', `${body.provider || body.event_type || now}`),
        workspace_id: workspaceId,
        provider: body.provider || 'demo',
        event_type: body.event_type || body.eventType || 'reliability.test_callback',
        status: body.status || 'received',
        replay_key: body.replay_key || body.replayKey || null,
        dedupe_key: body.dedupe_key || body.dedupeKey || null,
        payload: body.payload || {},
        error_message: body.error_message || body.errorMessage || null,
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
    default:
      return {
        id: body.id || makeId(key, `${body.name || now}`),
        workspace_id: workspaceId,
        ...clone(body),
        created_at: body.created_at || now,
        updated_at: body.updated_at || now
      };
  }
}

function findRecordById(table, recordId) {
  for (const state of workspaceStore.values()) {
    const collection = ensureCollection(state, table);
    const record = collection.find((item) => String(item.id) === String(recordId));
    if (record) {
      return { state, record, collection };
    }
  }
  return null;
}

function buildProviderReadiness() {
  return [
    {
      provider: 'gmail',
      label: 'Gmail',
      channelType: 'email',
      configured: true,
      externalAccountId: 'support@northstar.example',
      outboundImplemented: true,
      outboundReady: true,
      inboundReady: false,
      manualSetupMode: true,
      verificationMode: 'oauth + pubsub',
      recipientRequirement: 'email_address',
      operationalStatus: 'webhook_stale',
      statusReason: 'Connected in demo mode, but webhook setup still needs to be confirmed.',
      missing: [],
      rolloutPriority: 1,
      rolloutNote: 'Primary rollout target for the first live inbox.'
    },
    {
      provider: 'whatsapp',
      label: 'WhatsApp',
      channelType: 'whatsapp',
      configured: true,
      externalAccountId: '+2348015550101',
      outboundImplemented: true,
      outboundReady: true,
      inboundReady: true,
      manualSetupMode: true,
      verificationMode: 'meta webhook',
      recipientRequirement: 'phone_number',
      operationalStatus: 'connected',
      statusReason: 'Connected and webhook-ready in the demo workspace.',
      missing: [],
      rolloutPriority: 2,
      rolloutNote: 'Secondary rollout target after Gmail is stable.'
    },
    {
      provider: 'instagram',
      label: 'Instagram',
      channelType: 'instagram',
      configured: false,
      externalAccountId: '',
      outboundImplemented: true,
      outboundReady: false,
      inboundReady: false,
      manualSetupMode: true,
      verificationMode: 'meta webhook',
      recipientRequirement: 'platform_scoped_recipient_id',
      recipientHint: 'Reply tests need the sender id from a real inbound Instagram DM, not the business account id.',
      operationalStatus: 'token_missing',
      statusReason: 'Meta credentials and Instagram identifiers are missing.',
      missing: ['META_APP_ID', 'META_APP_SECRET', 'INSTAGRAM_BUSINESS_ACCOUNT_ID', 'FACEBOOK_PAGE_ID'],
      rolloutPriority: 3,
      rolloutNote: 'Enable after Meta webhook verification is stable and a real inbound DM provides a reply-safe recipient id.'
    },
    {
      provider: 'messenger',
      label: 'Messenger',
      channelType: 'messenger',
      configured: false,
      externalAccountId: '',
      outboundImplemented: true,
      outboundReady: false,
      inboundReady: false,
      manualSetupMode: true,
      verificationMode: 'meta webhook',
      recipientRequirement: 'page_scoped_recipient_id',
      recipientHint: 'Reply tests need the page-scoped sender id from a real inbound Messenger conversation.',
      operationalStatus: 'token_missing',
      statusReason: 'Meta credentials and page identifiers are missing.',
      missing: ['META_APP_ID', 'META_APP_SECRET', 'MESSENGER_PAGE_ID'],
      rolloutPriority: 4,
      rolloutNote: 'Follow Instagram once Meta verification is proven and a page-scoped sender id can be captured from a real conversation.'
    }
  ];
}

export function getDemoProviderReadiness() {
  return clone(buildProviderReadiness());
}

export function listDemoWorkspaces() {
  if (!workspaceStore.size) {
    ensureWorkspaceState(DEFAULT_WORKSPACE_ID);
  }
  return clone([...workspaceStore.values()].map((state) => state.workspace));
}

export function createDemoWorkspace(payload = {}) {
  const workspaceMeta = {
    id: payload.id || makeId('ws', payload.slug || payload.name || demoWorkspace.name),
    name: payload.name || demoWorkspace.name,
    slug: payload.slug || slugify(payload.name || demoWorkspace.name),
    plan: payload.plan || 'starter',
    ownerUserId: payload.ownerUserId || payload.owner_user_id || 'demo-user'
  };
  const state = buildWorkspaceSnapshot(workspaceMeta);
  workspaceStore.set(workspaceMeta.id, state);
  return clone(state.workspace);
}

export function createDemoWorkspaceMember(workspaceId, payload = {}) {
  const state = ensureWorkspaceState(workspaceId);
  const member = {
    id: makeId('member', `${workspaceId}-${payload.user_id || payload.userId || 'user'}`),
    workspace_id: workspaceId,
    user_id: payload.user_id || payload.userId || 'demo-user',
    role: payload.role || 'owner',
    created_at: nowIso(),
    updated_at: nowIso()
  };
  const existingIndex = state.members.findIndex((item) => String(item.user_id) === String(member.user_id));
  if (existingIndex >= 0) {
    state.members[existingIndex] = member;
  } else {
    state.members.push(member);
  }
  return clone(member);
}

export function loadDemoWorkspaceSnapshot(workspaceId) {
  const state = ensureWorkspaceState(workspaceId);
  const syncJobs = listWorkspaceJobs(workspaceId);
  const replayDiagnostics = getWebhookReplayDiagnostics(workspaceId);
  const jobCounts = syncJobs.reduce((acc, job) => {
    const status = String(job.status || 'queued').toLowerCase();
    acc.total += 1;
    if (status === 'queued') acc.queued += 1;
    else if (status === 'retrying') acc.retrying += 1;
    else if (status === 'failed') acc.failed += 1;
    else if (status === 'completed') acc.completed += 1;
    else if (status === 'escalated') acc.escalated += 1;
    else if (status === 'assigned') acc.assigned += 1;
    return acc;
  }, { total: 0, queued: 0, retrying: 0, failed: 0, completed: 0, escalated: 0, assigned: 0 });
  return canonicalizeWorkspaceSnapshot({
    contacts: state.contacts,
    leads: state.contacts.map((contact) => ({
      id: makeId('lead', `${contact.id || contact.external_contact_id || contact.name}`),
      workspace_id: workspaceId,
      source_provider: contact.source_provider || 'demo',
      external_lead_id: contact.external_contact_id || contact.external_id || makeId('lead-external', `${contact.name || contact.email}`),
      contact_id: contact.id || null,
      conversation_id: null,
      name: contact.name || 'Lead',
      email: contact.email || '',
      phone: contact.phone || '',
      phone_e164: contact.phone || null,
      company: contact.company || '',
      lead_stage: contact.lead_stage || 'new',
      lead_score: Number(contact.metadata?.lead_score || 0) || 0,
      capture_reason: contact.metadata?.capture_reason || 'Seeded from demo contact data',
      captured_from: contact.source_provider || 'demo',
      tags: Array.isArray(contact.tags) ? contact.tags : [],
      metadata: clone(contact.metadata || {}),
      created_at: contact.created_at || nowIso(),
      updated_at: contact.updated_at || nowIso()
    })),
    conversations: state.conversations,
    messages: state.messages,
    trainingSources: state.trainingSources,
    channels: state.channels,
    connections: state.connections || [],
    agents: state.agents,
    sequences: state.sequences,
    voiceProfiles: state.voiceProfiles,
    voiceSessions: state.voiceSessions,
    voiceNotes: state.voiceNotes,
    activityEvents: state.activityEvents,
    automations: state.automations,
    integrations: state.integrations,
    tagSuggestions: state.tagSuggestions,
    sequenceStepTemplates: state.sequenceStepTemplates,
    providerIssueNotes: state.providerIssueNotes,
    reliabilityEvents: state.reliabilityEvents,
    syncJobs,
    workflowQueue: syncJobs.filter((job) => String(job.type || '').startsWith('workflow.')),
    members: state.members,
    workspace: state.workspace,
    billing: state.billing,
    team: state.team,
    reliability: {
      summary: {
        jobCounts,
        replayCounts: replayDiagnostics,
        hasRetryingJobs: jobCounts.retrying > 0,
        hasFailedJobs: jobCounts.failed > 0
      },
      recentFailures: syncJobs.filter((job) => ['retrying', 'failed'].includes(String(job.status || '').toLowerCase())).slice(0, 8),
      recentReplays: Array.isArray(replayDiagnostics.items) ? replayDiagnostics.items.slice(0, 8) : [],
      fallback: true
    }
  });
}

export function listDemoCollection(workspaceId, table) {
  const state = ensureWorkspaceState(workspaceId);
  return clone(ensureCollection(state, table));
}

export function createDemoCollectionRecord(workspaceId, table, body = {}) {
  const state = ensureWorkspaceState(workspaceId);
  const collection = ensureCollection(state, table);
  const record = makeCollectionRecord(table, workspaceId, body);
  collection.unshift(record);
  return clone(record);
}

export function patchDemoCollectionRecord(table, recordId, patch = {}) {
  const found = findRecordById(table, recordId);
  if (!found) {
    throw new Error(`Demo record not found: ${table}:${recordId}`);
  }

  const { record } = found;
  Object.assign(record, clone(patch), { updated_at: nowIso() });
  return clone(record);
}

export function updateDemoMessageByExternalId(workspaceId, externalMessageId, patch = {}) {
  const found = findRecordByExternalId('messages', externalMessageId, workspaceId);
  if (!found) {
    throw new Error(`Demo message not found: ${externalMessageId}`);
  }

  const { record } = found;
  const nextPatch = clone(patch);
  if (nextPatch.raw_payload) {
    nextPatch.raw_payload = {
      ...(record.raw_payload || {}),
      ...(nextPatch.raw_payload || {})
    };
  }
  if (Array.isArray(nextPatch.delivery_receipts)) {
    nextPatch.delivery_receipts = [
      ...(Array.isArray(record.delivery_receipts) ? record.delivery_receipts : []),
      ...nextPatch.delivery_receipts
    ];
  }
  Object.assign(record, nextPatch, { updated_at: nowIso() });
  return clone(record);
}

export function replyToDemoConversation(conversationId, payload = {}) {
  const found = findRecordById('conversations', conversationId);
  const now = nowIso();
  if (!found) {
    throw new Error(`Demo conversation not found: ${conversationId}`);
  }

  const { state, record: conversation } = found;
  const message = makeCollectionRecord('messages', conversation.workspace_id, {
    workspace_id: conversation.workspace_id,
    conversation_id: conversationId,
    source_provider: payload.source_provider || payload.sourceProvider || 'manual',
    external_message_id: payload.external_message_id || payload.externalMessageId || makeId('reply', `${conversationId}-${Date.now()}`),
    direction: payload.direction || 'outbound',
    sender_name: payload.sender_name || payload.senderName || 'AuraFlow',
    body: payload.body || '',
    delivery_state: payload.delivery_state || payload.deliveryState || (String(payload.direction || 'outbound').toLowerCase() === 'outbound' ? 'sent' : 'received'),
    delivery_receipts: Array.isArray(payload.delivery_receipts || payload.deliveryReceipts) ? (payload.delivery_receipts || payload.deliveryReceipts) : [],
    raw_payload: payload.raw_payload || payload.rawPayload || {}
  });
  state.messages.unshift(message);

  conversation.status = payload.status || conversation.status || 'open';
  conversation.summary = conversation.summary || payload.body || conversation.summary;
  conversation.last_message_at = payload.last_message_at || now;
  conversation.updated_at = now;

  if (payload.patchConversation !== false) {
    conversation.status = payload.status || conversation.status;
  }

  const activity = makeCollectionRecord('activity_events', conversation.workspace_id, {
    workspace_id: conversation.workspace_id,
    entity_type: 'conversation',
    entity_id: conversationId,
    event_type: payload.mode === 'queued' ? 'outbound_reply_queued' : 'outbound_reply_sent',
    payload: {
      body: payload.body || '',
      mode: payload.mode || 'sent',
      sender_name: payload.sender_name || payload.senderName || 'AuraFlow'
    }
  });
  state.activityEvents.unshift(activity);

  return clone(message);
}

export function createDemoActivityEvent(workspaceId, payload = {}) {
  const state = ensureWorkspaceState(workspaceId);
  const record = makeCollectionRecord('activity_events', workspaceId, payload);
  state.activityEvents.unshift(record);
  return clone(record);
}

export function findDemoWorkspace(workspaceId) {
  const state = ensureWorkspaceState(workspaceId);
  return clone(state.workspace);
}

export function findDemoConversation(conversationId) {
  const found = findRecordById('conversations', conversationId);
  return found ? clone(found.record) : null;
}

export function listDemoWorkspaceMembers(workspaceId) {
  const state = ensureWorkspaceState(workspaceId);
  return clone(state.members);
}

export function createDemoConnectSession(payload = {}) {
  const provider = String(payload.allowedIntegrations?.[0] || payload.provider || 'gmail').toLowerCase();
  const workspaceId = payload.workspaceId || payload.end_user?.id || 'auraflow-local';
  const baseUrl = new URL('https://connect.nango.dev/');
  baseUrl.searchParams.set('provider', provider);
  baseUrl.searchParams.set('workspace_id', workspaceId);
  return {
    url: baseUrl.toString(),
    connectUrl: baseUrl.toString(),
    session_token: `demo-${provider}-${workspaceId}`,
    token: `demo-${provider}-${workspaceId}`
  };
}

export function ingestDemoProviderPayload(payload = {}) {
  const workspaceId = payload.workspaceId || payload.workspace_id || DEFAULT_WORKSPACE_ID;
  const state = ensureWorkspaceState(workspaceId);
  const provider = String(payload.provider || 'gmail').toLowerCase();
  const contact = payload.contact
    ? upsertCollectionRecord('contacts', workspaceId, payload.contact, payload.contact.external_contact_id || payload.contact.externalContactId || payload.contact.externalId)
    : null;
  const conversation = payload.conversation
    ? upsertCollectionRecord('conversations', workspaceId, {
      ...payload.conversation,
      contact_id: contact?.id || payload.conversation.contact_id || null
    }, payload.conversation.external_conversation_id || payload.conversation.externalConversationId || payload.conversation.externalId)
    : null;
  const messages = Array.isArray(payload.messages)
    ? payload.messages.map((message) => upsertCollectionRecord('messages', workspaceId, {
      ...message,
      conversation_id: conversation?.id || message.conversation_id || null
    }, message.external_message_id || message.externalMessageId || message.externalId))
    : [];

  if (conversation) {
    state.activityEvents.unshift(createDemoActivityEvent(workspaceId, {
      entity_type: 'conversation',
      entity_id: conversation.id,
      event_type: payload.eventType || `${provider}.thread_ingested`,
      payload: {
        provider,
        account_id: payload.accountId || payload.account_id || '',
        verification: payload.verification || {},
        eventType: payload.eventType || `${provider}.thread_ingested`
      }
    }));
  }

  const channelIndex = state.channels.findIndex((channel) => String(channel.provider || '').toLowerCase() === provider);
  const now = nowIso();
  const updatedChannel = {
    ...(channelIndex >= 0 ? state.channels[channelIndex] : createChannelPayload({
      workspaceId,
      provider,
      channelType: provider === 'gmail' ? 'email' : provider,
      displayName: provider.toUpperCase(),
      status: 'live',
      providerAccountId: payload.accountId || payload.account_id || payload.contact?.email || payload.contact?.phone || ''
    })),
    status: 'live',
    external_metadata: {
      ...((channelIndex >= 0 ? state.channels[channelIndex] : {}).external_metadata || {}),
      webhook_status: 'connected',
      last_webhook_at: now,
      last_provider_event: payload.eventType || `${provider}.thread_ingested`,
      last_webhook_verification: payload.verification || {}
    },
    updated_at: now
  };
  if (channelIndex >= 0) {
    state.channels[channelIndex] = updatedChannel;
  } else {
    state.channels.unshift(updatedChannel);
  }

  return clone({
    provider,
    workspaceId,
    contact,
    conversation,
    messages,
    activityEventCount: state.activityEvents.length
  });
}
