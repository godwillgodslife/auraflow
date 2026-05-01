import {
  alerts as seedAlerts,
  analytics as seedAnalytics,
  authCards as seedAuthCards,
  automations as seedAutomations,
  billing as seedBilling,
  contacts as seedContacts,
  conversationThread,
  conversations as seedConversations,
  deals as seedDeals,
  leads as seedLeads,
  integrations as seedIntegrations,
  knowledgeBase as seedKnowledgeBase,
  channelVolume as seedChannelVolume,
  performanceSnapshot as seedPerformanceSnapshot,
  navSections,
  onboardingChecklist,
  refunds as seedRefunds,
  sequences as seedSequences,
  stats as seedStats,
  team as seedTeam,
  workspace
} from './data.js';
import { formatChannelLabel } from './ui/formatters.js';

const app = document.getElementById('app');
const runtimeConfig = typeof window !== 'undefined' && window.__AURAFLOW_CONFIG__ ? window.__AURAFLOW_CONFIG__ : {};
const botpressInstagramReady = Boolean(runtimeConfig.instagramBotpressReady || runtimeConfig.botpressTokenPushConfigured || runtimeConfig.botpressReplyWebhookConfigured);

const state = {
  activeScreen: 'dashboard',
  activeInboxFilter: 'all',
  selectedConversationId: seedConversations[0].id,
  selectedLeadName: seedLeads[0].name,
  leadQuery: '',
  pausedConversationIds: new Set(),
  modalOpen: false
};

const currentWorkspaceId = workspace.id || 'workspace-northstar';
const scopeWorkspace = (items) => items.filter((item) => !item.workspace_id || item.workspace_id === currentWorkspaceId);
const scopeWorkspaceObject = (item) => (!item || !item.workspace_id || item.workspace_id === currentWorkspaceId ? item : null);
const alerts = scopeWorkspace(seedAlerts);
const analytics = scopeWorkspaceObject(seedAnalytics) || seedAnalytics;
const authCards = scopeWorkspace(seedAuthCards);
const automations = scopeWorkspace(seedAutomations);
const billing = scopeWorkspaceObject(seedBilling) || seedBilling;
const contacts = scopeWorkspace(seedContacts);
const leads = scopeWorkspace(seedLeads);
const conversations = scopeWorkspace(seedConversations);
const deals = scopeWorkspace(seedDeals);
const integrations = scopeWorkspace(seedIntegrations);
const knowledgeBase = scopeWorkspace(seedKnowledgeBase);
const channelVolume = scopeWorkspace(seedChannelVolume);
const refunds = scopeWorkspace(seedRefunds);
const sequences = scopeWorkspace(seedSequences);
const stats = scopeWorkspace(seedStats);
const team = scopeWorkspace(seedTeam);

function normalizeInboxFilter(value = 'all') {
  const normalized = String(value || 'all').trim().toLowerCase();
  return ['all', 'unread', 'whatsapp', 'email', 'instagram', 'messenger', 'sms', 'voice'].includes(normalized)
    ? normalized
    : 'all';
}

function firstName(name = '') {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function formatCompactCount(value = 0) {
  const numeric = Number(value || 0);
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(numeric >= 10000 ? 0 : 1)}k`;
  return String(numeric);
}

function getChannelMark(channel = '') {
  const normalized = String(channel || '').trim().toLowerCase();
  if (normalized === 'email' || normalized === 'gmail') return '✉';
  if (normalized === 'whatsapp') return 'WA';
  if (normalized === 'sms') return 'SMS';
  if (normalized === 'voice') return 'VO';
  if (normalized === 'instagram') return 'IG';
  if (normalized === 'messenger') return 'ME';
  return '•';
}

function getReplyRouteLabel(channel = '') {
  const normalized = String(channel || '').trim().toLowerCase();
  if (normalized === 'instagram') return 'Botpress';
  if (normalized === 'whatsapp' || normalized === 'sms' || normalized === 'voice' || normalized === 'messenger') return 'Twilio';
  if (normalized === 'gmail' || normalized === 'email') return 'Gmail';
  return 'Workspace default';
}

function getIntegrationMark(name = '') {
  const normalized = String(name || '').trim().toLowerCase();
  if (normalized.includes('instagram')) return 'IG';
  if (normalized.includes('whatsapp')) return 'WA';
  if (normalized.includes('messenger')) return 'ME';
  if (normalized.includes('email')) return 'EM';
  if (normalized.includes('voice')) return 'VO';
  if (normalized.includes('sms')) return 'SMS';
  if (normalized.includes('gmail')) return 'GM';
  if (normalized.includes('twilio')) return 'TW';
  if (normalized.includes('botpress')) return 'BP';
  if (normalized.includes('nango')) return 'NG';
  if (normalized.includes('paystack')) return 'PY';
  return 'AF';
}

function toBooleanFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
}

function isConversationPaused(item = {}) {
  return state.pausedConversationIds.has(item.id) || toBooleanFlag(item.is_ai_paused) || toBooleanFlag(item.isAiPaused);
}

function buildConversationDetail(item) {
  if (!item) {
    return {
      messages: [],
      internalNotes: [],
      aiSuggestions: [],
      profileName: 'No contact selected',
      profileSubtitle: 'Choose a conversation to load context',
      contextGrid: [],
      highlight: 'Queue is filtered or empty.'
    };
  }

  const channel = formatChannelLabel(item.channel);
  const replyRoute = getReplyRouteLabel(item.channel);
  const ownerName = item.owner === 'Team' ? 'Aura Team' : item.owner;
  const noteSeed = conversationThread.internalNotes;
  const aiSeed = conversationThread.aiSuggestions;

  return {
    messages: [
      {
        from: item.name,
        body: item.lastMessage,
        time: '9:12 AM',
        side: 'customer'
      },
      {
        from: ownerName,
        body: `Thanks ${firstName(item.name)}. I can walk you through the ${channel.toLowerCase()} workflow, confirm next steps, and keep the handoff visible for your team.`,
        time: '9:14 AM',
        side: 'agent'
      },
      {
        from: item.name,
        body: `That helps. Can you confirm how ${replyRoute} routing and human takeover work for our account?`,
        time: '9:16 AM',
        side: 'customer'
      }
    ],
    internalNotes: [
      `${item.company} is currently tagged under ${item.tag.toLowerCase()} with ${item.status.toLowerCase()} priority.`,
      `${ownerName} is responsible for the next outbound step and expected value is ${item.value}.`,
      noteSeed[2] || 'AI summary suggests a product-led demo with refund workflow emphasis.'
    ],
    aiSuggestions: [
      `Lead with a ${channel.toLowerCase()}-specific answer, then confirm implementation timing.`,
      aiSeed[1] || 'Confirm refund approval workflow and mention finance handoff visibility.',
      `Mention that replies will continue through ${replyRoute} without changing the customer experience.`
    ],
    profileName: item.name,
    profileSubtitle: `${item.company} • ${channel}`,
    contextGrid: [
      { label: 'Expected value', value: item.value },
      { label: 'Owner', value: ownerName },
      { label: 'Channel', value: channel },
      { label: 'Sentiment', value: item.sentiment }
    ],
    highlight: `${item.status} • ${item.updatedAt}`
  };
}

const screenMeta = {
  dashboard: { title: 'Dashboard', subtitle: 'Command center for revenue, support, and automation.' },
  inbox: { title: 'Unified Inbox', subtitle: 'One workspace for every customer conversation.' },
  leads: { title: 'Leads', subtitle: 'Unified lead profiles with history, source, and ownership.' },
  contacts: { title: 'Leads', subtitle: 'Unified lead profiles with history, source, and ownership.' },
  pipeline: { title: 'Pipeline', subtitle: 'Monitor deals, stages, and forecasted revenue.' },
  refunds: { title: 'Refunds', subtitle: 'Track approvals, resolution steps, and save-back workflows.' },
  outreach: { title: 'Outreach', subtitle: 'Sequences for lead nurture, reactivation, and conversion.' },
  analytics: { title: 'Analytics', subtitle: 'Revenue, response time, and campaign performance in one view.' },
  automations: { title: 'Automations', subtitle: 'Trigger-based workflows and routing logic.' },
  integrations: { title: 'Integrations', subtitle: 'Channel sync, API status, and token health.' },
  data: { title: 'Knowledge Base', subtitle: 'The global brain that powers every channel reply.' },
  billing: { title: 'Billing', subtitle: 'Plans, usage, invoices, and payment provider posture.' },
  settings: { title: 'Settings', subtitle: 'Workspace, users, roles, and operational controls.' },
  auth: { title: 'Authentication', subtitle: 'Login, onboarding, and workspace setup surfaces.' }
};

render();

function render() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" aria-label="Primary">
        <div class="brand-block">
          <div class="brand-mark">AF</div>
          <div>
            <div class="brand-name">AuraFlow</div>
            <div class="brand-subtitle">Omnichannel Revenue OS</div>
          </div>
        </div>

        <button class="workspace-switcher" type="button" data-action="workspace">
          <div>
            <div class="workspace-label">Workspace</div>
            <strong>${workspace.name}</strong>
          </div>
          <span class="workspace-pill">${workspace.tier}</span>
        </button>

        <nav class="nav-groups">
          ${navSections
            .map(
              (section) => `
                <section class="nav-group">
                  <h2>${section.label}</h2>
                  <div class="nav-list">
                    ${section.items
                      .map(
                        (item) => `
                          <button class="nav-item ${state.activeScreen === item.id ? 'active' : ''}" data-screen="${item.id}" type="button">
                            <span class="nav-item-icon">${item.hint.slice(0, 2).toUpperCase()}</span>
                            <span class="nav-item-copy">
                              <span class="nav-item-label">${item.label}</span>
                              <span class="nav-item-hint">${item.hint}</span>
                            </span>
                          </button>
                        `
                      )
                      .join('')}
                  </div>
                </section>
              `
            )
            .join('')}
        </nav>

        <div class="sidebar-footer">
          <div class="mini-status success">10 channels synced</div>
          <div class="mini-status muted">Last webhook: 2m ago</div>
        </div>
      </aside>

      <div class="main-shell">
        <header class="topbar">
          <div>
            <p class="eyebrow">Product phase</p>
            <h1>${screenMeta[state.activeScreen].title}</h1>
            <p class="lead">${screenMeta[state.activeScreen].subtitle}</p>
          </div>

          <div class="topbar-actions">
            <label class="search-field">
              <span>Search</span>
              <input type="search" value="Maya Chen, refund, automation" aria-label="Search" />
            </label>
            <button class="ghost-button" type="button" data-action="refresh">Refresh AI summary</button>
            <button class="primary-button" type="button" data-action="primary">${primaryActionLabel()}</button>
          </div>
        </header>

        <main class="page-shell">
          ${renderScreen(state.activeScreen)}
        </main>
      </div>
    </div>

    <div class="modal-backdrop ${state.modalOpen ? 'open' : ''}" data-modal-close="true" ${state.modalOpen ? '' : 'hidden'}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Create automation">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Create workflow</p>
            <h3>New automation</h3>
          </div>
          <button class="icon-button" type="button" data-modal-close="true">Close</button>
        </div>
        <div class="modal-grid">
          <label><span>Trigger</span><input type="text" value="No reply after 24 hours" /></label>
          <label><span>Action</span><input type="text" value="Send follow-up + assign owner" /></label>
          <label><span>Channel</span><input type="text" value="WhatsApp + Email" /></label>
          <label><span>Owner</span><input type="text" value="Growth Team" /></label>
        </div>
        <div class="modal-actions">
          <button class="ghost-button" type="button" data-modal-close="true">Cancel</button>
          <button class="primary-button" type="button" data-action="save-automation">Save automation</button>
        </div>
      </div>
    </div>

    <div class="toast-stack" aria-live="polite" aria-atomic="true"></div>
  `;

  bindEvents();
}

