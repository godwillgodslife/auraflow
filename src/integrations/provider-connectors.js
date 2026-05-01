const PROVIDERS = {
  gmail: {
    key: 'gmail',
    label: 'Gmail',
    channelType: 'email',
    allowedIntegrations: ['gmail'],
    seedLabel: 'Seed Gmail thread',
    connectLabel: 'Open Gmail setup',
    readinessLabel: 'Gmail',
    demoStatus: 'configured',
    rolloutPriority: 1,
    rolloutNote: 'Primary rollout target for the first live inbox.'
  },
  whatsapp: {
    key: 'whatsapp',
    label: 'WhatsApp',
    channelType: 'whatsapp',
    allowedIntegrations: ['whatsapp'],
    seedLabel: 'Seed WhatsApp thread',
    connectLabel: 'Open Twilio WhatsApp production setup',
    readinessLabel: 'WhatsApp',
    demoStatus: 'configured',
    rolloutPriority: 2,
    rolloutNote: 'Use the registered Twilio WhatsApp sender for production traffic, templates, and live webhook delivery.'
  },
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    channelType: 'instagram',
    allowedIntegrations: ['instagram'],
    seedLabel: 'Seed Instagram thread',
    connectLabel: 'Open Twilio Conversations setup',
    readinessLabel: 'Instagram',
    demoStatus: 'configured',
    rolloutPriority: 3,
    rolloutNote: 'Wire Instagram into Twilio Conversations and let Twilio forward the unified webhook events into AuraFlow.'
  },
  facebook: {
    key: 'facebook',
    label: 'Facebook',
    channelType: 'messenger',
    allowedIntegrations: ['facebook', 'messenger'],
    seedLabel: 'Seed Facebook thread',
    connectLabel: 'Connect Facebook',
    readinessLabel: 'Facebook',
    demoStatus: 'configured',
    rolloutPriority: 4,
    rolloutNote: 'Connect the business page directly through Meta OAuth so each workspace keeps its own page token and page context.'
  },
  messenger: {
    key: 'messenger',
    label: 'Messenger',
    channelType: 'messenger',
    allowedIntegrations: ['messenger'],
    seedLabel: 'Seed Messenger thread',
    connectLabel: 'Open Twilio Conversations setup',
    readinessLabel: 'Messenger',
    demoStatus: 'configured',
    rolloutPriority: 5,
    rolloutNote: 'Wire Messenger into Twilio Conversations so AuraFlow receives the same unified webhook format as WhatsApp and Instagram.'
  }
};

export function listProviderConnectors() {
  return Object.values(PROVIDERS).sort((left, right) => (left.rolloutPriority || 99) - (right.rolloutPriority || 99));
}

export function getProviderConnector(providerKey = '') {
  const key = String(providerKey || '').trim().toLowerCase();
  return PROVIDERS[key] || PROVIDERS.gmail;
}

export function buildProviderSeedDescriptor(providerKey = '') {
  const provider = getProviderConnector(providerKey);
  return {
    provider: provider.key,
    label: provider.label,
    channelType: provider.channelType,
    allowedIntegrations: provider.allowedIntegrations,
    connectLabel: provider.connectLabel,
    seedLabel: provider.seedLabel,
    readinessLabel: provider.readinessLabel,
    demoStatus: provider.demoStatus,
    rolloutPriority: provider.rolloutPriority,
    rolloutNote: provider.rolloutNote
  };
}

export function normalizeProviderKey(value = '') {
  return getProviderConnector(value).key;
}
