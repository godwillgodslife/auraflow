import { formatDurationFromMinutes, formatRelativeDate } from './formatters.js';
import { renderAiRecommendationCard } from '../integrations/ai-recommendation.js';
import {
  renderAiAnalyticsBrief,
  renderAiDeployBrief,
  renderAiFollowUpBrief,
  renderAiLeadBrief,
  renderAiOutreachGuide,
  renderTemplateGallery,
  renderTemplateHealthPanel,
  renderPermissionsPanel,
  renderReliabilityPanel,
  renderWorkspaceOpsReadiness
} from './preview-renderers.js';

function setText(node, value) {
  if (node) node.textContent = value;
}

function calculateAverageFirstReply(conversations = [], messages = []) {
  const byConversation = new Map();
  messages.forEach((message) => {
    if (!message.conversation_id) return;
    if (!byConversation.has(message.conversation_id)) byConversation.set(message.conversation_id, []);
    byConversation.get(message.conversation_id).push(message);
  });

  const durations = [];
  conversations.forEach((conversation) => {
    const thread = (byConversation.get(conversation.id) || [])
      .slice()
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
    const inbound = thread.find((item) => String(item.direction || '').toLowerCase() === 'inbound');
    const outbound = inbound
      ? thread.find((item) => String(item.direction || '').toLowerCase() === 'outbound' && new Date(item.created_at).getTime() >= new Date(inbound.created_at).getTime())
      : null;
    if (!inbound || !outbound) return;
    const diffMinutes = (new Date(outbound.created_at).getTime() - new Date(inbound.created_at).getTime()) / 60000;
    if (Number.isFinite(diffMinutes) && diffMinutes >= 0) {
      durations.push(diffMinutes);
    }
  });

  if (!durations.length) return 0;
  return durations.reduce((sum, value) => sum + value, 0) / durations.length;
}

function buildOwnerMatchers(auth = {}) {
  const email = String(auth.sessionEmail || auth.user?.email || '').trim().toLowerCase();
  const localPart = email.includes('@') ? email.split('@')[0] : email;
  const localTokens = localPart.split(/[._-]+/).filter(Boolean);
  return { email, localPart, localTokens };
}

function isConversationMine(conversation = {}, ownerMatchers = {}) {
  const owner = String(conversation.owner || '').trim().toLowerCase();
  if (!owner || owner === 'unassigned') return false;
  if (ownerMatchers.email && owner.includes(ownerMatchers.email)) return true;
  if (ownerMatchers.localPart && owner.includes(ownerMatchers.localPart)) return true;
  return Array.isArray(ownerMatchers.localTokens) && ownerMatchers.localTokens.length
    ? ownerMatchers.localTokens.every((token) => owner.includes(token))
    : false;
}

function normalizeIdentityEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeIdentityPhone(value = '') {
  return String(value || '').replace(/[^\d]/g, '').trim();
}

function countDuplicateContactClusters(contacts = []) {
  const buckets = new Map();
  (Array.isArray(contacts) ? contacts : []).forEach((contact) => {
    const keys = [
      normalizeIdentityEmail(contact?.email),
      normalizeIdentityPhone(contact?.phone)
    ].filter(Boolean);
    keys.forEach((key) => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(contact?.id || key);
    });
  });
  return Array.from(buckets.values()).filter((items) => new Set(items).size > 1).length;
}

function buildDuplicateContactClusters(contacts = []) {
  const buckets = new Map();
  (Array.isArray(contacts) ? contacts : []).forEach((contact) => {
    const keys = [
      normalizeIdentityEmail(contact?.email),
      normalizeIdentityPhone(contact?.phone)
    ].filter(Boolean);
    keys.forEach((key) => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(contact);
    });
  });
  return Array.from(buckets.entries())
    .map(([key, items]) => ({ key, items: Array.from(new Map(items.map((item) => [item.id || key, item])).values()) }))
    .filter((entry) => entry.items.length > 1)
    .slice(0, 5);
}

function getLatestInboundMessage(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => String(item.direction || '').toLowerCase() === 'inbound')
    .slice()
    .sort((left, right) => new Date(right.created_at || right.updated_at || 0).getTime() - new Date(left.created_at || left.updated_at || 0).getTime())[0] || null;
}

function getWhatsAppTemplateModeState(conversation = null, messages = [], briefing = {}) {
  const provider = String(conversation?.source_provider || conversation?.source || conversation?.channel || '').toLowerCase();
  if (provider !== 'whatsapp') {
    return {
      suggestedMode: 'freeform',
      policyLimited: false,
      recommendedTemplate: '',
      status: 'Free-form is available on this channel.',
      sequenceStatus: 'Template mode only matters for WhatsApp sequence steps.'
    };
  }
  const latestInbound = getLatestInboundMessage(messages);
  const latestInboundAt = latestInbound?.created_at || latestInbound?.updated_at || '';
  const ageHours = latestInboundAt ? (Date.now() - new Date(latestInboundAt).getTime()) / 3600000 : Number.POSITIVE_INFINITY;
  const policyLimited = !latestInboundAt || ageHours > 24;
  const sequence = briefing?.sequenceSuggestion || {};
  const recommendedTemplate = policyLimited
    ? (String(sequence.goal || briefing?.nextAction || '').toLowerCase().includes('appoint') ? 'appointment_reminder' : 'lead_intro')
    : '';
  return {
    suggestedMode: policyLimited ? 'auto' : 'freeform',
    policyLimited,
    recommendedTemplate,
    status: policyLimited
      ? `The last inbound WhatsApp activity is older than about 24 hours, so a template-backed send is safer now.${recommendedTemplate === 'appointment_reminder' ? ' Appointment reminder is the strongest fit.' : ' Lead intro is the safest default template path.'}`
      : `The latest inbound WhatsApp message is still fresh enough for a free-form reply.${latestInboundAt ? ` Last inbound ${formatRelativeDate(latestInboundAt)}.` : ''}`,
    sequenceStatus: policyLimited
      ? 'Sequence steps that continue on WhatsApp should stay template-backed until the customer re-engages.'
      : 'Sequence steps can stay free-form on WhatsApp while the thread remains active.'
  };
}

function getContactPhoneHealth(contact = {}) {
  const metadata = contact?.metadata || {};
  const lookup = metadata.phone_lookup || {};
  const health = metadata.phone_health || {};
  return {
    lineType: String(health.line_type || lookup.line_type || '').trim().toLowerCase(),
    carrierName: String(health.carrier_name || lookup.carrier_name || '').trim(),
    valid: health.valid === true || lookup.valid === true
  };
}

  function extractFailureReason(message = {}) {
  const raw = message?.raw_payload || message?.rawPayload || {};
  const providerResult = raw.provider_result || raw.providerResult || {};
  const receipts = Array.isArray(message?.delivery_receipts)
    ? message.delivery_receipts
    : Array.isArray(raw.delivery_receipts)
      ? raw.delivery_receipts
      : [];
  return [
    providerResult.error,
    providerResult.errorMessage,
    providerResult.message,
    raw.error,
    raw.error_message,
    ...receipts.map((receipt) => receipt?.error)
    ].map((value) => String(value || '').trim()).find(Boolean) || '';
  }

  function classifyFailureReason(reason = '') {
    const normalized = String(reason || '').trim().toLowerCase();
    if (!normalized) return { label: '', guidance: '' };
    if (
      normalized.includes('auth')
      || normalized.includes('unauthorized')
      || normalized.includes('forbidden')
      || normalized.includes('token')
      || normalized.includes('permission')
      || normalized.includes('access denied')
    ) {
      return { label: 'Auth or access', guidance: 'Reconnect the channel or refresh provider access before retrying.' };
    }
    if (
      normalized.includes('template')
      || normalized.includes('policy')
      || normalized.includes('content sid')
      || normalized.includes('not approved')
      || normalized.includes('outside the allowed window')
    ) {
      return { label: 'Template or policy', guidance: 'Review the WhatsApp template, policy window, or approval state before retrying.' };
    }
    if (
      normalized.includes('invalid number')
      || normalized.includes('not a valid')
      || normalized.includes('recipient')
      || normalized.includes('phone')
      || normalized.includes('user unavailable')
      || normalized.includes('device')
    ) {
      return { label: 'Recipient issue', guidance: 'Verify the contact phone number or ask the customer to re-engage on WhatsApp.' };
    }
    if (
      normalized.includes('rate')
      || normalized.includes('throttle')
      || normalized.includes('timeout')
      || normalized.includes('temporar')
      || normalized.includes('network')
      || normalized.includes('queue')
    ) {
      return { label: 'Transient delivery', guidance: 'Safe to retry after a short delay unless the provider keeps throttling.' };
    }
    return { label: 'Needs review', guidance: 'Check the provider response before retrying in bulk.' };
  }

function buildRetryDiagnostics(messages = []) {
  const thread = Array.isArray(messages)
    ? messages
      .filter((item) => String(item.direction || '').toLowerCase() === 'outbound')
      .slice()
      .sort((left, right) => new Date(right.created_at || right.updated_at || 0).getTime() - new Date(left.created_at || left.updated_at || 0).getTime())
    : [];
  const latestFailure = thread.find((item) => ['failed', 'error', 'undelivered', 'retrying'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())) || null;
  if (!latestFailure) {
    return { hasFailure: false, retryCount: 0, lastRetryAt: '', nextRetryMode: '', failureReason: '' };
  }
  const failureTime = new Date(latestFailure.created_at || latestFailure.updated_at || 0).getTime();
  const retryAttempts = thread.filter((item) => new Date(item.created_at || item.updated_at || 0).getTime() > failureTime);
  const state = String(latestFailure.delivery_state || latestFailure.raw_payload?.delivery_state || '').toLowerCase();
  return {
    hasFailure: true,
    retryCount: retryAttempts.length,
    lastRetryAt: retryAttempts[0]?.created_at || retryAttempts[0]?.updated_at || '',
    nextRetryMode: state === 'retrying' ? 'Automatic retry queued' : 'Manual retry needed',
    failureReason: extractFailureReason(latestFailure)
  };
}

