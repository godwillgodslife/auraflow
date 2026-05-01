import { canonicalizeWorkspaceSnapshot } from '../contracts/canonical-model.js';

function trimText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function summarizeList(values = [], limit = 5, mapper = (value) => value) {
  return values.slice(0, limit).map(mapper).filter(Boolean);
}

function deriveChannelStrategy(channel = '') {
  const normalized = String(channel || '').trim().toLowerCase();
  if (normalized === 'gmail' || normalized === 'email') {
    return 'Prefer polished, thread-aware answers and more formal follow-up planning.';
  }
  if (normalized === 'whatsapp') {
    return 'Prefer fast mobile-friendly replies, short follow-up steps, and immediate next actions.';
  }
  if (normalized === 'instagram' || normalized === 'facebook') {
    return 'Treat this like lead capture or social DM triage first, with quick qualification and booking-oriented next steps.';
  }
  if (normalized === 'messenger') {
    return 'Keep guidance chat-native, light, and operator-friendly.';
  }
  return 'Match the channel tone while keeping routing and follow-up guidance operational.';
}

export function buildAiWorkspaceContext({
  workspaceName = 'AuraFlow Workspace',
  snapshot = {},
  conversation = {},
  messages = [],
  mode = 'reply',
  persona = {},
  workspaceKnowledge = []
} = {}) {
  const normalizedSnapshot = canonicalizeWorkspaceSnapshot(snapshot || {});
  const conversations = Array.isArray(normalizedSnapshot.conversations) ? normalizedSnapshot.conversations : [];
  const contacts = Array.isArray(normalizedSnapshot.contacts) ? normalizedSnapshot.contacts : [];
  const channels = Array.isArray(normalizedSnapshot.channels) ? normalizedSnapshot.channels : [];
  const agents = Array.isArray(normalizedSnapshot.agents) ? normalizedSnapshot.agents : [];
  const activities = Array.isArray(normalizedSnapshot.activityEvents) ? normalizedSnapshot.activityEvents : [];
  const businessKnowledge = Array.isArray(normalizedSnapshot.businessKnowledge) ? normalizedSnapshot.businessKnowledge : [];
  const workspaceKnowledgeEntries = Array.isArray(workspaceKnowledge) && workspaceKnowledge.length
    ? workspaceKnowledge
    : Array.isArray(normalizedSnapshot.workspaceKnowledge)
      ? normalizedSnapshot.workspaceKnowledge
      : [];
  const leads = Array.isArray(normalizedSnapshot.leads) ? normalizedSnapshot.leads : [];
  const selectedAgent = agents.find((item) => String(item.status || '').toLowerCase() === 'active') || agents[0] || null;
  const botName = trimText(persona.botName || persona.name || normalizedSnapshot.workspace?.bot_name || normalizedSnapshot.workspace?.agent_name || selectedAgent?.name, workspaceName);
  const toneOfVoice = trimText(persona.toneOfVoice || persona.tone || normalizedSnapshot.workspace?.tone_of_voice || normalizedSnapshot.workspace?.tone || selectedAgent?.tone, 'Professional');
  const selectedContact = contacts.find((item) => String(item.id) === String(conversation.contact_id || conversation.contactId)) || contacts[0] || null;
  const selectedLead = leads.find((item) => String(item.contact_id || item.contactId || '') === String(selectedContact?.id || ''))
    || leads.find((item) => String(item.conversation_id || item.conversationId || '') === String(conversation.id || ''))
    || null;
  const resolvedChannel = conversation.channel || conversation.source || selectedContact?.source_provider || conversation.source_provider || '';
  const recentConversations = summarizeList(conversations, 4, (item) => {
    const name = item.subject || item.name || item.external_conversation_id || 'Conversation';
    return `- ${name} | ${item.status || 'open'} | ${item.source || item.source_provider || 'manual'}`;
  });
  const recentMessages = summarizeList(messages, 8, (item) => `- ${item.direction || 'message'} | ${item.sender_name || 'Unknown'}: ${item.body || ''}`);
  const topTags = Array.isArray(normalizedSnapshot.tagSuggestions) && normalizedSnapshot.tagSuggestions.length
    ? normalizedSnapshot.tagSuggestions.slice(0, 6)
    : Array.from(new Set(contacts.flatMap((item) => Array.isArray(item.tags) ? item.tags : []))).slice(0, 6);

  return [
    `Workspace: ${workspaceName}`,
    `Bot name: ${botName}`,
    `Tone of voice: ${toneOfVoice}`,
    `Mode: ${trimText(mode, 'reply')}`,
    `Conversation: ${conversation.name || conversation.subject || 'Unknown conversation'}`,
    `Channel: ${resolvedChannel || 'Unknown channel'}`,
    `Channel strategy: ${deriveChannelStrategy(resolvedChannel)}`,
    `Status: ${conversation.status || 'open'}`,
    `Priority: ${conversation.priority || 'normal'}`,
    `Contact: ${selectedContact?.name || conversation.name || 'Unknown contact'}`,
    `Contact tags: ${selectedContact?.tags?.length ? selectedContact.tags.join(', ') : 'None'}`,
    `Lead profile: ${selectedLead ? `${selectedLead.lead_stage || 'new'} | ${selectedLead.captured_from || selectedLead.source_provider || 'unknown source'} | ${selectedLead.capture_reason || 'No reason saved'}` : 'No explicit lead record linked yet'}`,
    `Recent channels: ${channels.length ? channels.map((item) => item.display_name || item.provider).join(', ') : 'None'}`,
    `Workspace knowledge entries: ${workspaceKnowledgeEntries.length}`,
    `Business knowledge entries: ${businessKnowledge.length}`,
    `Leads captured: ${leads.length}`,
    'Workspace knowledge source of truth: Use the workspace_knowledge rows uploaded in Setup Wizard before general model knowledge.',
    'Knowledge base source of truth: Use workspace business knowledge first for Email, WhatsApp, SMS, Voice, Instagram, and Messenger replies.',
    'Lead capture instruction: when a message includes a phone number or email, flag it as lead_captured and save the contact to the leads table.',
    `Workspace agents: ${agents.length ? agents.map((item) => item.name || 'Agent').join(', ') : 'None'}`,
    `Workspace activity: ${activities.length} events`,
    '',
    'Recent conversations:',
    recentConversations.length ? recentConversations.join('\n') : '- None',
    '',
    'Business knowledge highlights:',
    summarizeList(businessKnowledge, 4, (item) => `- ${item.topic || 'General'} | ${item.question || 'Q'} -> ${String(item.answer || '').slice(0, 140)}`).join('\n') || '- None',
    '',
    'Workspace knowledge highlights:',
    summarizeList(workspaceKnowledgeEntries, 4, (item) => `- ${item.title || item.topic || item.url || item.source_type || 'Knowledge'} | ${item.url || item.file_url || item.source_url || item.source_type || 'source'} -> ${String(item.body || item.content || item.summary || item.answer || '').slice(0, 140)}`).join('\n') || '- None',
    '',
    'Recent messages:',
    recentMessages.length ? recentMessages.join('\n') : '- None'
  ].join('\n');
}
