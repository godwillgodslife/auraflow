export const workspace = {
  id: 'workspace-northstar',
  name: 'Northstar Commerce',
  tier: 'Growth Suite',
  plan: 'Enterprise-ready starter',
  usage: {
    seats: '18 / 25',
    conversations: '12,480 / 25,000',
    automations: '84 / 120',
    storage: '418 GB / 1 TB'
  }
};

function withWorkspaceId(records) {
  return records.map((item) => ({
    workspace_id: workspace.id,
    ...item
  }));
}

export const navSections = [
  {
    label: 'Command Center',
    items: [
      { id: 'dashboard', label: 'Dashboard', hint: 'Overview' },
      { id: 'inbox', label: 'Unified Inbox', hint: 'Messages' },
      { id: 'leads', label: 'Leads', hint: 'CRM' }
    ]
  },
  {
    label: 'Revenue Ops',
    items: [
      { id: 'pipeline', label: 'Pipeline', hint: 'Deals' },
      { id: 'refunds', label: 'Refunds', hint: 'Recovery' },
      { id: 'outreach', label: 'Outreach', hint: 'Sequences' },
      { id: 'voice', label: 'Voice', hint: 'Receptionist' },
      { id: 'analytics', label: 'Analytics', hint: 'Performance' }
    ]
  },
  {
    label: 'Automation',
    items: [
      { id: 'automations', label: 'Automations', hint: 'Workflows' },
      { id: 'integrations', label: 'Integrations', hint: 'Channels' },
      { id: 'billing', label: 'Billing', hint: 'Subscription' },
      { id: 'settings', label: 'Settings', hint: 'Workspace' },
      { id: 'auth', label: 'Auth Screens', hint: 'Login' }
    ]
  }
];

export const stats = withWorkspaceId([
  { label: 'Monthly Revenue', value: '$124,800', delta: '+14.2%', tone: 'positive' },
  { label: 'Avg. First Reply', value: '3m 12s', delta: '-28%', tone: 'positive' },
  { label: 'Active Conversations', value: '428', delta: '+19', tone: 'neutral' },
  { label: 'Recovered Revenue', value: '$28,640', delta: '+9.6%', tone: 'positive' }
]);

export const channelVolume = withWorkspaceId([
  { channel: 'Email', volume: 82, label: '82 msgs' },
  { channel: 'WhatsApp', volume: 96, label: '96 msgs' },
  { channel: 'SMS', volume: 34, label: '34 msgs' },
  { channel: 'Voice', volume: 18, label: '18 calls' },
  { channel: 'Instagram', volume: 52, label: '52 msgs' },
  { channel: 'Messenger', volume: 28, label: '28 msgs' }
]);

export const alerts = withWorkspaceId([
  {
    title: '12 inbound leads waiting for first response',
    detail: '6 are marked high intent and 3 are tagged "pricing".',
    tone: 'warning'
  },
  {
    title: 'Refund backlog cleared for 4 tickets',
    detail: 'Two approvals were completed by finance and support.',
    tone: 'success'
  },
  {
    title: 'Instagram sync delayed by 7 minutes',
    detail: 'Token refresh is queued. No message loss detected.',
    tone: 'info'
  }
]);

