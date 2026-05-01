import { createContactPayload, createConversationPayload, createMessagePayload } from '../contracts/auraflow-contract.js';
import { buildProviderSeedDescriptor, normalizeProviderKey } from './provider-connectors.js';

const DEMO_SEEDS = {
  gmail: {
    accountId: 'northstar-gmail',
    contact: {
      externalId: 'maya.chen@brightlane.studio',
      name: 'Maya Chen',
      email: 'maya.chen@brightlane.studio',
      company: 'Brightlane Studio',
      leadStage: 'qualified',
      ownerName: 'Ada',
      tags: ['gmail', 'demo', 'pricing']
    },
    conversation: {
      externalId: 'gmail-thread-northstar-001',
      subject: 'Need help with automation limits',
      status: 'open',
      priority: 'high',
      source: 'Gmail',
      summary: 'Customer asked for automation limits, onboarding support, and implementation timing.'
    },
    messages: [
      {
        externalId: 'gmail-message-northstar-001-in',
        direction: 'inbound',
        senderName: 'Maya Chen',
        body: 'Can you confirm whether the team plan includes automation limits and shared inbox notes?',
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
      },
      {
        externalId: 'gmail-message-northstar-001-out',
        direction: 'outbound',
        senderName: 'Northstar Support Agent',
        body: 'Yes. The current plan includes 120 active automations and shared inbox notes, with a handoff flow for billing risk.',
        createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString()
      }
    ]
  },
  whatsapp: {
    accountId: 'northstar-whatsapp',
    contact: {
      externalId: '+2348015550101',
      name: 'Amaka Okafor',
      email: 'amaka@example.com',
      company: 'Northstar Retail',
      leadStage: 'hot',
      ownerName: 'Olu',
      tags: ['whatsapp', 'demo', 'support']
    },
    conversation: {
      externalId: 'whatsapp-thread-northstar-001',
      subject: 'WhatsApp order follow-up',
      status: 'open',
      priority: 'high',
      source: 'WhatsApp',
      summary: 'Customer requested an order update and asked for handoff to a human agent.'
    },
    messages: [
      {
        externalId: 'whatsapp-message-northstar-001-in',
        direction: 'inbound',
        senderName: 'Amaka Okafor',
        body: 'Hi, can you confirm the order status and the next delivery window?',
        createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString()
      },
      {
        externalId: 'whatsapp-message-northstar-001-out',
        direction: 'outbound',
        senderName: 'AuraFlow Support',
        body: 'Absolutely. I’m checking the order now and will follow up with a delivery update shortly.',
        createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString()
      }
    ]
  }
};

function mapDemoPayload(provider, workspaceId) {
  const providerKey = normalizeProviderKey(provider);
  const seed = DEMO_SEEDS[providerKey] || DEMO_SEEDS.gmail;
  const descriptor = buildProviderSeedDescriptor(providerKey);
  const contact = createContactPayload({
    workspaceId,
    sourceProvider: descriptor.provider,
    externalContactId: seed.contact.externalId,
    name: seed.contact.name,
    email: seed.contact.email,
    company: seed.contact.company,
    leadStage: seed.contact.leadStage,
    ownerName: seed.contact.ownerName,
    tags: seed.contact.tags
  });
  const conversation = createConversationPayload({
    workspaceId,
    sourceProvider: descriptor.provider,
    externalConversationId: seed.conversation.externalId,
    subject: seed.conversation.subject,
    status: seed.conversation.status,
    priority: seed.conversation.priority,
    source: seed.conversation.source,
    summary: seed.conversation.summary
  });
  const messages = seed.messages.map((message) => createMessagePayload({
    workspaceId,
    conversationId: conversation.external_conversation_id,
    sourceProvider: descriptor.provider,
    externalMessageId: message.externalId,
    direction: message.direction,
    senderName: message.senderName,
    body: message.body,
    createdAt: message.createdAt
  }));

  return {
    provider: descriptor.provider,
    workspaceId,
    accountId: seed.accountId,
    contact: {
      ...contact,
      externalId: contact.external_contact_id
    },
    conversation: {
      ...conversation,
      externalId: conversation.external_conversation_id
    },
    messages: messages.map((message) => ({
      ...message,
      externalId: message.external_message_id
    }))
  };
}

export function buildDemoIngestPayload(provider, workspaceId) {
  return mapDemoPayload(provider, workspaceId);
}
