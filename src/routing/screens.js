export const DEFAULT_SCREEN = 'home';

export const SCREEN_META = {
  home: ['Home', 'See leads, AI activity, and channel readiness at a glance.'],
  agent: ['Agent', 'Build your AI agent, set instructions, and configure handoff rules.'],
  inbox: ['Inbox', 'Manage live customer conversations across Email, WhatsApp, Instagram, and Messenger.'],
  deploy: ['Deploy', 'Connect channels, verify readiness, and monitor reliability.'],
  outreach: ['Follow-up', 'Queue, schedule, and manage Email and WhatsApp sequences for leads and customers.'],
  data: ['Knowledge Base', 'Manage training sources, knowledge bases, and AI grounding material.'],
  analytics: ['Analytics', 'Track AI performance, response rates, and support outcomes.'],
  settings: ['Settings', 'Configure your workspace, team members, channels, and billing.']
};

export function isValidScreen(screen) {
  return Boolean(SCREEN_META[screen]);
}

export function getScreenMeta(screen) {
  return SCREEN_META[screen] || SCREEN_META[DEFAULT_SCREEN];
}