export const conversations = withWorkspaceId([
  {
    id: 'conv-1',
    name: 'Maya Chen',
    company: 'Brightlane Studio',
    channel: 'WhatsApp',
    status: 'High priority',
    statusTone: 'danger',
    tag: 'Pricing',
    owner: 'Ada',
    lastMessage: 'Can you confirm if the team plan includes automation limits?',
    updatedAt: '2m ago',
    value: '$12,000',
    sentiment: 'Warm'
  },
  {
    id: 'conv-2',
    name: 'Tunde Adebayo',
    company: 'Nexa Retail',
    channel: 'Email',
    status: 'Awaiting reply',
    statusTone: 'warning',
    tag: 'Refund',
    owner: 'Sade',
    lastMessage: 'We need a refund decision before close of business today.',
    updatedAt: '13m ago',
    value: '$3,400',
    sentiment: 'Neutral'
  },
  {
    id: 'conv-3',
    name: 'Elena Petrova',
    company: 'Northstar Clinics',
    channel: 'Instagram',
    status: 'Qualified lead',
    statusTone: 'success',
    tag: 'Demo booked',
    owner: 'Olu',
    lastMessage: 'The demo looked good. Can you share the implementation plan?',
    updatedAt: '24m ago',
    value: '$24,000',
    sentiment: 'Hot'
  },
  {
    id: 'conv-4',
    name: 'Jordan Miles',
    company: 'Apex Growth',
    channel: 'Messenger',
    status: 'Needs handoff',
    statusTone: 'info',
    tag: 'Escalation',
    owner: 'Team',
    lastMessage: 'They reported duplicate charges on invoice #4821.',
    updatedAt: '41m ago',
    value: '$980',
    sentiment: 'Sensitive'
  },
  {
    id: 'conv-5',
    name: 'Ifeoma Nwosu',
    company: 'Harbor Legal',
    channel: 'SMS',
    status: 'Awaiting reply',
    statusTone: 'warning',
    tag: 'Follow-up',
    owner: 'Ada',
    lastMessage: 'Can you send me the short version of pricing and onboarding time?',
    updatedAt: '52m ago',
    value: '$7,200',
    sentiment: 'Warm'
  },
  {
    id: 'conv-6',
    name: 'Samuel Hart',
    company: 'Westbridge Health',
    channel: 'Voice',
    status: 'Needs handoff',
    statusTone: 'info',
    tag: 'Call back',
    owner: 'Olu',
    lastMessage: 'Caller requested a follow-up call with finance before approving the annual plan.',
    updatedAt: '1h ago',
    value: '$16,500',
    sentiment: 'Interested'
  }
]);

export const conversationThread = {
  workspace_id: workspace.id,
  messages: [
    {
      from: 'Maya Chen',
      body: 'We are evaluating the team plan, but I need to know the automation limits before we proceed.',
      time: '9:12 AM',
      side: 'customer'
    },
    {
      from: 'Ada',
      body: 'Thanks Maya. The current Growth Suite includes 120 active automations, unlimited inbox routing, and 25 seats.',
      time: '9:14 AM',
      side: 'agent'
    },
    {
      from: 'Maya Chen',
      body: 'That helps. Do you also support shared inbox notes and approval flows for refunds?',
      time: '9:16 AM',
      side: 'customer'
    }
  ],
  internalNotes: [
    'Lead is evaluating alternatives to Front + Zapier + Intercom.',
    'Mentioned urgency: migration must be completed before monthly renewal on Friday.',
    'AI summary suggests a product-led demo with refund workflow emphasis.'
  ],
  aiSuggestions: [
    'Offer a 14-day onboarding concierge for the first 3 workspaces.',
    'Confirm refund approval workflow and mention finance handoff visibility.',
    'Recommend 1:1 migration session and share the implementation checklist.'
  ]
};

export const contacts = withWorkspaceId([
  {
    name: 'Maya Chen',
    company: 'Brightlane Studio',
    stage: 'SQL',
    owner: 'Ada',
    lastSeen: '2m ago',
    lifetime: '$18,420',
    tags: ['WhatsApp', 'Enterprise', 'Pricing']
  },
  {
    name: 'Tunde Adebayo',
    company: 'Nexa Retail',
    stage: 'Refund risk',
    owner: 'Sade',
    lastSeen: '13m ago',
    lifetime: '$6,120',
    tags: ['Refund', 'Email', 'Priority']
  },
  {
    name: 'Elena Petrova',
    company: 'Northstar Clinics',
    stage: 'Demo booked',
    owner: 'Olu',
    lastSeen: '24m ago',
    lifetime: '$24,000',
    tags: ['Instagram', 'Hot lead', 'Automation']
  },
  {
    name: 'Jordan Miles',
    company: 'Apex Growth',
    stage: 'Support escalation',
    owner: 'Team',
    lastSeen: '41m ago',
    lifetime: '$980',
    tags: ['Messenger', 'Billing', 'Sensitive']
  }
]);