export function createRuntimeView({
  auth,
  saveAppState,
  ui,
  nodes = {}
}) {
  const {
    dashboardConversations,
    inboxCount,
    contactsRows,
    contactsCount,
    leadsRows,
    leadsCount,
    leadsStatus,
    welcomeTour,
    welcomeTourBadge,
    welcomeTourCopy,
    voiceProfilesList,
    voiceSessionsList,
    voiceNotesList,
    voiceAnalyticsBrief,
    voiceAnalyticsStatus,
    providerGrid,
    connectionsList,
    connectionsStatus,
    connectionsCount,
    templateHealthPanel,
    templateHealthStatus,
    templateGalleryPanel,
    templateGalleryStatus,
    opsReadinessPanel,
    opsReadinessStatus,
    duplicateReviewPanel,
    duplicateReviewStatus,
    duplicateReviewNote,
    workspaceRole,
    permissionsPanel,
    permissionsStatus,
    reliabilityPanel,
    reliabilityStatus,
    searchSection,
    webhookSetup,
    searchResults,
    searchStatus,
    searchInput,
    homeLeadsWeek,
    homeLeadsDetail,
    homeAiSent,
    homeAiDetail,
    homeChannelHealth,
    homeChannelDetail,
    homeSummaryCopy,
    homeNextStep,
    homeHealthBadge,
    homeHighlights,
    inboxFilters,
    inboxListStatus,
    followUpList,
    followUpCoverage,
    aiFollowupBrief,
    aiFollowupStatus,
    aiOutreachGuide,
    aiOutreachStatus,
    aiLeadBrief,
    aiLeadStatus,
    aiAnalyticsBrief,
    aiAnalyticsStatus,
    aiDeployBrief,
    aiDeployStatus,
    contactDetail,
    agentNameInput,
    agentToneInput,
    agentStatusInput,
    agentInstructionsInput,
    agentSourcesInput,
    agentSourceList,
    agentGuardrails,
    aiLiveThread,
    aiLiveStatus,
    aiLiveNote,
    aiRecommendation,
    aiOperatorLane,
    replyTemplateModeInput,
    replyTemplateStatus,
    sendReplyButton,
    replyTarget,
    threadWorkflow,
    replyStatus,
    workflowQueueList,
    workflowQueueStatus,
    workflowAssigneeInput,
    workflowNoteInput,
    selectedConversationTitle,
    selectedConversationChannel,
    selectedConversationStatus,
    selectedConversationOwner,
    selectedConversationUpdated,
    threadPrioritySummary,
    conversationInsights,
    replyGuidance,
    assignmentInput,
    messageThread,
    activityLog,
    voiceSessionContactSelect,
    voiceNoteContactSelect,
    contactMergeTargetSelect,
    voiceSessionProfileSelect,
    voiceNoteProfileSelect,
    voiceNoteSessionSelect,
    businessKnowledgeList,
    businessKnowledgeStatus,
    businessKnowledgeTopicInput,
    businessKnowledgeQuestionInput,
    businessKnowledgeAnswerInput,
    businessKnowledgeTagsInput,
    businessKnowledgePriorityInput,
    businessKnowledgeIdInput,
    sequenceTemplateModeInput,
    sequenceTemplateStatus,
    metrics = {},
    liveOps = {},
    voiceMetrics = {}
  } = nodes;

  function updateRuntimeView(snapshot, providerReadiness = []) {
    const contacts = ui.normalizeContacts(snapshot?.contacts || []);
    const leads = Array.isArray(snapshot?.leads) ? snapshot.leads.slice() : [];
    const ownerMatchers = buildOwnerMatchers(auth);
    const allWorkflowJobs = Array.isArray(auth.workflowQueue) && auth.workflowQueue.length
      ? auth.workflowQueue
      : Array.isArray(snapshot?.syncJobs) ? snapshot.syncJobs : Array.isArray(snapshot?.jobs) ? snapshot.jobs : [];
    const conversations = ui.normalizeConversations(
      snapshot?.conversations || [],
      contacts,
      snapshot?.channels || [],
      snapshot?.messages || [],
      snapshot?.activityEvents || [],
      allWorkflowJobs
    );
    const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
    const activityEvents = Array.isArray(snapshot?.activityEvents) ? snapshot.activityEvents : [];
    const channels = Array.isArray(snapshot?.channels) ? snapshot.channels : [];
    const connections = Array.isArray(snapshot?.connections) ? snapshot.connections : [];
    const sequences = Array.isArray(snapshot?.sequences) ? snapshot.sequences : [];
    const automations = Array.isArray(snapshot?.automations) ? snapshot.automations : [];
    const trainingSources = Array.isArray(snapshot?.trainingSources) ? snapshot.trainingSources : [];
    const businessKnowledge = Array.isArray(snapshot?.businessKnowledge) ? snapshot.businessKnowledge : [];
    const voiceProfiles = Array.isArray(snapshot?.voiceProfiles) ? snapshot.voiceProfiles : [];
    const voiceSessions = Array.isArray(snapshot?.voiceSessions) ? snapshot.voiceSessions : [];
    const voiceNotes = Array.isArray(snapshot?.voiceNotes) ? snapshot.voiceNotes : [];
    const contactTagSuggestions = Array.isArray(snapshot?.tagSuggestions) && snapshot.tagSuggestions.length
      ? snapshot.tagSuggestions
      : Array.from(new Set((snapshot?.contacts || []).flatMap((item) => Array.isArray(item.tags) ? item.tags : []))).filter(Boolean);
    const firstReplyMinutes = calculateAverageFirstReply(snapshot?.conversations || [], messages);
    const openConversations = (snapshot?.conversations || []).filter((item) => String(item.status || '').toLowerCase() !== 'closed');
    const closedConversations = (snapshot?.conversations || []).filter((item) => String(item.status || '').toLowerCase() === 'closed');
    const liveSequences = sequences.filter((item) => String(item.status || '').toLowerCase() === 'active');
    const queuedCalls = voiceSessions.filter((item) => ['queued', 'scheduled', 'in_progress'].includes(String(item.status || '').toLowerCase()));
    const analyzedVoiceFollowUps = voiceSessions.filter((item) => Boolean(item.analysis_metadata?.follow_up_plan));
    const transferCount = voiceSessions.filter((item) => String(item.outcome || '').toLowerCase().includes('transfer')).length;
    const warmContacts = (snapshot?.contacts || []).filter((item) => ['sql', 'qualified', 'demo booked', 'proposal'].includes(String(item.lead_stage || '').toLowerCase()));
    const unifiedProfiles = contacts.filter((item) => {
      const identities = Array.isArray(item.metadata?.identities) ? item.metadata.identities : [];
      const providerCount = new Set(identities.map((identity) => String(identity.provider || '').toLowerCase()).filter(Boolean)).size;
      return providerCount >= 2;
    });
    const duplicateClusters = countDuplicateContactClusters(contacts);
    const duplicateContactClusters = buildDuplicateContactClusters(contacts);
    const linkedIdentityCount = contacts.reduce((sum, item) => {
      const identities = Array.isArray(item.metadata?.identities) ? item.metadata.identities.length : 0;
      return sum + identities;
    }, 0);
    const refundLikeConversations = (snapshot?.conversations || []).filter((item) => {
      const text = `${item.subject || ''} ${item.summary || ''} ${item.priority || ''}`.toLowerCase();
      return text.includes('refund') || text.includes('charge') || text.includes('billing');
    });
    const solveRate = snapshot?.conversations?.length
      ? Math.round((closedConversations.length / snapshot.conversations.length) * 100)
      : 0;
    const providerOrder = new Map([
      ['gmail', 0],
      ['whatsapp', 1],
      ['instagram', 2],
      ['messenger', 3]
    ]);
    const sortedProviderReadiness = Array.isArray(providerReadiness)
      ? [...providerReadiness].sort((left, right) => {
        const leftKey = String(left?.provider || '').toLowerCase();
        const rightKey = String(right?.provider || '').toLowerCase();
        return (providerOrder.get(leftKey) ?? 99) - (providerOrder.get(rightKey) ?? 99);
      })
      : [];
    const sortedChannels = [...channels].sort((left, right) => {
      const leftKey = String(left?.provider || '').toLowerCase();
      const rightKey = String(right?.provider || '').toLowerCase();
      return (providerOrder.get(leftKey) ?? 99) - (providerOrder.get(rightKey) ?? 99);
    });
    const connectedCount = connections.filter((item) => String(item?.status || '').toLowerCase() === 'connected').length;
    const now = Date.now();
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const isWithinLastWeek = (value) => {
      const timestamp = new Date(value || 0).getTime();
      return Number.isFinite(timestamp) && timestamp >= weekAgo;
    };
    const leadsThisWeek = leads.filter((item) => isWithinLastWeek(item.created_at || item.updated_at)).length;
    const aiOutboundMessages = messages.filter((item) => {
      if (String(item.direction || '').toLowerCase() !== 'outbound') return false;
      if (!isWithinLastWeek(item.created_at || item.updated_at)) return false;
      const sender = String(item.sender_name || '').toLowerCase();
      return sender.includes('ai')
        || String(item.generated_by || '').toLowerCase() === 'ai'
        || String(item.raw_payload?.generated_by || '').toLowerCase() === 'ai';
    }).length;
    const recentSentReplies = activityEvents.filter((item) => {
      if (!isWithinLastWeek(item.created_at || item.updated_at)) return false;
      return String(item.event_type || '').toLowerCase() === 'outbound_reply_sent';
    }).length;
    const aiResponsesSent = aiOutboundMessages || recentSentReplies;
    const outboundMessages = messages.filter((item) => String(item.direction || '').toLowerCase() === 'outbound');
    const deliveryTrackedMessages = outboundMessages.filter((item) => {
      const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
      return ['sent', 'queued', 'delivered', 'read', 'failed', 'undelivered'].includes(state);
    });
    const successfulDeliveries = deliveryTrackedMessages.filter((item) => {
      const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
      return ['delivered', 'read'].includes(state);
    }).length;
    const deliverySuccessRate = deliveryTrackedMessages.length
      ? (successfulDeliveries / deliveryTrackedMessages.length) * 100
      : 0;
    const whatsappTrackedMessages = outboundMessages.filter((item) => {
      const provider = String(item.source_provider || item.channel || item.raw_payload?.provider || '').toLowerCase();
      const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
      return provider === 'whatsapp' && ['sent', 'queued', 'delivered', 'read', 'failed', 'undelivered'].includes(state);
    });
    const whatsappDeliveredCount = whatsappTrackedMessages.filter((item) => ['delivered', 'read'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())).length;
    const whatsappReadCount = whatsappTrackedMessages.filter((item) => String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase() === 'read').length;
    const whatsappFailedCount = whatsappTrackedMessages.filter((item) => ['failed', 'undelivered'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())).length;
    const whatsappQueuedCount = whatsappTrackedMessages.filter((item) => ['sent', 'queued'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())).length;
    const latestWhatsAppFailure = whatsappTrackedMessages.find((item) => ['failed', 'undelivered'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())) || null;
    const whatsappFailureReason = extractFailureReason(latestWhatsAppFailure);
    const whatsappFailureCategory = classifyFailureReason(whatsappFailureReason);
    const whatsappRetryDiagnostics = buildRetryDiagnostics(whatsappTrackedMessages);
    const whatsappDeliveryRate = whatsappTrackedMessages.length
      ? (whatsappDeliveredCount / whatsappTrackedMessages.length) * 100
      : 0;
    const templateTraffic = whatsappTrackedMessages.filter((item) => {
      const raw = item.raw_payload || item.rawPayload || {};
      const providerResult = raw.provider_result || raw.providerResult || {};
      return Boolean(raw.content_sid || raw.contentSid || providerResult.content_sid || providerResult.contentSid || providerResult.template || raw.template_name);
    }).length;
    const policyBlocks = whatsappTrackedMessages.filter((item) => classifyFailureReason(extractFailureReason(item)).label === 'Template or policy').length;
    const transientBlocks = whatsappTrackedMessages.filter((item) => classifyFailureReason(extractFailureReason(item)).label === 'Transient delivery').length;
    const senderState = whatsappTrackedMessages.length
      ? 'live'
      : sortedProviderReadiness.find((item) => String(item.provider || '').toLowerCase() === 'whatsapp')?.configured
        ? 'configured'
        : 'unknown';
    const verifiedWebhooks = sortedProviderReadiness.filter((item) => String(item.webhookState || item.webhook_state || '').toLowerCase() === 'verified').length;
    const staleWebhooks = sortedProviderReadiness.filter((item) => {
      const state = String(item.webhookState || item.webhook_state || '').toLowerCase();
      return state && state !== 'verified';
    }).length;
    const reliabilitySummary = auth.reliability || snapshot?.reliability || null;
    const queuedReliabilityJobs = Number(reliabilitySummary?.summary?.jobCounts?.queued || 0);
    const retryingReliabilityJobs = Number(reliabilitySummary?.summary?.jobCounts?.retrying || 0);
    const failedReliabilityJobs = Number(reliabilitySummary?.summary?.jobCounts?.failed || 0);
    const analyzedVoiceNotes = voiceNotes.filter((item) => String(item.status || '').toLowerCase() === 'analyzed' || String(item.summary || '').trim()).length;
    const negativeVoiceCount = voiceNotes.filter((item) => String(item.sentiment || '').toLowerCase() === 'negative').length;
    const voiceReadyFollowUps = voiceNotes.filter((item) => Boolean(item.metadata?.follow_up_plan || item.analysis_metadata?.follow_up_plan)).length;
    const staleInboxThreads = conversations.filter((item) => item.oldestWaitingInbound).length;
    const attentionInboxThreads = conversations.filter((item) => item.needsAttention).length;
    const channelHealthValue = `${connectedCount}/4`;
    const channelHealthDetail = connectedCount === 4
      ? voiceProfiles.length
        ? 'All core channels are connected, and voice analysis is ready.'
        : 'All core channels are connected and ready.'
      : connectedCount
        ? `${4 - connectedCount} core channel${4 - connectedCount === 1 ? '' : 's'} still need attention.${voiceProfiles.length ? ` ${voiceProfiles.length} voice profile${voiceProfiles.length === 1 ? '' : 's'} already configured.` : ''}`
        : voiceProfiles.length
          ? 'No core channels connected yet, but voice analysis is already configured.'
          : 'No core channels connected yet.';
    const whatsappRetrySummary = whatsappRetryDiagnostics.hasFailure
      ? `${whatsappRetryDiagnostics.nextRetryMode}${whatsappRetryDiagnostics.retryCount ? ` after ${whatsappRetryDiagnostics.retryCount} prior ${whatsappRetryDiagnostics.retryCount === 1 ? 'retry' : 'retries'}` : ''}.${whatsappFailureCategory.label ? ` ${whatsappFailureCategory.label}. ${whatsappFailureCategory.guidance}` : ''}${whatsappFailureReason ? ` Latest blocker: ${whatsappFailureReason}.` : ''}${whatsappRetryDiagnostics.lastRetryAt ? ` Last retry ${ui.formatRelativeDate(whatsappRetryDiagnostics.lastRetryAt)}.` : ''}`
      : '';
    const homeSummary = leadsThisWeek
      ? `${leadsThisWeek} new lead${leadsThisWeek === 1 ? '' : 's'} landed in the last 7 days, with ${aiResponsesSent} AI-assisted response${aiResponsesSent === 1 ? '' : 's'} sent.${whatsappTrackedMessages.length ? ` WhatsApp delivery is currently ${Math.round(whatsappDeliveryRate)}% across tracked replies.${whatsappRetrySummary ? ` ${whatsappRetrySummary}` : ''}` : ''}${analyzedVoiceFollowUps.length ? ` ${analyzedVoiceFollowUps.length} voice follow-up plan${analyzedVoiceFollowUps.length === 1 ? '' : 's'} are also ready.` : ''}`
      : `Lead volume is still quiet, but ${channelHealthValue} core channels are currently connected.${unifiedProfiles.length ? ` ${unifiedProfiles.length} customer profile${unifiedProfiles.length === 1 ? '' : 's'} already span multiple channels.` : ''}${whatsappTrackedMessages.length ? ` WhatsApp delivery is currently ${Math.round(whatsappDeliveryRate)}% across tracked replies.${whatsappRetrySummary ? ` ${whatsappRetrySummary}` : ''}` : ''}`;
    const homeNextActionCopy = whatsappRetryDiagnostics.hasFailure
      ? 'Open Inbox in the Failed sends lane and retry the blocked WhatsApp thread before more customers stall.'
      : staleInboxThreads
      ? `Open Inbox and clear ${staleInboxThreads} stale inbound thread${staleInboxThreads === 1 ? '' : 's'} before the response SLA slips further.`
      : analyzedVoiceFollowUps.length
        ? `Open Data or Follow-up to action ${analyzedVoiceFollowUps.length} call recap${analyzedVoiceFollowUps.length === 1 ? '' : 's'} that already have recommended next steps.`
      : connectedCount < 2
        ? 'Open Settings to finish your light/dark preference and connect more channels for this workspace.'
      : openConversations.length
        ? `Head into Inbox to work ${openConversations.length} open conversation${openConversations.length === 1 ? '' : 's'} waiting on the team.`
        : 'Deploy looks healthy. Open Follow-up or Inbox to keep traffic moving.';
    const inboxCounts = {
      all: conversations.length,
      high_priority: conversations.filter((item) => item.slaRisk).length,
      mine: conversations.filter((item) => isConversationMine(item, ownerMatchers)).length,
      failed: conversations.filter((item) => ['failed', 'error', 'undelivered', 'retrying'].includes(String(item.latestDeliveryState || '').toLowerCase())).length,
      missed_call: conversations.filter((item) => item.hasMissedCallFollowup).length,
      sms_followup: conversations.filter((item) => item.hasSmsFollowup).length,
      unassigned: conversations.filter((item) => item.unassigned).length,
      escalated: conversations.filter((item) => item.escalatedUnassigned || item.escalationCount > 0 || Number(item.workflowCounts?.escalated || 0) > 0).length,
      attention: conversations.filter((item) => item.needsAttention).length,
      verified: conversations.filter((item) => item.verifiedLive).length,
      test: conversations.filter((item) => item.isTestThread).length
    };
    const activeFilter = String(auth.inboxFilter || 'all').toLowerCase();
    const filteredConversations = conversations.filter((item) => {
      if (activeFilter === 'high_priority') return item.slaRisk;
      if (activeFilter === 'mine') return isConversationMine(item, ownerMatchers);
      if (activeFilter === 'failed') return ['failed', 'error', 'undelivered', 'retrying'].includes(String(item.latestDeliveryState || '').toLowerCase());
      if (activeFilter === 'missed_call') return item.hasMissedCallFollowup;
      if (activeFilter === 'sms_followup') return item.hasSmsFollowup;
      if (activeFilter === 'unassigned') return item.unassigned;
      if (activeFilter === 'escalated') return item.escalatedUnassigned || item.escalationCount > 0 || Number(item.workflowCounts?.escalated || 0) > 0;
      if (activeFilter === 'attention') return item.needsAttention;
      if (activeFilter === 'verified') return item.verifiedLive;
      if (activeFilter === 'test') return item.isTestThread;
      return true;
    }).sort((left, right) => {
      const priorityDelta = Number(right.priorityRank || 0) - Number(left.priorityRank || 0);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(right.updatedAtRaw || 0).getTime() - new Date(left.updatedAtRaw || 0).getTime();
    });
    const oldestWaitingInboundCount = filteredConversations.filter((item) => item.oldestWaitingInbound).length;
    const slaRiskCount = filteredConversations.filter((item) => item.slaRisk).length;
    const escalatedUnassignedCount = filteredConversations.filter((item) => item.escalatedUnassigned).length;
    const missedCallCount = filteredConversations.filter((item) => item.hasMissedCallFollowup).length;
    const smsFollowupCount = filteredConversations.filter((item) => item.hasSmsFollowup).length;
    const verifiedNoOwnerCount = filteredConversations.filter((item) => item.verifiedNoOwner).length;
    const mineCount = filteredConversations.filter((item) => isConversationMine(item, ownerMatchers)).length;
    const unassignedCount = filteredConversations.filter((item) => item.unassigned).length;
    const coachingNote = escalatedUnassignedCount
      ? 'Start with escalated threads that still have no owner.'
      : activeFilter === 'high_priority'
        ? 'These leads have been waiting more than 15 minutes without a reply. Clear them first.'
        : activeFilter === 'failed'
        ? 'Retry the failed sends first so customers do not get stranded.'
      : oldestWaitingInboundCount
        ? 'Next best move is the oldest inbound threads still waiting on the team.'
        : verifiedNoOwnerCount
          ? 'Assign owners to verified live threads so replies do not stall.'
          : mineCount
            ? 'Your owned queue is clear enough to work from top to bottom.'
            : unassignedCount
              ? 'Pick up unassigned threads before they drift.'
              : 'Queue looks balanced right now.';

    if (dashboardConversations) {
      if (!auth.selectedConversationId && filteredConversations[0]) {
        auth.selectedConversationId = filteredConversations[0].id;
      }
      if (auth.selectedConversationId && !filteredConversations.find((item) => item.id === auth.selectedConversationId) && filteredConversations[0]) {
        auth.selectedConversationId = filteredConversations[0].id;
      }
      dashboardConversations.innerHTML = filteredConversations.length
        ? ui.renderConversationPreviewList(filteredConversations, auth.selectedConversationId)
        : '<div class="mini-status muted">No conversations synced yet.</div>';
      if (filteredConversations.length) {
        const insertedSections = new Set();
        filteredConversations.forEach((conversation) => {
          const rowButton = dashboardConversations.querySelector(`[data-conversation-id="${conversation.id}"]`);
          const row = rowButton?.querySelector('.conversation-copy');
          if (!rowButton || !row) return;
          rowButton.classList.toggle('priority-escalated', Boolean(conversation.escalatedUnassigned));
          rowButton.classList.toggle('priority-sla-risk', Boolean(conversation.slaRisk));
          rowButton.classList.toggle('priority-oldest', Boolean(conversation.oldestWaitingInbound && !conversation.escalatedUnassigned));
          rowButton.classList.toggle('priority-verified-unowned', Boolean(conversation.verifiedNoOwner && !conversation.escalatedUnassigned && !conversation.oldestWaitingInbound));
          rowButton.classList.toggle('priority-mine', Boolean(isConversationMine(conversation, ownerMatchers)));
          const sectionKey = conversation.slaRisk
            ? 'high-priority'
            : conversation.escalatedUnassigned
              ? 'top-priority'
            : conversation.oldestWaitingInbound
              ? 'oldest-inbound'
              : conversation.verifiedNoOwner
                ? 'verified-unowned'
                : isConversationMine(conversation, ownerMatchers)
                  ? 'mine'
                  : 'everything-else';
          const sectionLabel = sectionKey === 'high-priority'
            ? 'High priority'
            : sectionKey === 'top-priority'
            ? 'Top priority'
            : sectionKey === 'oldest-inbound'
              ? 'Oldest waiting inbound'
              : sectionKey === 'verified-unowned'
                ? 'Verified live with no owner'
                : sectionKey === 'mine'
                  ? 'My queue'
                  : 'Everything else';
          if (!insertedSections.has(sectionKey)) {
            rowButton.insertAdjacentHTML('beforebegin', `<div class="conversation-section-label" data-section-key="${ui.escapeHtml(sectionKey)}">${ui.escapeHtml(sectionLabel)}</div>`);
            insertedSections.add(sectionKey);
          }
          const previewTags = row.querySelector('.preview-tags');
          if (conversation.workflowLabel) {
            const existingWorkflowStatus = row.querySelector('[data-thread-workflow-label]');
            if (!existingWorkflowStatus) {
              previewTags?.insertAdjacentHTML('afterbegin', `<span class="badge accent" data-thread-workflow-label>${ui.escapeHtml(conversation.workflowLabel)}</span>`);
            }
          }
          if (conversation.workflowCounts?.total) {
            const existingWorkflowCount = row.querySelector('[data-thread-workflow-count]');
            if (!existingWorkflowCount) {
              previewTags?.insertAdjacentHTML('beforeend', `<span class="badge muted" data-thread-workflow-count>${ui.escapeHtml(String(conversation.workflowCounts.total))} workflow</span>`);
            }
          }
        });
      }
    }
    if (inboxFilters) {
      inboxFilters.innerHTML = ui.renderInboxFilterBar(activeFilter, inboxCounts);
    }
    if (inboxListStatus) {
      inboxListStatus.textContent = filteredConversations.length
        ? `${filteredConversations.length} thread${filteredConversations.length === 1 ? '' : 's'} shown. ${slaRiskCount} high priority, ${missedCallCount} missed-call follow-ups, ${smsFollowupCount} SMS follow-ups, ${oldestWaitingInboundCount} oldest waiting inbound, ${escalatedUnassignedCount} escalated + unassigned, ${verifiedNoOwnerCount} verified live with no owner, and ${mineCount} in your lane. ${coachingNote}`
        : 'No threads match the current inbox filter yet.';
    }

    setText(inboxCount, `${openConversations.length} waiting`);

    if (contactsRows) {
      contactsRows.innerHTML = contacts.length
        ? ui.renderContactRows(contacts.slice(0, 8))
        : '<tr><td colspan="5">No contacts synced yet.</td></tr>';
    }

    setText(contactsCount, `${contacts.length} contacts`);

    if (leadsRows) {
      const sortedLeads = leads
        .slice()
        .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime());
      leadsRows.innerHTML = sortedLeads.length
        ? ui.renderLeadRows(sortedLeads.slice(0, 10))
        : '<tr><td colspan="5">No leads captured yet.</td></tr>';
    }
    if (leadsCount) {
      setText(leadsCount, `${leads.length} lead${leads.length === 1 ? '' : 's'} tracked`);
    }
    if (leadsStatus) {
      const metaLeadCount = leads.filter((item) => ['facebook', 'messenger', 'instagram', 'meta'].includes(String(item.source_provider || '').toLowerCase())).length;
      const latestLead = leads
        .slice()
        .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())[0];
      leadsStatus.textContent = latestLead
        ? `${metaLeadCount} Meta lead${metaLeadCount === 1 ? '' : 's'} currently visible. Latest capture updated ${formatRelativeDate(latestLead.updated_at || latestLead.created_at)}.`
        : 'Meta and Gmail leads will appear here with source fields, routing details, and capture timestamps.';
    }

    if (welcomeTour) {
      const dismissedWorkspaceIds = Array.isArray(auth.onboarding?.dismissedWorkspaceIds)
        ? auth.onboarding.dismissedWorkspaceIds
        : [];
      const connectedWorkspaceAccounts = connections.filter((item) => String(item?.status || '').toLowerCase() === 'connected');
      const shouldShowWelcomeTour = Boolean(auth.workspaceId)
        && !dismissedWorkspaceIds.includes(String(auth.workspaceId))
        && connectedWorkspaceAccounts.length < 2
        && contacts.length < 3;
      welcomeTour.hidden = !shouldShowWelcomeTour;
      if (shouldShowWelcomeTour) {
        if (welcomeTourBadge) {
          welcomeTourBadge.textContent = connectedWorkspaceAccounts.length ? 'Almost ready' : 'New workspace';
        }
        if (welcomeTourCopy) {
          const linkedLabels = connectedWorkspaceAccounts
            .map((item) => String(item.provider || '').replace(/^./, (char) => char.toUpperCase()))
            .join(', ');
          welcomeTourCopy.textContent = connectedWorkspaceAccounts.length
            ? `You already linked ${linkedLabels}. Head to Settings to finish Facebook and WhatsApp, then confirm webhook health in Deploy.`
            : 'Start in Settings, connect Facebook and WhatsApp, then return to Deploy to verify webhooks and go live.';
        }
      }
    }

    if (voiceProfilesList) voiceProfilesList.innerHTML = ui.renderVoiceProfiles(voiceProfiles);
    if (voiceSessionsList) voiceSessionsList.innerHTML = ui.renderVoiceSessions(voiceSessions, snapshot?.contacts || [], voiceProfiles);
    if (voiceNotesList) voiceNotesList.innerHTML = ui.renderVoiceNotes(voiceNotes, snapshot?.contacts || [], voiceProfiles);
    if (voiceAnalyticsBrief) {
      voiceAnalyticsBrief.innerHTML = `
        <div class="check-item">
          <span>DG</span>
          <div>
            <strong>${ui.escapeHtml(analyzedVoiceNotes ? `${analyzedVoiceNotes} analyzed call${analyzedVoiceNotes === 1 ? '' : 's'}` : 'No analyzed calls yet')}</strong>
            <span>${ui.escapeHtml(analyzedVoiceNotes ? `${negativeVoiceCount} negative mood signal${negativeVoiceCount === 1 ? '' : 's'} and ${voiceReadyFollowUps} follow-up plan${voiceReadyFollowUps === 1 ? '' : 's'} are already in the workspace.` : 'Run Deepgram on a completed call to unlock summaries, sentiment, and follow-up guidance here.')}</span>
          </div>
          <span class="badge ${analyzedVoiceNotes ? 'accent' : 'neutral'}">${ui.escapeHtml(analyzedVoiceNotes ? 'Active' : 'Waiting')}</span>
        </div>
        <div class="check-item">
          <span>MO</span>
          <div>
            <strong>${ui.escapeHtml(negativeVoiceCount ? `${negativeVoiceCount} negative mood signal${negativeVoiceCount === 1 ? '' : 's'}` : 'Mood looks calm')}</strong>
            <span>${ui.escapeHtml(negativeVoiceCount ? 'These calls should be reviewed for escalation, pricing friction, or recovery follow-up.' : 'No negative-call cluster is standing out in the analyzed voice notes right now.')}</span>
          </div>
          <span class="badge ${negativeVoiceCount ? 'warning' : 'success'}">${ui.escapeHtml(negativeVoiceCount ? 'Watch' : 'Stable')}</span>
        </div>
      `;
    }
    if (voiceAnalyticsStatus) {
      voiceAnalyticsStatus.textContent = analyzedVoiceNotes ? `${voiceReadyFollowUps} ready` : 'Idle';
    }
    if (providerGrid) providerGrid.innerHTML = ui.renderProviderGrid(sortedProviderReadiness, sortedChannels);
    if (connectionsList) connectionsList.innerHTML = ui.renderWorkspaceConnections(connections, sortedChannels);
    setText(homeLeadsWeek, String(leadsThisWeek));
    setText(homeLeadsDetail, leadsThisWeek ? 'Captured across Gmail, Meta, and manual intake in the last 7 days.' : 'No new leads captured in the last 7 days.');
    setText(homeAiSent, String(aiResponsesSent));
    setText(homeAiDetail, aiResponsesSent ? 'AI-assisted replies sent in the last 7 days.' : 'No AI-assisted replies have been sent in the last 7 days.');
    setText(homeChannelHealth, channelHealthValue);
    setText(homeChannelDetail, channelHealthDetail);
    setText(homeSummaryCopy, homeSummary);
    setText(homeNextStep, homeNextActionCopy);
    setText(homeHealthBadge, connectedCount === 4 ? 'Healthy' : connectedCount ? 'In progress' : 'Setup needed');
    if (homeHighlights) {
      const highlightItems = [];
      if (leadsThisWeek) {
        highlightItems.push({
          title: `${leadsThisWeek} lead${leadsThisWeek === 1 ? '' : 's'} captured this week`,
          detail: 'Lead capture is active across your connected intake channels.'
        });
      }
      if (openConversations.length) {
        highlightItems.push({
          title: `${openConversations.length} open conversation${openConversations.length === 1 ? '' : 's'} waiting`,
          detail: 'Inbox is ready for operator action or AI-assisted response.'
        });
      }
      if (connectedCount < 4) {
        highlightItems.push({
          title: `${4 - connectedCount} core channel${4 - connectedCount === 1 ? '' : 's'} still not connected`,
          detail: 'Finish channel setup in Settings and verify readiness in Deploy.'
        });
      }
      if (analyzedVoiceFollowUps.length) {
        highlightItems.push({
          title: `${analyzedVoiceFollowUps.length} voice follow-up plan${analyzedVoiceFollowUps.length === 1 ? '' : 's'} ready`,
          detail: 'Deepgram recaps are now turning into concrete next-action guidance for the team.'
        });
      }
        if (unifiedProfiles.length) {
          highlightItems.push({
            title: `${unifiedProfiles.length} customer profile${unifiedProfiles.length === 1 ? '' : 's'} span multiple channels`,
            detail: `${linkedIdentityCount} linked identity record${linkedIdentityCount === 1 ? '' : 's'} are already helping AuraFlow unify customer context.`
          });
        }
        if (duplicateClusters) {
          highlightItems.push({
            title: `${duplicateClusters} duplicate contact cluster${duplicateClusters === 1 ? '' : 's'} still need cleanup`,
            detail: 'Identity merge is working, but a few customers still show up more than once across email or phone variants.'
          });
        }
        if (whatsappTrackedMessages.length) {
          highlightItems.push({
            title: `WhatsApp delivery is ${Math.round(whatsappDeliveryRate)}% across ${whatsappTrackedMessages.length} tracked repl${whatsappTrackedMessages.length === 1 ? 'y' : 'ies'}`,
            detail: whatsappFailedCount
              ? `${whatsappFailedCount} failed or undelivered message${whatsappFailedCount === 1 ? '' : 's'} still need an operator retry.${whatsappFailureCategory.label ? ` ${whatsappFailureCategory.label}. ${whatsappFailureCategory.guidance}` : ''}${whatsappRetryDiagnostics.hasFailure ? ` ${whatsappRetryDiagnostics.nextRetryMode}${whatsappRetryDiagnostics.retryCount ? ` after ${whatsappRetryDiagnostics.retryCount} prior ${whatsappRetryDiagnostics.retryCount === 1 ? 'retry' : 'retries'}` : ''}.` : ''}${whatsappFailureReason ? ` Latest blocker: ${whatsappFailureReason}.` : ''}`
              : `${whatsappReadCount} read receipt${whatsappReadCount === 1 ? '' : 's'} show customers are actually seeing the replies.`
          });
        }
        if (aiResponsesSent) {
          highlightItems.push({
            title: `${aiResponsesSent} AI-assisted response${aiResponsesSent === 1 ? '' : 's'} sent`,
            detail: 'AI drafting and outbound activity are already showing useful throughput.'
          });
        }
        if (staleInboxThreads) {
          highlightItems.push({
            title: `${staleInboxThreads} inbound thread${staleInboxThreads === 1 ? '' : 's'} are at SLA risk`,
            detail: 'These customers have been waiting long enough that they should move to the top of the queue now.'
          });
        }
      if (!highlightItems.length) {
        highlightItems.push({
          title: 'Workspace setup is still in progress',
          detail: 'Connect Gmail, Facebook, Messenger, Instagram, or WhatsApp to start filling the operator queue.'
        });
      }
      homeHighlights.innerHTML = highlightItems.slice(0, 4).map((item) => `
        <div class="check-item">
          <span>OK</span>
          <div><strong>${ui.escapeHtml(item.title)}</strong><span>${ui.escapeHtml(item.detail)}</span></div>
        </div>
      `).join('');
    }
    if (connectionsCount) {
      connectionsCount.textContent = `${connectedCount}/4 connected`;
    }
    if (connectionsStatus) {
      const gmailConnection = connections.find((item) => String(item?.provider || '').toLowerCase() === 'gmail');
      const metaConnections = connections.filter((item) => ['messenger', 'instagram', 'whatsapp'].includes(String(item?.provider || '').toLowerCase()));
      const voiceReady = voiceProfiles.length
        ? `${voiceProfiles.length} voice profile${voiceProfiles.length === 1 ? '' : 's'} ready`
        : 'voice not configured yet';
      connectionsStatus.textContent = connections.length
        ? `Workspace-scoped connections are active here. Gmail is ${gmailConnection ? 'linked' : 'not linked'}, ${metaConnections.length} Meta channel${metaConnections.length === 1 ? '' : 's'} ${metaConnections.length === 1 ? 'is' : 'are'} saved for this workspace, and ${voiceReady}.`
        : `No workspace-scoped connections are saved yet. Connect Gmail or Meta here and AuraFlow will store them against this workspace, while ${voiceReady}.`;
    }
    if (templateHealthPanel) {
      const leadIntroObserved = whatsappTrackedMessages.some((item) => {
        const raw = item.raw_payload || item.rawPayload || {};
        const providerResult = raw.provider_result || raw.providerResult || {};
        const values = [raw.content_sid, raw.contentSid, providerResult.content_sid, providerResult.contentSid, raw.template_name, providerResult.template].filter(Boolean).map((value) => String(value).toLowerCase());
        return values.some((value) => value.includes('lead') || value.includes('intro') || value.includes('hx'));
      });
      const reminderObserved = whatsappTrackedMessages.some((item) => {
        const raw = item.raw_payload || item.rawPayload || {};
        const providerResult = raw.provider_result || raw.providerResult || {};
        const values = [raw.content_sid, raw.contentSid, providerResult.content_sid, providerResult.contentSid, raw.template_name, providerResult.template].filter(Boolean).map((value) => String(value).toLowerCase());
        return values.some((value) => value.includes('appoint') || value.includes('reminder'));
      });
      templateHealthPanel.innerHTML = renderTemplateHealthPanel({
        senderLabel: 'Twilio production sender',
        senderState,
        callbackCoverage: Math.round(whatsappDeliveryRate),
        templateTraffic,
        policyBlocks,
        transientBlocks,
        expectedTemplates: [
          {
            code: 'LI',
            label: 'Lead intro template',
            note: leadIntroObserved ? 'Lead-intro traffic has already been observed in outbound WhatsApp sends.' : 'Ready for use once a lead-intro template send is triggered from the workspace.',
            badge: leadIntroObserved ? 'Observed' : 'Ready',
            tone: leadIntroObserved ? 'success' : 'accent'
          },
          {
            code: 'AR',
            label: 'Appointment reminder',
            note: reminderObserved ? 'Reminder traffic has already been observed in outbound WhatsApp sends.' : 'No reminder-template traffic has been observed yet in this workspace.',
            badge: reminderObserved ? 'Observed' : 'Idle',
            tone: reminderObserved ? 'success' : 'neutral'
          }
        ]
      });
    }
    if (templateGalleryPanel) {
      const storedTemplates = Array.isArray(snapshot?.messageTemplates) ? snapshot.messageTemplates : [];
      const inferredTemplates = [
        {
          code: 'WA',
          channel: 'whatsapp',
          label: 'Lead intro template',
          templateKey: 'lead_intro',
          contentSid: 'HX8fe77bfcdeab972f1ed5d8fd131aab1b',
          approvalStatus: 'ready',
          note: 'Approved first-touch WhatsApp template for new leads.',
          variables: ['{{1}} Contact name', '{{2}} Business name', '{{3}} Lead interest']
        },
        {
          code: 'WA',
          channel: 'whatsapp',
          label: 'Appointment reminder',
          templateKey: 'appointment_reminder',
          contentSid: '',
          approvalStatus: 'pending',
          note: 'Reminder template path for follow-up windows outside the active chat window.',
          variables: ['{{1}} Contact name', '{{2}} Appointment time']
        },
        {
          code: 'SMS',
          channel: 'sms',
          label: 'SMS lead alert',
          templateKey: 'sms_lead_alert',
          contentSid: '',
          approvalStatus: whatsappTrackedMessages.some((item) => String(item.channel || item.source_provider || '').toLowerCase() === 'sms') ? 'ready' : 'pending',
          note: 'Operator alert or fallback outreach template for Nigerian SMS delivery.',
          variables: ['{{1}} Contact name', '{{2}} Lead source']
        }
      ];
      const templatesByKey = new Map();
      [...storedTemplates, ...inferredTemplates].forEach((template) => {
        const key = String(template.template_key || template.name || template.templateKey || template.content_sid || template.contentSid || template.label || '').trim().toLowerCase();
        if (!key) return;
        const normalized = {
          code: template.code || String(template.channel || template.provider || 'TM').slice(0, 2).toUpperCase(),
          channel: String(template.channel || template.provider || template.message_type || '').toLowerCase(),
          label: template.label || template.display_name || template.name || 'Template',
          templateKey: template.template_key || template.templateKey || template.name || '',
          contentSid: template.content_sid || template.contentSid || '',
          approvalStatus: String(template.approval_status || template.approvalStatus || template.status || 'pending').toLowerCase(),
          note: template.note || template.description || '',
          variables: Array.isArray(template.variables)
            ? template.variables.map((value) => typeof value === 'string' ? value : `${value?.label || value?.name || 'Variable'}${value?.value ? `: ${value.value}` : ''}`)
            : Array.isArray(template.variable_map)
              ? template.variable_map.map((value) => typeof value === 'string' ? value : `${value?.label || value?.name || 'Variable'}${value?.value ? `: ${value.value}` : ''}`)
              : []
        };
        if (!templatesByKey.has(key) || storedTemplates.includes(template)) {
          templatesByKey.set(key, normalized);
        }
      });
      const galleryRows = Array.from(templatesByKey.values())
        .filter((item) => ['whatsapp', 'sms'].includes(String(item.channel || '').toLowerCase()) || String(item.code || '').toUpperCase() === 'SMS')
        .sort((left, right) => {
          const channelDelta = String(left.channel || '').localeCompare(String(right.channel || ''));
          if (channelDelta !== 0) return channelDelta;
          return String(left.label || '').localeCompare(String(right.label || ''));
        });
      templateGalleryPanel.innerHTML = renderTemplateGallery(galleryRows);
      if (templateGalleryStatus) {
        templateGalleryStatus.textContent = galleryRows.length
          ? `${galleryRows.length} WhatsApp/SMS template${galleryRows.length === 1 ? '' : 's'} loaded from workspace data and active config.`
          : 'Approved WhatsApp and SMS templates will appear here after the workspace saves them in Supabase.';
      }
    }
    if (templateHealthStatus) {
      templateHealthStatus.textContent = templateTraffic
        ? `${templateTraffic} template-backed WhatsApp send${templateTraffic === 1 ? '' : 's'} observed, with ${policyBlocks} policy blocker${policyBlocks === 1 ? '' : 's'} and ${transientBlocks} transient issue${transientBlocks === 1 ? '' : 's'}.`
        : 'Sender readiness, callback coverage, and template blockers will appear here once more WhatsApp traffic flows.';
    }
    if (opsReadinessPanel) {
      opsReadinessPanel.innerHTML = renderWorkspaceOpsReadiness({
        unifiedProfiles: unifiedProfiles.length,
        duplicateClusters,
        verifiedWebhooks,
        staleWebhooks,
        queuedJobs: queuedReliabilityJobs,
        retryingJobs: retryingReliabilityJobs,
        failedJobs: failedReliabilityJobs,
        voiceAnalyzed: analyzedVoiceNotes,
        voiceReadyFollowUps
      });
    }
    if (opsReadinessStatus) {
      opsReadinessStatus.textContent = `${verifiedWebhooks} verified webhook${verifiedWebhooks === 1 ? '' : 's'}, ${duplicateClusters} duplicate cluster${duplicateClusters === 1 ? '' : 's'}, and ${failedReliabilityJobs} failed job${failedReliabilityJobs === 1 ? '' : 's'} are shaping current admin readiness.`;
    }
    if (duplicateReviewPanel) {
      duplicateReviewPanel.innerHTML = duplicateContactClusters.length
        ? duplicateContactClusters.map((cluster, index) => {
          const names = cluster.items.map((item) => item.name || item.email || item.phone || 'Contact').filter(Boolean);
          const channels = Array.from(new Set(cluster.items.flatMap((item) => Array.isArray(item.metadata?.unified_channels) ? item.metadata.unified_channels : []))).filter(Boolean);
          const contactNote = cluster.items.map((item) => [item.email, item.phone].filter(Boolean).join(' | ')).filter(Boolean)[0] || 'Email or phone match detected';
          const reviewQuery = cluster.items.map((item) => item.email || item.phone || item.name || '').find(Boolean) || '';
          const primaryContactId = cluster.items[0]?.id || '';
          const mergeTargetId = cluster.items[1]?.id || '';
          return `
            <div class="check-item">
              <span>ID</span>
              <div>
                <strong>${ui.escapeHtml(`${names[0] || 'Customer'}${names.length > 1 ? ` +${names.length - 1}` : ''}`)}</strong>
                <span>${ui.escapeHtml(contactNote)}</span>
                <span>${ui.escapeHtml(`${cluster.items.length} contact records share the same address signal.${channels.length ? ` Channels seen: ${channels.join(', ')}.` : ''}`)}</span>
                <span class="mini-status muted">
                  <button class="ghost-button compact" type="button" data-action="search-duplicate-cluster" data-duplicate-query="${ui.escapeHtml(reviewQuery)}">Search matches</button>
                  ${primaryContactId && mergeTargetId ? `<button class="ghost-button compact" type="button" data-action="prepare-contact-merge" data-source-contact-id="${ui.escapeHtml(primaryContactId)}" data-target-contact-id="${ui.escapeHtml(mergeTargetId)}">Prepare merge</button>` : ''}
                </span>
              </div>
              <span class="badge ${index === 0 ? 'warning' : 'accent'}">${ui.escapeHtml(index === 0 ? 'Review first' : 'Review')}</span>
            </div>
          `;
        }).join('')
        : '<div class="check-item"><span>ID</span><div><strong>No duplicate clusters yet</strong><span>When AuraFlow spots likely duplicate contacts, they will appear here with a merge recommendation.</span></div><span class="badge success">Clean</span></div>';
    }
    if (duplicateReviewStatus) {
      duplicateReviewStatus.textContent = duplicateContactClusters.length ? `${duplicateContactClusters.length} clusters` : 'Clean';
    }
    if (duplicateReviewNote) {
      duplicateReviewNote.textContent = duplicateContactClusters.length
        ? `${duplicateClusters} duplicate cluster${duplicateClusters === 1 ? '' : 's'} are currently visible from email or phone overlaps. Use Inbox merge actions on the matching contact threads first.`
        : 'Potential duplicate customers across email and phone variants will appear here for manual review.';
    }
    if (workspaceRole) {
      const role = String(auth.role || 'viewer').trim().toLowerCase();
      const roleLabel = role === 'owner'
        ? 'Owner'
        : role === 'admin'
          ? 'Admin'
          : role === 'agent'
            ? 'Agent'
            : 'Viewer';
      workspaceRole.textContent = `Role: ${roleLabel}`;
    }
    if (permissionsPanel) {
      permissionsPanel.innerHTML = renderPermissionsPanel(
        auth.role || 'viewer',
        auth.permissions || {},
        snapshot?.members || []
      );
    }
    if (permissionsStatus) {
      const role = String(auth.role || 'viewer').trim().toLowerCase();
      permissionsStatus.textContent = role === 'owner'
        ? 'Owner access can connect channels, send replies, manage agents, and retry reliability jobs.'
        : role === 'admin'
          ? 'Admin access can operate channels and workflow actions, but permissions management stays locked.'
          : role === 'agent'
            ? 'Agent access can handle replies and workflow triage, but channel setup stays locked.'
            : 'Viewer access is read-only until the role is upgraded.';
    }
    if (reliabilityPanel) {
      reliabilityPanel.innerHTML = renderReliabilityPanel(auth.reliability || snapshot?.reliability || null);
    }
    if (reliabilityStatus) {
      const reliability = auth.reliability || snapshot?.reliability || null;
      const queuedJobs = Number(reliability?.summary?.jobCounts?.queued || 0);
      const retryingJobs = Number(reliability?.summary?.jobCounts?.retrying || 0);
      const suppressed = Number(reliability?.summary?.replayCounts?.suppressed || 0);
      reliabilityStatus.textContent = reliability
        ? `${queuedJobs} queued jobs, ${retryingJobs} retrying jobs, and ${suppressed} suppressed duplicates are being tracked.`
        : 'Queue backlog, replay health, and failed jobs will appear here.';
    }
    if (webhookSetup) {
      webhookSetup.innerHTML = ui.renderWebhookSetupGuide(sortedProviderReadiness, auth.workspaceId || snapshot?.workspace?.id || '', window.location.origin);
    }
    if (searchResults) {
      const hasSearchQuery = Boolean(String(auth.searchQuery || '').trim());
      const hasSearchResults = Boolean(
        (auth.searchResults?.contacts || []).length
        || (auth.searchResults?.conversations || []).length
        || (auth.searchResults?.messages || []).length
        || (auth.searchResults?.activityEvents || []).length
      );
      if (searchSection) {
        searchSection.hidden = !hasSearchQuery && !hasSearchResults;
      }
      if (searchInput && auth.searchQuery && !searchInput.value) {
        searchInput.value = auth.searchQuery;
      }
      searchResults.innerHTML = ui.renderWorkspaceSearchResults(auth.searchResults || {}, auth.searchQuery || '');
      if (searchStatus) {
        searchStatus.textContent = auth.searchQuery
          ? `Showing search results for "${auth.searchQuery}".`
          : 'Search the workspace to surface contacts, conversations, messages, and activity.';
      }
    }
    const selectedConversationForAi = conversations.find((item) => item.id === auth.selectedConversationId) || filteredConversations[0] || null;
    if (aiLiveThread) {
      aiLiveThread.textContent = auth.selectedConversationId
        ? `Thread: ${selectedConversationTitle?.textContent || auth.selectedConversationId}`
        : 'No conversation selected';
    }
    if (aiLiveStatus) {
      aiLiveStatus.textContent = !selectedConversationForAi
        ? 'Select a conversation'
        : selectedConversationForAi.escalatedUnassigned
          ? 'Assign first'
          : selectedConversationForAi.replyTargetStatus === 'placeholder'
            ? 'Workflow only'
            : selectedConversationForAi.replyTargetStatus === 'missing'
              ? 'Routing first'
              : selectedConversationForAi.oldestWaitingInbound
                ? 'Reply now'
                : 'Ready';
    }
    if (aiLiveNote) {
      aiLiveNote.textContent = !selectedConversationForAi
        ? 'Choose a thread in Inbox before using AI actions.'
        : selectedConversationForAi.escalatedUnassigned
          ? 'This thread needs ownership and handoff discipline before an AI draft becomes useful.'
          : selectedConversationForAi.replyTargetStatus === 'placeholder'
            ? 'Use AI for summary and workflow support here, not for a live send.'
            : selectedConversationForAi.replyTargetStatus === 'missing'
              ? 'AI can help with analysis, but reply routing must be fixed before sending.'
              : 'Run an AI brief, summarize, classify, recommend the next action, or hand off the current thread from here.';
    }
    if (aiOperatorLane) {
      aiOperatorLane.innerHTML = ui.renderAiOperatorLane(selectedConversationForAi || {});
    }
    if (aiRecommendation) {
      aiRecommendation.innerHTML = auth.aiRecommendation
        ? renderAiRecommendationCard(auth.aiRecommendation)
        : `
          <div class="check-item">
            <span>AI</span>
            <div>
              <strong>No recommendation yet</strong>
              <span>Run AI brief to populate a structured recommendation card, summary, and reply draft together.</span>
            </div>
            <span class="badge neutral">Waiting</span>
          </div>
        `;
    }
    if (workflowQueueList) {
      const workflowJobs = allWorkflowJobs.filter((job) => String(job.type || '').startsWith('workflow.'));
      workflowQueueList.innerHTML = ui.renderWorkflowQueueList(workflowJobs);
      if (workflowQueueStatus) {
        const counts = workflowJobs.reduce((acc, item) => {
          const status = String(item.status || 'queued').toLowerCase();
          acc[status] = Number(acc[status] || 0) + 1;
          return acc;
        }, {});
        workflowQueueStatus.textContent = workflowJobs.length
          ? `${workflowJobs.length} workflow jobs ready: ${Number(counts.queued || 0)} queued, ${Number(counts.assigned || 0)} assigned, ${Number(counts.escalated || 0)} escalated, ${Number(counts.completed || 0)} completed.`
          : 'Inbound triage, follow-up decisions, and handoff work will appear here.';
      }
    }
    if (workflowAssigneeInput && !workflowAssigneeInput.value) {
      workflowAssigneeInput.value = auth.selectedConversationId && selectedConversationOwner?.textContent
        ? selectedConversationOwner.textContent.replace(/^Owner:\s*/i, '').trim()
        : 'Workspace operator';
    }
    if (workflowNoteInput && !workflowNoteInput.value) {
      workflowNoteInput.value = auth.selectedConversationId
        ? `Review ${selectedConversationTitle?.textContent || auth.selectedConversationId} for follow-up or escalation.`
        : 'Escalated from the workflow queue.';
    }
    if (followUpList) {
      if (!auth.selectedSequenceId && sequences[0]) {
        auth.selectedSequenceId = sequences[0].id;
        saveAppState({ selectedSequenceId: auth.selectedSequenceId });
      }
      followUpList.innerHTML = ui.renderFollowUpSequences(sequences, auth.selectedSequenceId);
    }
    if (followUpCoverage) {
      followUpCoverage.innerHTML = ui.renderFollowUpCoverage(
        sequences,
        conversations,
        String(auth.sessionEmail || auth.user?.email || '').trim() || 'Shared'
      );
    }
    const activeSequencesCount = liveSequences.length;
    const uncoveredPriorityThreads = conversations.filter((item) => item.escalatedUnassigned || item.oldestWaitingInbound || item.verifiedNoOwner)
      .filter((item) => {
        const channel = String(item.channel || '').toLowerCase();
        return !liveSequences.some((sequence) => {
          const sequenceChannel = String(sequence.channel || '').toLowerCase();
          return !sequenceChannel || sequenceChannel.includes(channel) || channel.includes(sequenceChannel);
        });
      }).length;

    const agentConfig = ui.renderAgentConfig((snapshot?.agents || [])[0]);
    if (agentNameInput) agentNameInput.value = agentConfig.name;
    if (agentToneInput) agentToneInput.value = agentConfig.tone;
    if (agentStatusInput) agentStatusInput.value = agentConfig.status;
    if (agentInstructionsInput) agentInstructionsInput.value = agentConfig.instructions;
    if (agentSourcesInput) agentSourcesInput.value = agentConfig.sources.join(', ');
    if (agentSourceList) {
      agentSourceList.innerHTML = ui.renderKnowledgeBase(trainingSources, agentConfig.sources);
    }
    if (agentGuardrails) {
      agentGuardrails.innerHTML = ui.renderAgentGuardrails(agentConfig, snapshot, sortedProviderReadiness);
    }
    if (businessKnowledgeList) {
      businessKnowledgeList.innerHTML = ui.renderBusinessKnowledgeList(businessKnowledge);
    }
    if (businessKnowledgeStatus) {
      businessKnowledgeStatus.textContent = businessKnowledge.length
        ? `${businessKnowledge.length} business knowledge entr${businessKnowledge.length === 1 ? 'y' : 'ies'} loaded for AI grounding.`
        : 'Add services, pricing, and hours so AI answers stay grounded.';
    }
    if (businessKnowledgePriorityInput && !businessKnowledgePriorityInput.value) {
      businessKnowledgePriorityInput.value = '50';
    }
    if (businessKnowledgeIdInput && !businessKnowledgeIdInput.value) {
      businessKnowledgeIdInput.value = '';
    }
    if (businessKnowledgeTopicInput && !businessKnowledgeTopicInput.value && !businessKnowledgeQuestionInput?.value && !businessKnowledgeAnswerInput?.value) {
      businessKnowledgeTopicInput.placeholder = 'Services';
    }
    if (businessKnowledgeTagsInput && !businessKnowledgeTagsInput.value && !businessKnowledgeQuestionInput?.value && !businessKnowledgeAnswerInput?.value) {
      businessKnowledgeTagsInput.placeholder = 'pricing, hours, onboarding';
    }

    ui.setSelectOptions(voiceSessionContactSelect, snapshot?.contacts || [], (item) => item.name || item.email || 'Contact', 'Select contact');
    ui.setSelectOptions(voiceNoteContactSelect, snapshot?.contacts || [], (item) => item.name || item.email || 'Contact', 'Select contact');
    ui.setSelectOptions(contactMergeTargetSelect, snapshot?.contacts || [], (item) => item.name || item.email || 'Contact', 'Select duplicate contact');
    ui.setSelectOptions(voiceSessionProfileSelect, voiceProfiles, (item) => item.name || item.label || 'Voice profile', 'Select voice profile');
    ui.setSelectOptions(voiceNoteProfileSelect, voiceProfiles, (item) => item.name || item.label || 'Voice profile', 'Select voice profile');
    ui.setSelectOptions(
      voiceNoteSessionSelect,
      voiceSessions,
      (item) => {
        const contact = (snapshot?.contacts || []).find((contactItem) => contactItem.id === item.contact_id);
        const contactLabel = contact?.name || contact?.email || 'Contact';
        const sessionStatus = String(item.analysis_status || item.status || 'queued').trim();
        return `${contactLabel} - ${sessionStatus}`;
      },
      'Optional call session'
    );

    setText(metrics.resolved?.label, 'Open conversations');
    setText(metrics.resolved?.value, String(openConversations.length));
    setText(metrics.resolved?.detail, `${closedConversations.length} closed in workspace history`);

    setText(metrics.firstReply?.label, 'Avg. first reply');
    setText(metrics.firstReply?.value, messages.length ? formatDurationFromMinutes(firstReplyMinutes) : 'No data');
    setText(metrics.firstReply?.detail, messages.length ? `${messages.length} synced messages analysed` : 'Sync messages to calculate this');

    setText(metrics.channels?.label, 'Configured channels');
    setText(metrics.channels?.value, String(channels.length));
    setText(metrics.channels?.detail, channels.length ? `${channels.filter((item) => String(item.status || '').toLowerCase() === 'live').length} live now` : 'No channels configured yet');

    setText(metrics.followups?.label, 'Active sequences');
    setText(metrics.followups?.value, String(activeSequencesCount));
    setText(metrics.followups?.detail, `${sequences.length} total sequences, ${uncoveredPriorityThreads} high-priority threads uncovered`);

    setText(liveOps.pipeline?.value, `${warmContacts.length} warm contacts`);
    setText(liveOps.pipeline?.detail, `${contacts.length} total contacts with ${automations.length} automation rules`);

    setText(liveOps.refunds?.value, `${refundLikeConversations.length} refund-like threads`);
    setText(liveOps.refunds?.detail, 'Derived from conversation subjects and summaries');

    setText(liveOps.analytics?.value, `${solveRate}% solve rate`);
    setText(liveOps.analytics?.detail, `${closedConversations.length} of ${snapshot?.conversations?.length || 0} conversations are closed`);
    const channelLeadCounts = { voice: 0, whatsapp: 0, sms: 0 };
    conversations.forEach((conversation) => {
      const key = String(conversation.channel || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(channelLeadCounts, key)) {
        channelLeadCounts[key] += 1;
      }
    });
      const topChannel = Object.entries(channelLeadCounts).sort((left, right) => right[1] - left[1])[0] || ['whatsapp', 0];
      setText(liveOps['channels-performance']?.value, `${topChannel[0]} leads ${topChannel[1]}`);
      setText(liveOps['channels-performance']?.detail, `Voice ${channelLeadCounts.voice} | WhatsApp ${channelLeadCounts.whatsapp} | SMS ${channelLeadCounts.sms}`);
      setText(liveOps['sla-risk']?.value, staleInboxThreads ? `${staleInboxThreads} stale inbound` : attentionInboxThreads ? `${attentionInboxThreads} need attention` : 'Queue looks healthy');
      setText(liveOps['sla-risk']?.detail, staleInboxThreads ? `${staleInboxThreads} inbound thread${staleInboxThreads === 1 ? '' : 's'} have crossed the stale threshold and should be handled first.` : attentionInboxThreads ? `${attentionInboxThreads} conversation${attentionInboxThreads === 1 ? '' : 's'} still carry delivery, routing, or ownership pressure.` : 'No stale inbound backlog is visible right now.');
      setText(liveOps['identity-health']?.value, unifiedProfiles.length ? `${unifiedProfiles.length} unified profile${unifiedProfiles.length === 1 ? '' : 's'}` : 'Identity graph warming up');
      setText(liveOps['identity-health']?.detail, `${linkedIdentityCount} linked identity record${linkedIdentityCount === 1 ? '' : 's'} are attached across contacts, with ${duplicateClusters} duplicate cluster${duplicateClusters === 1 ? '' : 's'} still worth reviewing.`);
      setText(liveOps['voice-followup']?.value, voiceReadyFollowUps ? `${voiceReadyFollowUps} follow-up ready` : analyzedVoiceNotes ? `${analyzedVoiceNotes} analyzed calls` : 'No analyzed calls yet');
      setText(liveOps['voice-followup']?.detail, analyzedVoiceNotes ? `${analyzedVoiceNotes} analyzed voice note${analyzedVoiceNotes === 1 ? '' : 's'}, ${negativeVoiceCount} negative mood signal${negativeVoiceCount === 1 ? '' : 's'}, and ${voiceReadyFollowUps} ready follow-up plan${voiceReadyFollowUps === 1 ? '' : 's'}.` : 'Deepgram summaries, caller mood, and follow-up recommendations will appear here after the first analyzed call.');
      setText(liveOps['whatsapp-delivery']?.value, whatsappTrackedMessages.length ? `${Math.round(whatsappDeliveryRate)}% success` : 'Waiting on callbacks');
    setText(
      liveOps['whatsapp-delivery']?.detail,
        whatsappTrackedMessages.length
          ? `Tracked ${whatsappTrackedMessages.length} replies | ${whatsappQueuedCount} sent or queued | ${whatsappDeliveredCount} delivered | ${whatsappReadCount} read | ${whatsappFailedCount} failed${whatsappFailureCategory.label ? ` | Pattern: ${whatsappFailureCategory.label}` : ''}${whatsappFailureReason ? ` | Latest issue: ${whatsappFailureReason}` : ''}${whatsappRetryDiagnostics.hasFailure ? ` | ${whatsappRetryDiagnostics.nextRetryMode}${whatsappRetryDiagnostics.retryCount ? ` after ${whatsappRetryDiagnostics.retryCount} prior ${whatsappRetryDiagnostics.retryCount === 1 ? 'retry' : 'retries'}` : ''}` : ''}`
          : 'Sent, delivered, read, and failed counts will appear here once replies begin flowing through the production sender.'
    );

    if (aiFollowupBrief) {
      aiFollowupBrief.innerHTML = renderAiFollowUpBrief(auth.aiBriefing || {});
    }
    if (aiFollowupStatus) {
      aiFollowupStatus.textContent = auth.aiBriefing?.sequenceSuggestion?.name
        ? auth.aiBriefing.followUpTiming || 'Suggested'
        : 'Idle';
    }
    if (aiOutreachGuide) {
      aiOutreachGuide.innerHTML = renderAiOutreachGuide(auth.aiBriefing || {});
    }
    if (aiOutreachStatus) {
      aiOutreachStatus.textContent = auth.aiBriefing?.sequenceSuggestion?.name
        ? 'Ready'
        : auth.aiBriefing?.summary
          ? 'Drafted'
          : 'Idle';
    }
    if (aiLeadBrief) {
      aiLeadBrief.innerHTML = renderAiLeadBrief(auth.aiBriefing || {});
    }
    if (aiLeadStatus) {
      aiLeadStatus.textContent = auth.aiBriefing?.leadScoreLabel || (auth.aiBriefing?.classification ? 'Scored' : 'Idle');
    }
    if (aiAnalyticsBrief) {
      aiAnalyticsBrief.innerHTML = renderAiAnalyticsBrief(auth.aiBriefing || {}, conversations, allWorkflowJobs, sortedProviderReadiness, {
        voiceFollowUps: analyzedVoiceFollowUps.length,
        unifiedProfiles: unifiedProfiles.length,
        whatsappDeliveryRate,
        whatsappTracked: whatsappTrackedMessages.length,
        whatsappRead: whatsappReadCount,
        whatsappFailures: whatsappFailedCount,
        whatsappFailureReason,
        whatsappFailureCategory: whatsappFailureCategory.label,
        whatsappRetryMode: whatsappRetryDiagnostics.nextRetryMode,
        whatsappRetryCount: whatsappRetryDiagnostics.retryCount,
        whatsappLastRetryAt: whatsappRetryDiagnostics.lastRetryAt
      });
    }
    if (aiAnalyticsStatus) {
      aiAnalyticsStatus.textContent = auth.aiBriefing?.classification
        ? (auth.aiBriefing.confidence ? `${Math.round(Number(auth.aiBriefing.confidence) * 100)}% confidence` : 'Active')
        : 'Idle';
    }
    if (aiDeployBrief) {
      aiDeployBrief.innerHTML = renderAiDeployBrief(auth.aiBriefing || {}, sortedProviderReadiness, {
        voiceProfiles: voiceProfiles.length,
        pendingVoiceAnalysis: queuedCalls.length,
        deliverySuccessRate,
        deliveryVolume: deliveryTrackedMessages.length
      });
    }
    if (aiDeployStatus) {
      const blockedProviders = sortedProviderReadiness.filter((item) => !(item.outboundReady || item.inboundReady)).length;
      aiDeployStatus.textContent = blockedProviders
        ? `${blockedProviders} blocked`
        : sortedProviderReadiness.length
          ? 'Live'
          : 'Idle';
    }

    setText(voiceMetrics.calls, String(queuedCalls.length));
    setText(voiceMetrics.transfers, String(transferCount));
    setText(voiceMetrics.notes, String(voiceNotes.length));

      ui.syncSelectedConversation({
        auth,
        conversations,
        snapshot,
      contactDetail,
      contactTagSuggestions,
      selectedConversationTitle,
      selectedConversationChannel,
      selectedConversationStatus,
      selectedConversationOwner,
      selectedConversationUpdated,
      threadPrioritySummary,
      conversationInsights,
      replyGuidance,
      replyTarget,
      threadWorkflow,
      replyStatus,
      assignmentInput,
      messageThread,
      activityLog,
      workflowJobs: allWorkflowJobs.filter((job) => String(job.type || '').startsWith('workflow.')),
        sequences,
        saveAppState
      });

      const selectedConversation = Array.isArray(snapshot?.conversations)
        ? snapshot.conversations.find((item) => item.id === auth.selectedConversationId) || null
        : null;
      const selectedContact = selectedConversation?.contact_id && Array.isArray(snapshot?.contacts)
        ? snapshot.contacts.find((item) => item.id === selectedConversation.contact_id) || null
        : null;
      const selectedMessages = Array.isArray(snapshot?.messages)
        ? snapshot.messages.filter((item) => item.conversation_id === auth.selectedConversationId)
        : [];
      const whatsappTemplateState = getWhatsAppTemplateModeState(selectedConversation, selectedMessages, auth.aiBriefing || {});
      if (replyTemplateModeInput) {
        const currentValue = String(replyTemplateModeInput.value || '').trim().toLowerCase();
        if (!currentValue || currentValue === 'auto') {
          replyTemplateModeInput.value = whatsappTemplateState.policyLimited
            ? (whatsappTemplateState.recommendedTemplate || 'auto')
            : whatsappTemplateState.suggestedMode;
        }
      }
      if (replyTemplateStatus) {
        replyTemplateStatus.textContent = whatsappTemplateState.status;
      }
      if (sendReplyButton) {
        const providerKey = String(selectedConversation?.source_provider || selectedConversation?.source || '').toLowerCase();
        const phoneHealth = getContactPhoneHealth(selectedContact || {});
        const smsBlocked = providerKey === 'sms' && phoneHealth.lineType === 'landline';
        sendReplyButton.textContent = providerKey === 'sms' ? 'Send SMS' : 'Send now';
        sendReplyButton.disabled = smsBlocked;
        sendReplyButton.title = smsBlocked
          ? 'SMS disabled: Recipient is a landline. Please use WhatsApp or Gmail.'
          : providerKey === 'sms'
            ? phoneHealth.valid
              ? `Send SMS${phoneHealth.carrierName ? ` via ${phoneHealth.carrierName}` : ''}`
              : 'Send SMS'
            : '';
      }
      if (sequenceTemplateModeInput) {
        const channelMix = String(sequenceChannelInput?.value || '').toLowerCase();
        const shouldUseWhatsApp = channelMix.includes('whatsapp');
        const currentValue = String(sequenceTemplateModeInput.value || '').trim().toLowerCase();
        if (!currentValue || currentValue === 'auto') {
          sequenceTemplateModeInput.value = shouldUseWhatsApp && whatsappTemplateState.policyLimited
            ? (whatsappTemplateState.recommendedTemplate || 'auto')
            : 'auto';
        }
      }
      if (sequenceTemplateStatus) {
        sequenceTemplateStatus.textContent = whatsappTemplateState.sequenceStatus;
      }

      if (contactDetail) {
      const currentTagSuggestions = Array.from(new Set(contactTagSuggestions)).slice(0, 8);
      const existingSuggestionNode = contactDetail.querySelector('[data-contact-tag-suggestions]');
      if (existingSuggestionNode) {
        existingSuggestionNode.innerHTML = currentTagSuggestions.length
          ? `<p class="eyebrow">Suggested tags</p><div class="tag-list">${currentTagSuggestions.map((tag) => `<button class="badge accent" type="button" data-action="apply-contact-tag" data-contact-tag-value="${ui.escapeHtml(tag)}">${ui.escapeHtml(tag)}</button>`).join('')}</div><div class="mini-status muted">Click a suggestion to add it to the contact before saving.</div>`
          : '<span class="badge muted">No workspace tags yet</span>';
      } else if (currentTagSuggestions.length) {
        contactDetail.insertAdjacentHTML('beforeend', `
          <div class="tag-list" data-contact-tag-suggestions>
            <p class="eyebrow">Suggested tags</p>
            <div class="tag-list">${currentTagSuggestions.map((tag) => `<button class="badge accent" type="button" data-action="apply-contact-tag" data-contact-tag-value="${ui.escapeHtml(tag)}">${ui.escapeHtml(tag)}</button>`).join('')}</div>
            <div class="mini-status muted">Click a suggestion to add it to the contact before saving.</div>
          </div>
        `);
      }
    }
  }

  return { updateRuntimeView };
}