function renderScreen(screen) {
  switch (screen) {
    case 'dashboard':
      return renderDashboard();
    case 'inbox':
      return renderInbox();
    case 'leads':
    case 'contacts':
      return renderLeads();
    default:
      return renderSimpleScreen(screen);
  }
}

function renderDashboard() {
  const deploymentChecklist = [
    { label: 'Branding Set', detail: workspace.name, done: Boolean(workspace.name) },
    { label: 'Knowledge Base Uploaded', detail: `${knowledgeBase.length} source cards`, done: knowledgeBase.length > 0 },
    { label: 'Channels Connected', detail: `${integrations.length} active services`, done: integrations.length > 0 }
  ];
  const connectedIntegrations = integrations.filter((item) => ['connected', 'linked', 'ready'].includes(String(item.status || '').toLowerCase()));
  const pendingIntegrations = integrations.filter((item) => String(item.status || '').toLowerCase() === 'inactive');
  const reviewDemoUrl = `/admin/review-demo?workspace_id=${encodeURIComponent(currentWorkspaceId)}`;
  const hasActivity = conversations.length > 0;
  const allChecksComplete = deploymentChecklist.every((item) => item.done);

  return `
    <section class="grid stats-grid">
      ${stats.map(renderStatCard).join('')}
    </section>

    <section class="dashboard-grid">
      ${renderSetupWizard('dashboard')}

      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Deployment checklist</p>
            <h2>Workspace launch readiness</h2>
          </div>
          <span class="badge ${allChecksComplete ? 'success' : 'warning'}">${allChecksComplete ? 'Ready to deploy' : 'Needs attention'}</span>
        </div>
        <div class="checklist deployment-checklist">
          ${deploymentChecklist
            .map(
              (item) => `
                <div class="check-item deployment-check-item ${item.done ? 'complete' : 'pending'}">
                  <span class="deployment-check-mark ${item.done ? 'done' : 'pending'}">${item.done ? '✓' : '•'}</span>
                  <div>
                    <strong>${item.label}</strong>
                    <span>${item.detail}</span>
                  </div>
                  <span class="badge ${item.done ? 'success' : 'warning'}">${item.done ? 'Checked' : 'Pending'}</span>
                </div>
              `
            )
            .join('')}
        </div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Launch health</p>
            <h2>Verification surfaces</h2>
          </div>
          <span class="badge neutral">${connectedIntegrations.length} connected / ${pendingIntegrations.length} pending</span>
        </div>
        <div class="launch-health-grid">
          <div class="launch-health-summary">
            <strong>${workspace.name}</strong>
            <span>Workspace scope is filtered to the active tenant and the preview shell stays read-only until actions are explicitly launched.</span>
          </div>
          <div class="launch-health-actions">
            <button class="ghost-button compact" type="button" data-action="open-launch-route" data-route="/healthz">Check health</button>
            <button class="ghost-button compact" type="button" data-action="open-launch-route" data-route="${reviewDemoUrl}">Open review demo</button>
            <button class="ghost-button compact" type="button" data-action="open-launch-route" data-route="/api/test/lead-notification">Test lead email</button>
            <button class="ghost-button compact" type="button" data-action="open-launch-route" data-route="/api/test/botpress">Test Botpress</button>
          </div>
          <div class="launch-health-list">
            ${healthRows.map((item) => `
              <div class="launch-health-row">
                <div>
                  <strong>${item.name}</strong>
                  <span>${item.type}</span>
                </div>
                <span class="badge ${item.tone}">${item.status}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </article>

      <article class="panel panel-wide">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Executive view</p>
            <h2>Operator snapshot</h2>
          </div>
          <span class="badge neutral">Workspace isolated</span>
        </div>
        <div class="executive-strip">
          <article class="executive-card">
            <span class="eyebrow">Active workspace</span>
            <strong>${workspace.name}</strong>
            <p>Every screen, integration, and metric is scoped to the current workspace_id.</p>
          </article>
          <article class="executive-card">
            <span class="eyebrow">Live channels</span>
            <strong>${connectedIntegrations.length}</strong>
            <p>${connectedIntegrations.map((item) => item.name).join(' • ') || 'No channels connected yet.'}</p>
          </article>
          <article class="executive-card">
            <span class="eyebrow">Global brain</span>
            <strong>${knowledgeBase.length} sources</strong>
            <p>One knowledge base keeps Email, WhatsApp, Instagram, Messenger, SMS, and Voice consistent.</p>
          </article>
        </div>
      </article>

      <article class="panel panel-wide">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Command center</p>
            <h2>Priority queue</h2>
          </div>
          <div class="tabs">
            <button class="tab active" type="button">Today</button>
            <button class="tab" type="button">7 days</button>
            <button class="tab" type="button">30 days</button>
          </div>
        </div>

        <div class="alert-stack">
          ${alerts.map(renderAlert).join('')}
        </div>

        <div class="focus-grid">
          <div class="focus-card">
            <div class="focus-top">
              <span class="badge success">SLA on track</span>
              <strong>Response automation</strong>
            </div>
            <p>84% of new leads receive an AI-assisted reply within 5 minutes across Email, WhatsApp, and social DMs.</p>
            ${renderMiniBars([82, 86, 88, 90, 92, 93, 94, 94, 95, 96], 'var(--accent)')}
          </div>
          <div class="focus-card">
            <div class="focus-top">
              <span class="badge warning">Revenue risk</span>
              <strong>Refunds requiring action</strong>
            </div>
            <p>3 requests are pending approval. Two can be auto-resolved if invoice mismatch is verified.</p>
            ${renderMiniBars([12, 10, 8, 9, 7, 6, 5, 4, 4, 3], 'var(--warning)')}
          </div>
        </div>
      </article>

      <article class="panel panel-wide">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Channel mix</p>
            <h2>Message volume by channel</h2>
          </div>
          <span class="badge neutral">Last 30 days</span>
        </div>
        <div class="snapshot-grid">
          <div class="snapshot-chart">
            ${channelVolume.map(renderChannelVolumeBar).join('')}
          </div>
          <div class="snapshot-side">
            <div class="side-card">
              <p class="eyebrow">What this shows</p>
              <p>Each channel is grouped into a single operating view so the dashboard feels like one product, not a stack of separate tools.</p>
            </div>
            <div class="side-card">
              <p class="eyebrow">Workspace scope</p>
              <p>All numbers shown here are filtered to <strong>${workspace.name}</strong> only.</p>
            </div>
          </div>
        </div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Recent activity</p>
            <h2>Inbox snapshot</h2>
          </div>
          <span class="badge accent">428 open</span>
        </div>
        ${hasActivity ? `
          <div class="conversation-preview-list">
            ${conversations.slice(0, 3).map(renderConversationPreview).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <strong>No conversations yet</strong>
            <p>When messages arrive, they will appear here with their channel icons and routing badges.</p>
          </div>
        `}
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Performance snapshot</p>
            <h2>Sales and response health</h2>
          </div>
          <span class="badge success">This month</span>
        </div>
        <div class="performance-snapshot">
          <div class="performance-summary-row">
            <div class="performance-summary-card">
              <span>Total conversations</span>
              <strong>${seedPerformanceSnapshot[0].totalConversations}</strong>
            </div>
            <div class="performance-summary-card">
              <span>Leads captured</span>
              <strong>${seedPerformanceSnapshot[0].leadsCaptured}</strong>
            </div>
          </div>
          <div class="performance-rate-grid">
            <div class="performance-rate-card">
              <span>AI response rate</span>
              <strong>${seedPerformanceSnapshot[0].aiResponseRate}</strong>
              <div class="channel-volume-track" aria-hidden="true">
                <div class="channel-volume-fill" style="width:84%"></div>
              </div>
            </div>
            <div class="performance-rate-card">
              <span>Manual response rate</span>
              <strong>${seedPerformanceSnapshot[0].manualResponseRate}</strong>
              <div class="channel-volume-track" aria-hidden="true">
                <div class="channel-volume-fill" style="width:16%"></div>
              </div>
            </div>
          </div>
          <div class="mini-status muted">${seedPerformanceSnapshot[0].note}</div>
        </div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Automation health</p>
            <h2>Live workflows</h2>
          </div>
          <button class="ghost-button compact" type="button" data-action="open-modal">New rule</button>
        </div>
        <div class="automation-list">
          ${automations.map(renderAutomationItem).join('')}
        </div>
      </article>
    </section>
  `;
}

function renderInbox() {
  const activeFilter = normalizeInboxFilter(state.activeInboxFilter);
  const filteredConversations = conversations.filter((item) => {
    const channel = String(item.channel || item.source_provider || '').toLowerCase();
    if (activeFilter === 'all') return true;
    if (activeFilter === 'unread') return item.needsAttention || String(item.status || '').toLowerCase() !== 'closed';
    return channel === activeFilter;
  });
  const inboxEmpty = filteredConversations.length === 0;
  const selected = inboxEmpty
    ? null
    : filteredConversations.find((item) => item.id === state.selectedConversationId)
      || filteredConversations[0]
      || conversations[0]
      || null;
  const selectedIsPaused = selected ? isConversationPaused(selected) : false;
  const selectedChannel = selected ? formatChannelLabel(selected.channel) : 'No selection';
  const selectedRoute = selected ? getReplyRouteLabel(selected.channel) : 'Workspace default';
  const conversationDetail = buildConversationDetail(selected);
  const urgentCount = conversations.filter((item) => ['danger', 'warning'].includes(String(item.statusTone || '').toLowerCase())).length;
  const pausedCount = conversations.filter((item) => isConversationPaused(item)).length;
  const handoffCount = conversations.filter((item) => String(item.status || '').toLowerCase().includes('handoff')).length;
  return `
      <section class="inbox-layout">
        <article class="panel inbox-list-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Unified inbox</p>
            <h2>Queue</h2>
          </div>
          <span class="badge danger">${urgentCount} urgent</span>
        </div>
          <div class="inbox-summary-strip">
            <article class="inbox-summary-card">
              <span class="eyebrow">Open threads</span>
              <strong>${formatCompactCount(filteredConversations.length)}</strong>
              <p>Current filtered queue.</p>
            </article>
            <article class="inbox-summary-card">
              <span class="eyebrow">Human takeover</span>
              <strong>${formatCompactCount(pausedCount)}</strong>
              <p>Conversations with AI paused.</p>
            </article>
            <article class="inbox-summary-card">
              <span class="eyebrow">Needs handoff</span>
              <strong>${formatCompactCount(handoffCount)}</strong>
              <p>Ready for an operator or specialist.</p>
            </article>
          </div>
          <div class="filter-row">
            <button class="chip ${activeFilter === 'all' ? 'active' : ''}" type="button" data-inbox-filter="all">All</button>
            <button class="chip ${activeFilter === 'unread' ? 'active' : ''}" type="button" data-inbox-filter="unread">Unread</button>
            <button class="chip ${activeFilter === 'whatsapp' ? 'active' : ''}" type="button" data-inbox-filter="whatsapp">WhatsApp</button>
            <button class="chip ${activeFilter === 'email' ? 'active' : ''}" type="button" data-inbox-filter="email">Email</button>
            <button class="chip ${activeFilter === 'instagram' ? 'active' : ''}" type="button" data-inbox-filter="instagram">Instagram</button>
            <button class="chip ${activeFilter === 'messenger' ? 'active' : ''}" type="button" data-inbox-filter="messenger">Messenger</button>
            <button class="chip ${activeFilter === 'sms' ? 'active' : ''}" type="button" data-inbox-filter="sms">SMS</button>
            <button class="chip ${activeFilter === 'voice' ? 'active' : ''}" type="button" data-inbox-filter="voice">Voice</button>
          </div>
          ${inboxEmpty ? `
            <div class="empty-state inbox-empty-state">
              <strong>No conversations match this filter</strong>
              <p>Try another channel, or clear the filter to bring the full queue back.</p>
              <button class="ghost-button compact" type="button" data-inbox-filter="all">Show all conversations</button>
            </div>
          ` : `
            <div class="conversation-list">
              ${filteredConversations.map((item) => renderConversationRow(item, item.id === selected.id)).join('')}
            </div>
          `}
        </article>

      <article class="panel inbox-detail-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Conversation detail</p>
            <h2>${selected ? selected.name : 'No conversation selected'}</h2>
          </div>
          ${selected ? `
            <div class="status-stack">
              <span class="badge danger">${selected.status}</span>
              <span class="badge neutral">${selectedChannel}</span>
              <button class="ghost-button compact" type="button" data-action="toggle-hitl" data-conversation="${selected.id}">
                ${selectedIsPaused ? 'Resume AI' : 'Pause AI'}
              </button>
            </div>
          ` : `
            <div class="status-stack">
              <span class="badge neutral">Filtered empty</span>
            </div>
          `}
        </div>

        <div class="detail-meta detail-meta-hero">
          <div>
            <strong>${selected ? selected.company : 'Workspace queue'}</strong>
            <span>${selected ? `${selected.owner} assigned` : 'Pick a thread to inspect the operator view'}</span>
          </div>
          <div>
            <strong>${selected ? selected.value : '—'}</strong>
            <span>Expected value</span>
          </div>
          <div>
            <strong>${selected ? selected.sentiment : '—'}</strong>
            <span>Conversation sentiment</span>
          </div>
        </div>

        ${selected ? `
          <div class="detail-status-row">
            <span class="badge accent">Route: ${selectedRoute}</span>
            <span class="badge ${selectedIsPaused ? 'warning' : 'success'}">
              ${selectedIsPaused ? 'Human takeover active' : 'AI drafting enabled'}
            </span>
            <span class="badge neutral">${selected.updatedAt}</span>
          </div>
          <div class="thread-hero-card">
            <div class="thread-hero-profile">
              <div class="avatar channel-mark channel-${String(selected.channel || '').toLowerCase()}">${getChannelMark(selected.channel)}</div>
              <div>
                <strong>${conversationDetail.profileName}</strong>
                <span>${conversationDetail.profileSubtitle}</span>
              </div>
            </div>
            <p>${conversationDetail.highlight}</p>
          </div>
          <div class="thread">
            ${conversationDetail.messages
              .map(
                (message) => `
                  <div class="message ${message.side}">
                    <div class="message-head">
                      <strong>${message.from}</strong>
                      <span>${message.time}</span>
                    </div>
                    <p>${message.body}</p>
                  </div>
                `
              )
              .join('')
            }
          </div>
          <div class="composer">
            <div class="composer-toolbar">
              <span class="badge ${selectedIsPaused ? 'warning' : 'success'}">
                ${selectedIsPaused ? 'Human takeover active' : 'AI drafting enabled'}
              </span>
              <span class="badge neutral">Internal notes visible</span>
              <span class="badge accent">Auto-route: ${selectedRoute}</span>
            </div>
          <div class="composer-box">
            <textarea rows="4">Thanks Maya. I can confirm the team plan includes 120 automations, shared inbox notes, and refund approval workflows. Would you like a 15-minute walkthrough?</textarea>
            <div class="composer-actions">
              <button class="ghost-button" type="button">Save note</button>
              <button class="primary-button" type="button">Send reply</button>
            </div>
          </div>
          </div>
        ` : `
          <div class="empty-state thread-empty-state inbox-detail-empty">
            <strong>${inboxEmpty ? 'No results in this filter' : 'No conversation selected'}</strong>
            <p>${inboxEmpty ? 'Clear the filter to bring the queue back, or switch to another channel.' : 'Pick a thread from the queue to see the operator view.'}</p>
            <div class="empty-state-actions">
              <button class="ghost-button compact" type="button" data-inbox-filter="all">Show all conversations</button>
            </div>
          </div>
        `}
        </article>

      <aside class="panel inbox-side-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">AI assistant</p>
            <h2>Suggestions</h2>
          </div>
          <span class="badge accent">3 ready</span>
        </div>
        <div class="inbox-side-summary">
          <div class="mini-status ${selectedIsPaused ? 'warning' : 'success'}">${selectedIsPaused ? 'Human operator owns next reply' : 'AI can draft next reply'}</div>
          <div class="mini-status muted">Outbound route: ${selectedRoute}</div>
        </div>
        <div class="suggestion-stack">
          ${conversationDetail.aiSuggestions.map(renderSuggestionCard).join('')}
        </div>

        <div class="side-card">
          <p class="eyebrow">Internal notes</p>
          <ul class="note-list">
            ${conversationDetail.internalNotes.map((note) => `<li>${note}</li>`).join('')}
          </ul>
        </div>

        <div class="side-card">
          <p class="eyebrow">Customer context</p>
          <div class="profile-snippet">
            <div class="avatar">${selected ? initials(selected.name) : '--'}</div>
            <div>
              <strong>${conversationDetail.profileName}</strong>
              <span>${conversationDetail.profileSubtitle}</span>
            </div>
          </div>
          <div class="context-grid">
            ${conversationDetail.contextGrid.map((row) => `<div><span>${row.label}</span><strong>${row.value}</strong></div>`).join('')}
          </div>
        </div>
      </aside>
    </section>
  `;
}

function renderContacts() {
  const selected = contacts.find((item) => item.name === state.selectedContactName) || contacts[0];
  return `
    <section class="panel page-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Customer management</p>
          <h2>Profiles and segments</h2>
        </div>
        <div class="panel-actions">
          <input class="inline-search" value="Search customers, tags, owners" aria-label="Customer search" />
          <button class="ghost-button" type="button">Export CSV</button>
        </div>
      </div>

      <div class="two-column">
        <div>
          <div class="table-card">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Stage</th>
                  <th>Owner</th>
                  <th>Last seen</th>
                  <th>Lifetime value</th>
                </tr>
              </thead>
              <tbody>
                ${contacts
                  .map(
                    (item) => `
                      <tr class="${item.name === selected.name ? 'selected' : ''}" data-contact="${item.name}">
                        <td data-label="Customer">
                          <strong>${item.name}</strong>
                          <span>${item.company}</span>
                        </td>
                        <td data-label="Stage"><span class="badge neutral">${item.stage}</span></td>
                        <td data-label="Owner">${item.owner}</td>
                        <td data-label="Last seen">${item.lastSeen}</td>
                        <td data-label="Lifetime value">${item.lifetime}</td>
                      </tr>
                    `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <aside class="side-card profile-card">
          <p class="eyebrow">Selected profile</p>
          <div class="profile-snippet">
            <div class="avatar">${initials(selected.name)}</div>
            <div>
              <strong>${selected.name}</strong>
              <span>${selected.company}</span>
            </div>
          </div>
          <div class="profile-metrics">
            <div><span>Lifecycle stage</span><strong>${selected.stage}</strong></div>
            <div><span>Owner</span><strong>${selected.owner}</strong></div>
            <div><span>Lifetime value</span><strong>${selected.lifetime}</strong></div>
            <div><span>Tags</span><strong>${selected.tags.join(' · ')}</strong></div>
          </div>
          <div class="tag-cloud">
            ${selected.tags.map((tag) => `<span class="badge accent">${tag}</span>`).join('')}
          </div>
          <div class="timeline">
            <div class="timeline-item">
              <strong>Purchase completed</strong>
              <span>Invoice #4821 recorded 19 days ago</span>
            </div>
            <div class="timeline-item">
              <strong>Support escalation</strong>
              <span>Refund concern tagged and routed to finance</span>
            </div>
            <div class="timeline-item">
              <strong>Next follow-up</strong>
              <span>Automated sequence due tomorrow at 11:00 AM</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderLeads() {
  const filteredLeads = getFilteredLeads();
  const selected = filteredLeads.find((item) => item.name === state.selectedLeadName) || filteredLeads[0] || leads[0] || {
    name: 'No lead',
    company: 'Workspace',
    source: 'Direct',
    leadStage: 'New',
    owner: 'Unassigned',
    capturedAt: 'Recently',
    lifetime: '$0',
    tags: [],
    captureReason: 'No lead data available yet.'
  };
  const hasResults = filteredLeads.length > 0;
  const sourceMix = leads.reduce((acc, item) => {
    const source = normalizeLeadSource(item.source || (Array.isArray(item.tags) ? item.tags[0] : '') || '');
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  const stageMix = leads.reduce((acc, item) => {
    const stage = String(item.leadStage || item.stage || 'New').trim();
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});
  const capturedCount = leads.filter((item) => Boolean(item.email || item.phone)).length;
  const topStage = Object.entries(stageMix).sort((a, b) => b[1] - a[1])[0];
  const topSources = Object.entries(sourceMix).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `
    <section class="panel page-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Leads</p>
          <h2>Profiles and segments</h2>
        </div>
        <div class="panel-actions">
          <input class="inline-search" value="${state.leadQuery}" data-lead-search placeholder="Search leads, source, tags" aria-label="Lead search" />
          <button class="ghost-button" type="button" data-action="export-leads-csv">Export CSV</button>
        </div>
      </div>

      <div class="lead-summary-strip">
        <article class="lead-summary-card">
          <span class="eyebrow">Captured leads</span>
          <strong>${capturedCount}</strong>
          <p>Emails and phone numbers captured across the current workspace.</p>
        </article>
        <article class="lead-summary-card">
          <span class="eyebrow">Conversion stage</span>
          <strong>${topStage ? topStage[0] : (selected.leadStage || selected.stage)}</strong>
          <p>${topStage ? `${topStage[1]} leads are clustered in the strongest stage right now.` : (selected.captureReason || 'Selected lead context shown in the executive sidebar.')}</p>
        </article>
        <article class="lead-summary-card">
          <span class="eyebrow">Source mix</span>
          <strong>${Object.keys(sourceMix).length}</strong>
          <p>${Object.entries(sourceMix).map(([source, count]) => `${source} ${count}`).join(' • ') || 'No source mix available yet.'}</p>
        </article>
      </div>

      <div class="lead-mix-strip">
        <div class="lead-mix-group">
          <span class="eyebrow">Top sources</span>
          <div class="lead-mix-pills">
            ${topSources.map(([source, count]) => `
              <span class="lead-source-chip">
                <span class="lead-source-icon ${leadSourceTone(source)}" aria-hidden="true">${leadSourceGlyph(source)}</span>
                <span>${source} ${count}</span>
              </span>
            `).join('')}
          </div>
        </div>
        <div class="lead-mix-group">
          <span class="eyebrow">Stage mix</span>
          <div class="lead-stage-pills">
            ${Object.entries(stageMix).map(([stage, count]) => `<span class="badge neutral">${stage}: ${count}</span>`).join('')}
          </div>
        </div>
      </div>

      <div class="two-column">
        <div>
          ${hasResults ? '' : `
            <div class="empty-state table-empty-state">
              <strong>No leads match your search</strong>
              <p>Try a different name, company, source, or tag.</p>
            </div>
          `}
          <div class="table-card">
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Stage</th>
                  <th>Source</th>
                  <th>Owner</th>
                  <th>Captured</th>
                  <th>Lifetime value</th>
                </tr>
              </thead>
              <tbody>
                ${filteredLeads
                  .map(
                    (item) => `
                      <tr class="${item.name === selected.name ? 'selected' : ''}" data-lead="${item.name}">
                        <td data-label="Lead">
                          <strong>${item.name}</strong>
                          <span>${item.company}</span>
                        </td>
                        <td data-label="Stage"><span class="badge neutral">${item.leadStage || item.stage}</span></td>
                        <td data-label="Source">
                          <span class="lead-source-chip">
                            <span class="lead-source-icon ${leadSourceTone(item.source || (Array.isArray(item.tags) ? item.tags[0] : '') || '')}" aria-hidden="true">
                              ${leadSourceGlyph(item.source || (Array.isArray(item.tags) ? item.tags[0] : '') || '')}
                            </span>
                            <span>${item.source || (Array.isArray(item.tags) ? item.tags[0] : '') || 'Direct'}</span>
                          </span>
                        </td>
                        <td data-label="Owner">${item.owner || 'Unassigned'}</td>
                        <td data-label="Captured">${item.capturedAt || item.lastSeen || 'Recently'}</td>
                        <td data-label="Lifetime value">${item.lifetime || '$0'}</td>
                      </tr>
                    `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <aside class="side-card profile-card">
          <p class="eyebrow">Selected lead</p>
          <div class="profile-snippet">
            <div class="avatar">${initials(selected.name)}</div>
            <div>
              <strong>${selected.name}</strong>
              <span>${selected.company}</span>
            </div>
          </div>
          <div class="profile-metrics">
            <div><span>Lifecycle stage</span><strong>${selected.leadStage || selected.stage}</strong></div>
            <div><span>Source</span><strong>${selected.source || 'Direct'}</strong></div>
            <div><span>Owner</span><strong>${selected.owner || 'Unassigned'}</strong></div>
            <div><span>Lifetime value</span><strong>${selected.lifetime || '$0'}</strong></div>
            <div><span>Tags</span><strong>${(selected.tags || []).join(' · ')}</strong></div>
          </div>
          <div class="tag-cloud">
            ${(selected.tags || []).map((tag) => `<span class="badge accent">${tag}</span>`).join('')}
          </div>
          <div class="timeline">
            <div class="timeline-item">
              <strong>Captured from</strong>
              <span>${selected.captureReason || 'Inbound message identified as a lead.'}</span>
            </div>
            <div class="timeline-item">
              <strong>Contact details</strong>
              <span>${selected.email || 'Email not captured'}${selected.phone ? ` · ${selected.phone}` : ''}</span>
            </div>
            <div class="timeline-item">
              <strong>Next follow-up</strong>
              <span>Automated sequence ready for the active workspace</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function getFilteredLeads() {
  const query = String(state.leadQuery || '').trim().toLowerCase();
  return leads.filter((item) => {
    if (!query) return true;
    const haystack = [
      item.name,
      item.company,
      item.email,
      item.phone,
      item.source,
      item.leadStage,
      item.captureReason,
      ...(Array.isArray(item.tags) ? item.tags : [])
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function normalizeLeadSource(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('instagram')) return 'Instagram';
  if (normalized.includes('messenger')) return 'Messenger';
  if (normalized.includes('whatsapp')) return 'WhatsApp';
  if (normalized.includes('sms')) return 'SMS';
  if (normalized.includes('voice')) return 'Voice';
  if (normalized.includes('email') || normalized.includes('gmail')) return 'Email';
  if (!normalized) return 'Direct';
  return value;
}

function leadSourceGlyph(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('instagram')) return 'IG';
  if (normalized.includes('messenger')) return 'ME';
  if (normalized.includes('whatsapp')) return 'WA';
  if (normalized.includes('sms')) return 'SMS';
  if (normalized.includes('voice')) return 'VO';
  if (normalized.includes('email') || normalized.includes('gmail')) return 'EM';
  return 'DR';
}

function leadSourceTone(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('instagram')) return 'instagram';
  if (normalized.includes('messenger')) return 'messenger';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('sms')) return 'sms';
  if (normalized.includes('voice')) return 'voice';
  if (normalized.includes('email') || normalized.includes('gmail')) return 'email';
  return 'direct';
}

function quoteCsvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildLeadsCsv(leadsRows = []) {
  const headers = ['Lead', 'Company', 'Email', 'Phone', 'Source', 'Stage', 'Owner', 'Captured'];
  const rows = leadsRows.map((item) => [
    item.name || '',
    item.company || '',
    item.email || '',
    item.phone || '',
    item.source || '',
    item.leadStage || item.stage || '',
    item.owner || '',
    item.capturedAt || item.lastSeen || ''
  ].map(quoteCsvCell).join(','));
  return [headers.map(quoteCsvCell).join(','), ...rows].join('\r\n');
}

function downloadTextFile(filename, text, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderSimpleScreen(screen) {
  if (screen === 'pipeline') return renderPipeline();
  if (screen === 'refunds') return renderRefunds();
  if (screen === 'outreach') return renderOutreach();
  if (screen === 'analytics') return renderAnalytics();
  if (screen === 'data') return renderData();
  if (screen === 'automations') return renderAutomations();
  if (screen === 'integrations') return renderIntegrations();
  if (screen === 'billing') return renderBilling();
  if (screen === 'settings') return renderSettings();
  if (screen === 'auth') return renderAuth();
  return renderDashboard();
}

function renderPipeline() {
  return `
    <section class="panel page-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Sales pipeline</p>
          <h2>Deals and opportunities</h2>
        </div>
        <div class="tabs">
          <button class="tab active" type="button">Board</button>
          <button class="tab" type="button">Table</button>
          <button class="tab" type="button">Forecast</button>
        </div>
      </div>
      <div class="kanban">
        ${deals.map(renderDealColumn).join('')}
      </div>
    </section>
  `;
}

function renderRefunds() {
  return `
    <section class="panel page-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Refund handling</p>
          <h2>Review queue</h2>
        </div>
        <span class="badge warning">3 open approvals</span>
      </div>
      <div class="table-card">
        <table>
          <thead>
            <tr>
              <th>Request</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${refunds
              .map(
                (item) => `
                  <tr>
                    <td data-label="Request"><strong>${item.requestId}</strong></td>
                    <td data-label="Customer">${item.customer}</td>
                    <td data-label="Amount">${item.amount}</td>
                    <td data-label="Reason">${item.reason}</td>
                    <td data-label="Status"><span class="badge ${item.statusTone}">${item.status}</span></td>
                    <td data-label="Owner">${item.owner}</td>
                    <td data-label="Updated">${item.updatedAt}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="workflow-rail">
        <div class="workflow-step active">Request received</div>
        <div class="workflow-step active">Identity and order verification</div>
        <div class="workflow-step">Finance approval</div>
        <div class="workflow-step">Customer notified</div>
        <div class="workflow-step">Closed</div>
      </div>
    </section>
  `;
}

function renderOutreach() {
  return `
    <section class="two-column">
      <article class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Sequences</p>
            <h2>Outreach and follow-up automation</h2>
          </div>
          <button class="ghost-button" type="button" data-action="open-modal">New sequence</button>
        </div>
        <div class="sequence-list">
          ${sequences.map(renderSequenceCard).join('')}
        </div>
      </article>

      <aside class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Campaign builder</p>
            <h2>Sequence flow</h2>
          </div>
          <span class="badge accent">Templates ready</span>
        </div>
        <div class="builder-steps">
          <div class="builder-step">1. Trigger: new lead enters from a connected channel</div>
          <div class="builder-step">2. Wait 2 hours, then send AI-crafted intro</div>
          <div class="builder-step">3. If opened but not replied, assign task to sales rep</div>
          <div class="builder-step">4. If no reply after 48 hours, escalate to owner</div>
        </div>
        <div class="side-card">
          <p class="eyebrow">Performance</p>
          <div class="metric-inline">
            <div><strong>12.8%</strong><span>Reply rate</span></div>
            <div><strong>96.4%</strong><span>Delivery rate</span></div>
            <div><strong>4.6x</strong><span>ROI multiplier</span></div>
          </div>
        </div>
      </aside>
    </section>
  `;
}

function renderAnalytics() {
  return `
    <section class="panel page-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Analytics</p>
          <h2>Revenue, response, and conversion insights</h2>
        </div>
        <div class="tabs">
          <button class="tab active" type="button">This month</button>
          <button class="tab" type="button">Quarter</button>
          <button class="tab" type="button">Year</button>
        </div>
      </div>

      <div class="stats-grid compact">
        <div class="mini-chart-card">
          <span class="eyebrow">Revenue trend</span>
          <strong>$124.8k</strong>
          ${renderSparkline(analytics.revenueSpark, 'var(--accent)')}
        </div>
        <div class="mini-chart-card">
          <span class="eyebrow">First response</span>
          <strong>3m 12s</strong>
          ${renderSparkline(analytics.responseSpark, 'var(--warning)')}
        </div>
        <div class="mini-chart-card">
          <span class="eyebrow">Conversion rate</span>
          <strong>21%</strong>
          ${renderSparkline(analytics.conversionSpark, 'var(--success)')}
        </div>
      </div>

      <div class="analytics-grid">
        <div class="panel-subcard">
          <p class="eyebrow">Channel performance</p>
          <div class="metric-rows">
            <div><span>WhatsApp</span><strong>62% reply rate</strong></div>
            <div><span>Email</span><strong>41% reply rate</strong></div>
            <div><span>SMS</span><strong>33% reply rate</strong></div>
            <div><span>Voice</span><strong>18% conversion assist</strong></div>
            <div><span>Instagram</span><strong>27% reply rate</strong></div>
            <div><span>Messenger</span><strong>19% reply rate</strong></div>
          </div>
        </div>
        <div class="panel-subcard">
          <p class="eyebrow">Agent productivity</p>
          <div class="metric-rows">
            <div><span>Ada</span><strong>93 conversations handled</strong></div>
            <div><span>Sade</span><strong>17 refund cases closed</strong></div>
            <div><span>Olu</span><strong>14 deals advanced</strong></div>
            <div><span>Lina</span><strong>11 automations updated</strong></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderAutomations() {
  return `
    <section class="two-column">
      <article class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Workflow engine</p>
            <h2>Automation catalog</h2>
          </div>
          <button class="primary-button" type="button" data-action="open-modal">Create automation</button>
        </div>
        <div class="automation-list">
          ${automations.map(renderAutomationItem).join('')}
        </div>
      </article>

      <aside class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Builder preview</p>
            <h2>Rule anatomy</h2>
          </div>
          <span class="badge success">Version 1.0</span>
        </div>
        <div class="builder-steps">
          <div class="builder-step">Trigger: conversation marked as refund risk</div>
          <div class="builder-step">Condition: invoice value above $250</div>
          <div class="builder-step">Action: create finance task and notify Slack</div>
          <div class="builder-step">Fallback: send customer status update after approval</div>
        </div>
        <div class="side-card">
          <p class="eyebrow">Execution log</p>
          <ul class="note-list">
            <li>214 runs today</li>
            <li>99.2% success rate over the last 7 days</li>
            <li>2 rules require manual review before activation</li>
          </ul>
        </div>
      </aside>
    </section>
  `;
}

function renderIntegrations() {
  const channelFamilies = integrations.map((item) => ({
    label: item.name,
    detail: item.detail,
    status: item.name === 'Instagram' && botpressInstagramReady ? 'Connected' : item.status,
    tone: item.name === 'Instagram' && botpressInstagramReady ? 'success' : item.tone
  }));
  const connectedCount = channelFamilies.filter((item) => ['Connected', 'Ready', 'Linked'].includes(item.status)).length;
  const pendingCount = channelFamilies.filter((item) => String(item.status || '').toLowerCase() === 'inactive').length;
  const activeChannels = channelFamilies.filter((item) => ['Connected', 'Ready', 'Linked'].includes(item.status));
  const healthRows = integrations.map((item) => ({
    ...item,
    status: item.name === 'Instagram' && botpressInstagramReady ? 'Connected' : item.status,
    tone: item.name === 'Instagram' && botpressInstagramReady ? 'success' : item.tone
  }));

  return `
    <section class="panel page-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Integrations and sync</p>
          <h2>Connected services</h2>
        </div>
        <span class="badge neutral">${connectedCount} live / ${pendingCount} pending</span>
      </div>
      <div class="integration-summary">
        <div class="side-card">
          <p class="eyebrow">Workspace scope</p>
          <p>Everything on this page is filtered to <strong>${workspace.name}</strong> and the active workspace_id.</p>
        </div>
        <div class="side-card">
          <p class="eyebrow">Health posture</p>
          <p>Nango, Twilio, Gmail, and Botpress are surfaced here as one operating layer, not separate vendor tabs.</p>
        </div>
      </div>
      <div class="integration-command-strip">
        <article class="integration-command-card">
          <span class="eyebrow">Connected now</span>
          <strong>${connectedCount}</strong>
          <p>${activeChannels.map((item) => item.label).join(' • ') || 'No active channels yet.'}</p>
        </article>
        <article class="integration-command-card">
          <span class="eyebrow">Global brain</span>
          <strong>${knowledgeBase.length} sources</strong>
          <p>All connected channels read from the same workspace knowledge before drafting.</p>
        </article>
      </div>
      <div class="integration-grid">
        ${channelFamilies
          .map(
            (item) => `
              <article class="integration-card">
                <div class="integration-head">
                  <div class="integration-mark">${getIntegrationMark(item.label)}</div>
                  <div>
                    <strong>${item.label}</strong>
                    <span>Channel family</span>
                  </div>
                  <span class="badge ${item.tone}">${item.status}</span>
                </div>
                <p>${item.detail}</p>
                <div class="integration-meta">
                  <span>Workspace: ${workspace.name}</span>
                  <span>Route: ${getReplyRouteLabel(item.label)}</span>
                </div>
                <div class="integration-actions">
                  <button class="ghost-button compact" type="button">Settings</button>
                </div>
              </article>
            `
          )
          .join('')}
      </div>
      <div class="integration-stack">
        <p class="eyebrow">Global brain</p>
        <div class="side-card">
          <p>All six channels read from the same knowledge base before drafting replies, so Email, WhatsApp, SMS, Voice, Instagram, and Messenger stay consistent.</p>
        </div>
      </div>
    </section>
  `;
}

function renderData() {
  return `
    <section class="two-column">
      <article class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Knowledge Base</p>
            <h2>Global brain</h2>
          </div>
          <button class="primary-button" type="button">Upload document</button>
        </div>
        <div class="knowledge-grid">
          ${knowledgeBase.map(renderKnowledgeCard).join('')}
        </div>
      </article>

      <aside class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Channel source of truth</p>
            <h2>Unified prompt context</h2>
          </div>
          <span class="badge success">All channels</span>
        </div>
        <div class="side-card">
          <p>Every response across Email, WhatsApp, SMS, Voice, Instagram, and Messenger should check this workspace knowledge base first, then fall back to general model knowledge only when needed.</p>
        </div>
        <div class="side-card">
          <p class="eyebrow">Included topics</p>
          <ul class="note-list">
            <li>Business services and positioning</li>
            <li>Pricing and package details</li>
            <li>Business hours and escalation rules</li>
            <li>Refund handling and support policies</li>
          </ul>
        </div>
      </aside>
    </section>
  `;
}

function renderKnowledgeCard(item) {
  return `
    <article class="panel-subcard knowledge-card">
      <div class="knowledge-card-head">
        <div>
          <strong>${item.title}</strong>
          <span>${item.type}</span>
        </div>
        <span class="badge ${item.status === 'Published' ? 'success' : 'warning'}">${item.status}</span>
      </div>
      <p>${item.summary}</p>
      <div class="knowledge-meta">
        <span>Updated ${item.updatedAt}</span>
        <button class="ghost-button compact" type="button">Open</button>
      </div>
    </article>
  `;
}

function renderBilling() {
  return `
    <section class="two-column">
      <article class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Billing</p>
            <h2>Plan and usage</h2>
          </div>
          <span class="badge accent">${billing.plan}</span>
        </div>
        <div class="billing-card">
          <div class="billing-summary">
            <strong>${billing.nextInvoice}</strong>
            <span>Primary payment rail: Paystack, with Monnify-compatible abstraction planned.</span>
          </div>
          <div class="usage-list">
            ${billing.monthlyUsage
              .map(
                ([label, percent]) => `
                  <div class="usage-item">
                    <span>${label}</span>
                    <strong>${percent}</strong>
                  </div>
                `
              )
              .join('')}
          </div>
        </div>
      </article>

      <aside class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Team management</p>
            <h2>Seats and permissions</h2>
          </div>
          <span class="badge success">18 active users</span>
        </div>
        <div class="team-list">
          ${team.map(renderTeamRow).join('')}
        </div>
      </aside>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="two-column">
      <article class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Workspace settings</p>
            <h2>Operational controls</h2>
          </div>
          <span class="badge neutral">Product ready</span>
        </div>
        <div class="settings-grid">
          <div class="side-card">
            <p class="eyebrow">Routing</p>
            <p>Route by language, channel, lead score, refund type, or account tier.</p>
          </div>
          <div class="side-card">
            <p class="eyebrow">Notifications</p>
            <p>Slack, email, and in-app alerting for high-priority conversations.</p>
          </div>
          <div class="side-card">
            <p class="eyebrow">Permissions</p>
            <p>Owner, finance, sales, support, and admin roles with scoped access.</p>
          </div>
          <div class="side-card">
            <p class="eyebrow">Branding</p>
            <p>Workspace identity, product colors, signature templates, and tone presets.</p>
          </div>
        </div>
      </article>

      <aside class="panel page-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Onboarding</p>
            <h2>Workspace setup</h2>
          </div>
          <span class="badge warning">In progress</span>
        </div>
        <div class="checklist">
          ${onboardingChecklist.map((item) => `<div class="check-item">${item}</div>`).join('')}
        </div>
      </aside>
    </section>
  `;
}

function renderAuth() {
  return `
    <section class="auth-shell">
      <article class="auth-panel hero-auth">
        <p class="eyebrow">Access layer</p>
        <h2>Sign in and workspace setup</h2>
        <p>Premium authentication surfaces with SSO, magic links, passkeys, and onboarding handoff.</p>
        <div class="auth-form">
          <label><span>Email address</span><input type="email" value="founder@northstarcommerce.com" /></label>
          <label><span>Password</span><input type="password" value="************" /></label>
          <button class="primary-button" type="button">Sign in</button>
        </div>
      </article>

      <div class="auth-side">
        ${authCards.map(renderAuthCard).join('')}
        ${renderSetupWizard('auth')}
      </div>
    </section>
  `;
}

function renderStatCard(item) {
  return `
    <article class="stat-card">
      <span class="eyebrow">${item.label}</span>
      <strong>${item.value}</strong>
      <div class="stat-delta ${item.tone}">${item.delta}</div>
    </article>
  `;
}

function renderAlert(item) {
  return `
    <div class="alert ${item.tone}">
      <strong>${item.title}</strong>
      <span>${item.detail}</span>
    </div>
  `;
}

function renderConversationPreview(item) {
  return `
    <div class="conversation-preview">
      <div class="avatar">${initials(item.name)}</div>
      <div>
        <div class="preview-head">
          <strong>${item.name}</strong>
          <span>${item.updatedAt}</span>
        </div>
        <p>${item.lastMessage}</p>
        <div class="preview-tags">
          <span class="badge neutral">${formatChannelLabel(item.channel)}</span>
          <span class="badge ${item.statusTone}">${item.status}</span>
        </div>
      </div>
    </div>
  `;
}

function renderConversationRow(item, active) {
    const channelKey = String(item.channel || item.source_provider || '').toLowerCase();
    const paused = isConversationPaused(item);
    return `
      <button class="conversation-row ${active ? 'active' : ''}" type="button" data-conversation="${item.id}">
        <div class="avatar channel-mark channel-${channelKey}">${getChannelMark(channelKey)}</div>
        <div class="conversation-copy">
          <div class="preview-head">
          <strong>${item.name}</strong>
          <span>${item.updatedAt}</span>
        </div>
        <p>${item.lastMessage}</p>
          <div class="preview-tags">
            <span class="badge neutral">${formatChannelLabel(item.channel)}</span>
            <span class="badge ${item.statusTone}">${item.status}</span>
            <span class="badge muted">${getReplyRouteLabel(item.channel)}</span>
            <span class="badge neutral">${item.tag}</span>
            ${paused ? '<span class="badge warning">AI paused</span>' : ''}
          </div>
        </div>
      </button>
    `;
  }

function renderSuggestionCard(text) {
  return `
    <div class="suggestion-card">
      <span class="badge success">AI</span>
      <p>${text}</p>
    </div>
  `;
}

function renderDealForecast(item) {
  return `
    <div class="forecast-row">
      <div>
        <strong>${item.stage}</strong>
        <span>${item.count} deals</span>
      </div>
      <div class="forecast-meter">
        <div class="forecast-fill ${item.tone}" style="width:${Math.min(item.count * 10 + 10, 100)}%"></div>
      </div>
      <strong>${item.value}</strong>
    </div>
  `;
}

function renderDealColumn(item) {
  return `
    <div class="kanban-column">
      <div class="kanban-head">
        <strong>${item.stage}</strong>
        <span>${item.count} deals</span>
      </div>
      <div class="kanban-body">
        <div class="kanban-card">
          <span class="badge ${item.tone}">${item.value}</span>
          <p>${item.stage} opportunities are progressing through the sales motion with AI handoff prompts enabled.</p>
          <div class="kanban-footer">
            <span>Forecast probability</span>
            <strong>${58 + item.count}%</strong>
          </div>
        </div>
        <div class="kanban-card muted">
          <p>Task reminders, activities, and notes remain attached to each opportunity.</p>
        </div>
      </div>
    </div>
  `;
}

function renderSequenceCard(item) {
  return `
    <article class="sequence-card">
      <div class="sequence-head">
        <div>
          <strong>${item.name}</strong>
          <span>${item.steps} steps</span>
        </div>
        <span class="badge ${item.status === 'Active' ? 'success' : 'warning'}">${item.status}</span>
      </div>
      <div class="metric-inline">
        <div><strong>${item.replies}</strong><span>Reply rate</span></div>
        <div><strong>${item.deliveries}</strong><span>Delivery rate</span></div>
        <div><strong>${item.nextRun}</strong><span>Next run</span></div>
      </div>
    </article>
  `;
}

function renderAutomationItem(item) {
  return `
    <article class="automation-card">
      <div class="automation-top">
        <span class="badge ${item.status === 'Live' ? 'success' : 'warning'}">${item.status}</span>
        <span class="badge neutral">${item.health}</span>
      </div>
      <strong>${item.trigger}</strong>
      <p>${item.action}</p>
      <div class="automation-footer">
        <span>${item.runs}</span>
        <strong>Event-driven</strong>
      </div>
    </article>
  `;
}

function renderIntegrationCard(item) {
  return `
    <article class="integration-card">
      <div class="integration-head">
        <div>
          <strong>${item.name}</strong>
          <span>${item.type}</span>
        </div>
        <span class="badge ${item.tone}">${item.status}</span>
      </div>
      <p>${item.detail}</p>
    </article>
  `;
}

function renderTeamRow(item) {
  return `
    <div class="team-row">
      <div>
        <strong>${item.name}</strong>
        <span>${item.role}</span>
      </div>
      <div>
        <strong>${item.access}</strong>
        <span>${item.status}</span>
      </div>
    </div>
  `;
}

function renderAuthCard(item) {
  return `
    <article class="auth-panel">
      <p class="eyebrow">${item.title}</p>
      <p>${item.body}</p>
    </article>
  `;
}

function renderSetupWizard(context = 'dashboard') {
    const isAuth = context === 'auth';
    const wrapperClass = isAuth ? 'auth-panel setup-wizard wizard-surface' : 'panel panel-wide setup-wizard wizard-surface';
    const instagramStatusLabel = botpressInstagramReady ? 'Connected' : 'Active';
    const instagramStatusTone = botpressInstagramReady ? 'success' : 'success';
    const instagramCtaLabel = botpressInstagramReady ? 'Connected in Botpress' : 'Connect with Facebook';
    return `
      <article class="${wrapperClass}">
        <div class="panel-head compact">
          <div>
            <p class="eyebrow">Founder setup wizard</p>
            <h3>Deploy your agent in minutes</h3>
          </div>
          <span class="badge accent">3 steps</span>
        </div>

        <div class="wizard-progress-strip">
          <div class="wizard-progress-card">
            <span class="eyebrow">Workspace</span>
            <strong>${workspace.name}</strong>
          </div>
          <div class="wizard-progress-card">
            <span class="eyebrow">Knowledge sources</span>
            <strong>${knowledgeBase.length}</strong>
          </div>
          <div class="wizard-progress-card">
            <span class="eyebrow">Connected channels</span>
            <strong>${integrations.filter((item) => ['connected', 'linked', 'ready'].includes(String(item.status || '').toLowerCase())).length}</strong>
          </div>
        </div>

        <div class="wizard-stage-grid">
          <section class="wizard-stage-card">
            <div class="wizard-step-head">
              <strong>1. Persona & branding</strong>
              <span>Shape the business identity and AI tone.</span>
            </div>
            <div class="wizard-field-grid">
              <label class="wizard-field">
                <span>Business name</span>
                <input type="text" value="${workspace.name || 'Northstar Commerce'}" />
              </label>
              <label class="wizard-field">
                <span>Bot name</span>
                <input type="text" value="Aura" />
              </label>
              <label class="wizard-field wizard-field-span">
                <span>Tone of voice</span>
                <select>
                  <option>Professional</option>
                  <option selected>Friendly</option>
                  <option>Luxury</option>
                  <option>Direct</option>
                  <option>Conversational</option>
                </select>
              </label>
            </div>
          </section>

          <section class="wizard-stage-card">
            <div class="wizard-step-head">
              <strong>2. Knowledge base</strong>
              <span>Upload training assets and capture your website.</span>
            </div>
            <label class="wizard-upload wizard-dropzone">
              <span class="wizard-upload-title">Drag and drop PDF or text files</span>
              <span>Attach product docs, FAQs, pricing sheets, and policy notes for this workspace.</span>
              <input type="file" accept=".pdf,.txt,.md,.doc,.docx" multiple />
            </label>
            <div class="wizard-url-row">
              <label class="wizard-field">
                <span>Website URL</span>
                <input type="url" value="https://northstarcommerce.com" />
              </label>
              <button class="ghost-button compact" type="button">Scrape site</button>
            </div>
          </section>

          <section class="wizard-stage-card wizard-stage-card-full">
            <div class="wizard-step-head">
              <strong>3. Channel activation</strong>
              <span>Turn on the channels you want the agent to manage.</span>
            </div>
            <div class="channel-activation-grid">
              <article class="channel-card active">
                <div class="channel-card-head">
                  <div>
                    <strong>Instagram</strong>
                    <span>Botpress connection</span>
                  </div>
                  <span class="badge ${instagramStatusTone}">${instagramStatusLabel}</span>
                </div>
                <p>Connect Instagram through Facebook login so Botpress can reply instantly.</p>
                <button class="ghost-button compact" type="button" data-action="connect-facebook">${instagramCtaLabel}</button>
              </article>
              <article class="channel-card active">
                <div class="channel-card-head">
                  <div>
                    <strong>WhatsApp</strong>
                    <span>Twilio Conversations</span>
                  </div>
                  <span class="badge success">Active</span>
                </div>
                <p>Use your Twilio sender or sandbox for live customer conversations.</p>
                <button class="ghost-button compact" type="button">Manage routing</button>
              </article>
              <article class="channel-card active">
                <div class="channel-card-head">
                  <div>
                    <strong>Email</strong>
                    <span>Gmail sync</span>
                  </div>
                  <span class="badge success">Active</span>
                </div>
                <p>Pull messages and replies from connected inboxes into one workspace.</p>
                <button class="ghost-button compact" type="button">Open settings</button>
              </article>
              <article class="channel-card">
                <div class="channel-card-head">
                  <div>
                    <strong>SMS</strong>
                    <span>Short message replies</span>
                  </div>
                  <span class="badge warning">Inactive</span>
                </div>
                <p>Route quick follow-ups from the main dashboard with the same AI context.</p>
                <button class="ghost-button compact" type="button">Enable SMS</button>
              </article>
              <article class="channel-card">
                <div class="channel-card-head">
                  <div>
                    <strong>Voice</strong>
                    <span>Receptionist calls</span>
                  </div>
                  <span class="badge warning">Inactive</span>
                </div>
                <p>Activate the voice receptionist for inbound calls and missed-call follow-up.</p>
                <button class="ghost-button compact" type="button">Configure voice</button>
              </article>
              <article class="channel-card">
                <div class="channel-card-head">
                  <div>
                    <strong>Messenger</strong>
                    <span>Twilio Conversations</span>
                  </div>
                  <span class="badge success">Ready</span>
                </div>
                <p>Keep Messenger aligned with the same workspace tone and knowledge base.</p>
                <button class="ghost-button compact" type="button">Connect Messenger</button>
              </article>
            </div>
          </section>
        </div>

        <div class="wizard-footer">
          <div class="mini-status muted">All channels read from the same workspace knowledge base.</div>
          <button class="primary-button" type="button">Launch workspace</button>
        </div>
      </article>
    `;
  }

function renderMiniBars(values, color) {
  return `
    <div class="mini-bars" style="--bar-color:${color}">
      ${values.map((value) => `<span style="height:${value}%"></span>`).join('')}
    </div>
  `;
}

function renderChannelVolumeBar(item) {
  return `
    <div class="channel-volume-row">
      <div class="channel-volume-meta">
        <strong>${item.channel}</strong>
        <span>${item.label}</span>
      </div>
      <div class="channel-volume-track" aria-hidden="true">
        <div class="channel-volume-fill" style="width:${item.volume}%"></div>
      </div>
    </div>
  `;
}

function renderSparkline(values, color) {
  const width = 240;
  const height = 84;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * (height - 10) - 5;
      return `${x},${y}`;
    })
    .join(' ');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline" aria-hidden="true">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

function bindEvents() {
  app.querySelectorAll('[data-screen]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeScreen = button.dataset.screen;
      state.modalOpen = false;
      render();
    });
  });

  app.querySelectorAll('[data-conversation]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedConversationId = button.dataset.conversation;
      render();
    });
  });

  app.querySelectorAll('[data-contact]').forEach((row) => {
    row.addEventListener('click', () => {
      state.selectedContactName = row.dataset.contact;
      render();
    });
  });

  app.querySelectorAll('[data-lead]').forEach((row) => {
    row.addEventListener('click', () => {
      state.selectedLeadName = row.dataset.lead;
      render();
    });
  });

  app.querySelectorAll('[data-inbox-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeInboxFilter = normalizeInboxFilter(button.dataset.inboxFilter);
      render();
    });
  });

  app.querySelectorAll('[data-action="open-modal"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modalOpen = true;
      render();
      toast('Workflow builder opened with realistic sample inputs.');
    });
  });

  app.querySelectorAll('[data-action="primary"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.activeScreen === 'automations' || state.activeScreen === 'outreach') {
        state.modalOpen = true;
        render();
        return;
      }

      if (state.activeScreen === 'inbox') {
        toast('Conversation assigned to the active owner.');
        return;
      }

      state.modalOpen = true;
      render();
    });
  });

  app.querySelectorAll('[data-action="refresh"]').forEach((button) => {
    button.addEventListener('click', () => toast('AI summary refreshed from seeded activity.'));
  });

  app.querySelectorAll('[data-action="open-launch-route"]').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.dataset.route || '/healthz';
      window.open(route, '_blank', 'noopener,noreferrer');
    });
  });

  app.querySelectorAll('[data-lead-search]').forEach((input) => {
    input.addEventListener('input', () => {
      state.leadQuery = input.value;
      const filtered = getFilteredLeads();
      if (!filtered.some((item) => item.name === state.selectedLeadName) && filtered[0]) {
        state.selectedLeadName = filtered[0].name;
      }
      render();
    });
  });

  app.querySelectorAll('[data-action="export-leads-csv"]').forEach((button) => {
    button.addEventListener('click', () => {
      const rows = getFilteredLeads();
      const csv = buildLeadsCsv(rows);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`auraflow-leads-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
      toast(`Exported ${rows.length} lead${rows.length === 1 ? '' : 's'} to CSV.`);
    });
  });

  app.querySelectorAll('[data-action="connect-facebook"]').forEach((button) => {
    button.addEventListener('click', () => {
      toast('Facebook OAuth handoff is ready for this workspace.');
    });
  });

  app.querySelectorAll('[data-action="toggle-hitl"]').forEach((button) => {
    button.addEventListener('click', () => {
      const conversationId = button.dataset.conversation;
      if (!conversationId) return;

      const currentlyPaused = state.pausedConversationIds.has(conversationId);
      const nextPaused = !currentlyPaused;
      if (currentlyPaused) {
        state.pausedConversationIds.delete(conversationId);
        toast('AI resumed for this conversation.');
      } else {
        state.pausedConversationIds.add(conversationId);
        toast('AI paused. Human takeover enabled.');
      }

      fetch(`/.netlify/functions/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          is_ai_paused: nextPaused,
          updated_at: new Date().toISOString()
        })
      }).catch(() => null);

      render();
    });
  });

  app.querySelectorAll('[data-action="save-automation"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modalOpen = false;
      render();
      toast('Automation draft saved to workspace memory.');
    });
  });

  app.querySelectorAll('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event.target === button) {
        state.modalOpen = false;
        render();
        toast('Modal closed.');
      }
    });
  });
}

function toast(message) {
  const stack = app.querySelector('.toast-stack');
  if (!stack) return;

  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  stack.appendChild(node);

  requestAnimationFrame(() => node.classList.add('show'));
  window.setTimeout(() => {
    node.classList.remove('show');
    window.setTimeout(() => node.remove(), 220);
  }, 2800);
}

function primaryActionLabel() {
  if (state.activeScreen === 'automations') return 'Create automation';
  if (state.activeScreen === 'outreach') return 'Build sequence';
  if (state.activeScreen === 'inbox') return 'Assign conversation';
  return 'Open command modal';
}

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('');
}