export const leads = withWorkspaceId([
  {
    name: 'Maya Chen',
    company: 'Brightlane Studio',
    email: 'maya@brightlane.studio',
    phone: '+2348015550101',
    source: 'WhatsApp',
    capturedAt: '2m ago',
    leadStage: 'Qualified',
    captureReason: 'Asked about automation limits and plan tiers'
  },
  {
    name: 'Tunde Adebayo',
    company: 'Nexa Retail',
    email: 'tunde@nexa-retail.com',
    phone: '',
    source: 'Email',
    capturedAt: '13m ago',
    leadStage: 'Refund risk',
    captureReason: 'Requested refund resolution before close of business'
  },
  {
    name: 'Elena Petrova',
    company: 'Northstar Clinics',
    email: 'elena@northstarclinics.com',
    phone: '+2347015550124',
    source: 'Instagram',
    capturedAt: '24m ago',
    leadStage: 'Demo booked',
    captureReason: 'Shared demo interest and requested implementation plan'
  },
  {
    name: 'Ifeoma Nwosu',
    company: 'Harbor Legal',
    email: 'ifeoma@harborlegal.co',
    phone: '+2348035550150',
    source: 'SMS',
    capturedAt: '52m ago',
    leadStage: 'Pricing review',
    captureReason: 'Asked for a faster pricing summary and rollout timeline'
  },
  {
    name: 'Samuel Hart',
    company: 'Westbridge Health',
    email: 'samuel@westbridgehealth.io',
    phone: '+2348095550133',
    source: 'Voice',
    capturedAt: '1h ago',
    leadStage: 'Finance callback',
    captureReason: 'Voice receptionist captured a callback request for annual-plan approval'
  }
]);

export const deals = withWorkspaceId([
  { stage: 'Discovery', value: '$42,000', count: 8, tone: 'info' },
  { stage: 'Qualified', value: '$118,400', count: 13, tone: 'success' },
  { stage: 'Proposal', value: '$204,100', count: 9, tone: 'warning' },
  { stage: 'Negotiation', value: '$92,750', count: 5, tone: 'accent' },
  { stage: 'Won', value: '$146,300', count: 6, tone: 'positive' }
]);

export const refunds = withWorkspaceId([
  {
    requestId: '#RF-4021',
    customer: 'Nexa Retail',
    amount: '$480',
    reason: 'Duplicate charge',
    status: 'Pending approval',
    statusTone: 'warning',
    owner: 'Finance',
    updatedAt: '6m ago'
  },
  {
    requestId: '#RF-4020',
    customer: 'Apex Growth',
    amount: '$120',
    reason: 'Feature mismatch',
    status: 'Approved',
    statusTone: 'success',
    owner: 'Sade',
    updatedAt: '22m ago'
  },
  {
    requestId: '#RF-4018',
    customer: 'Brightlane Studio',
    amount: '$1,200',
    reason: 'Invoice correction',
    status: 'Needs review',
    statusTone: 'info',
    owner: 'Ada',
    updatedAt: '1h ago'
  }
]);

export const sequences = withWorkspaceId([
  {
    name: 'Trial Conversion Nurture',
    status: 'Active',
    steps: 5,
    replies: '12.8%',
    deliveries: '96.4%',
    nextRun: 'Today, 4:00 PM'
  },
  {
    name: 'Refund Save-Back',
    status: 'Paused',
    steps: 4,
    replies: '8.1%',
    deliveries: '99.1%',
    nextRun: 'Manual approval'
  },
  {
    name: 'Dormant Lead Reactivation',
    status: 'Active',
    steps: 6,
    replies: '9.6%',
    deliveries: '95.8%',
    nextRun: 'Tomorrow, 9:30 AM'
  }
]);

export const automations = withWorkspaceId([
  {
    trigger: 'New inbound lead',
    action: 'Assign owner + create deal + send AI intro',
    status: 'Live',
    runs: '214 today',
    health: 'Healthy'
  },
  {
    trigger: 'Refund ticket opened',
    action: 'Route to finance + alert support + freeze escalation',
    status: 'Live',
    runs: '38 today',
    health: 'Healthy'
  },
  {
    trigger: 'No response in 24h',
    action: 'Send follow-up + escalate to team lead',
    status: 'Draft',
    runs: '12 pending',
    health: 'Needs review'
  }
]);

export const integrations = withWorkspaceId([
  { name: 'Nango', type: 'Integration layer', status: 'Connected', detail: 'OAuth + token refresh orchestration', tone: 'success' },
  { name: 'Paystack', type: 'Payments', status: 'Connected', detail: 'Subscriptions and payment webhooks enabled', tone: 'success' },
  { name: 'Email', type: 'Email sync', status: 'Connected', detail: 'Inbox mirroring, watch registration, and calendar access', tone: 'success' },
  { name: 'WhatsApp', type: 'Messaging', status: 'Ready', detail: 'Sandbox sender and outbound testing path', tone: 'success' },
  { name: 'Instagram', type: 'Social messaging', status: 'Linked', detail: 'Botpress JSON webhook workflow for DMs', tone: 'info' },
  { name: 'Messenger', type: 'Social messaging', status: 'Linked', detail: 'Twilio Conversations webhook path', tone: 'info' }
]);

export const analytics = {
  workspace_id: workspace.id,
  revenueSpark: [42, 44, 48, 51, 54, 58, 62, 64, 66, 70, 74, 79],
  responseSpark: [7, 7, 6, 6, 5, 4, 4, 3, 3, 3, 2, 2],
  conversionSpark: [12, 13, 12, 14, 15, 15, 16, 18, 18, 19, 20, 21]
};

export const performanceSnapshot = withWorkspaceId([
  {
    totalConversations: '428',
    leadsCaptured: '126',
    aiResponseRate: '84%',
    manualResponseRate: '16%',
    note: 'Last 30 days'
  }
]);

export const billing = {
  workspace_id: workspace.id,
  plan: 'Growth Suite',
  nextInvoice: '$2,400 due on Apr 02, 2026',
  monthlyUsage: [
    ['Inbox messages', '61%'],
    ['AI suggestions', '38%'],
    ['Automations', '70%'],
    ['Stored files', '42%']
  ]
};

export const team = withWorkspaceId([
  { name: 'Ada Okafor', role: 'Support Lead', access: 'Full access', status: 'Online' },
  { name: 'Sade Williams', role: 'Finance Ops', access: 'Refund approvals', status: 'Offline' },
  { name: 'Olu Martins', role: 'Sales Manager', access: 'Pipeline + inbox', status: 'Online' },
  { name: 'Lina Gomez', role: 'Automation Architect', access: 'Workflow builder', status: 'Online' }
]);

export const onboardingChecklist = [
  'Connect Email, WhatsApp, and social channels',
  'Import contacts or sync from CRM',
  'Configure routing rules and team ownership',
  'Enable AI reply suggestions and internal notes',
  'Create first sequence and approval workflow'
];

export const authCards = withWorkspaceId([
  {
    title: 'Secure sign-in',
    body: 'Email, SSO, passkeys, and one-time link authentication.'
  },
  {
    title: 'Workspace setup',
    body: 'Branding, channels, users, billing, and routing ready before launch.'
  },
  {
    title: 'Seed data import',
    body: 'Upload CSV or connect live integrations to populate the inbox and CRM.'
  },
  {
    title: 'Supabase auth',
    body: 'Sign in, select a workspace, and load real data before voice or Nango actions.'
  }
]);

export const knowledgeBase = withWorkspaceId([
  {
    title: 'Company overview',
    type: 'Doc',
    status: 'Published',
    updatedAt: '12m ago',
    summary: 'Northstar Commerce provides omnichannel AI reception and revenue operations for service businesses.'
  },
  {
    title: 'Services and positioning',
    type: 'Doc',
    status: 'Published',
    updatedAt: '1h ago',
    summary: 'AI receptionist, messaging automation, lead capture, follow-up, and handoff workflows.'
  },
  {
    title: 'Pricing and packages',
    type: 'Sheet',
    status: 'Draft',
    updatedAt: '3h ago',
    summary: 'Starter, Growth, and Enterprise tiers with seat-based and usage-based pricing notes.'
  },
  {
    title: 'Business hours and coverage',
    type: 'Doc',
    status: 'Published',
    updatedAt: '5h ago',
    summary: 'Response windows, after-hours routing, and escalation rules for live reception coverage.'
  },
  {
    title: 'Policies and escalation',
    type: 'Doc',
    status: 'Published',
    updatedAt: 'Yesterday',
    summary: 'Refund handling, human handoff criteria, and compliance guardrails for channel replies.'
  }
]);
