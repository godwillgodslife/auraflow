'use client';

import { useEffect, useState } from 'react';
import {
  alerts,
  analytics,
  authCards,
  automations,
  billing,
  contacts,
  conversations,
  deals,
  integrations,
  navSections,
  onboardingChecklist,
  refunds,
  sequences,
  stats,
  team,
  workspace
} from '../src/data.js';

const meta = {
  dashboard: ['Dashboard', 'Command center for revenue, support, and automation.'],
  inbox: ['Unified Inbox', 'One workspace for every customer conversation.'],
  contacts: ['Customers', 'Unified customer profiles with history and ownership.'],
  pipeline: ['Pipeline', 'Monitor deals, stages, and forecasted revenue.'],
  refunds: ['Refunds', 'Track approvals, resolution steps, and save-back workflows.'],
  outreach: ['Outreach', 'Sequences for lead nurture, reactivation, and conversion.'],
  analytics: ['Analytics', 'Revenue, response time, and campaign performance in one view.'],
  automations: ['Automations', 'Trigger-based workflows and routing logic.'],
  integrations: ['Integrations', 'Channel sync, API status, and token health.'],
  billing: ['Billing', 'Plans, usage, invoices, and payment provider posture.'],
  settings: ['Settings', 'Workspace, users, roles, and operational controls.'],
  auth: ['Authentication', 'Login, onboarding, and workspace setup surfaces.']
};

export default function Page() {
  const [screen, setScreen] = useState('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [conversationId, setConversationId] = useState(conversations[0].id);
  const [contactName, setContactName] = useState(contacts[0].name);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setNavOpen(false);
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedConversation = conversations.find((item) => item.id === conversationId) || conversations[0];
  const selectedContact = contacts.find((item) => item.name === contactName) || contacts[0];
  const notify = (message) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((items) => [...items, { id, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 2400);
  };

  const jump = (next) => {
    setScreen(next);
    setNavOpen(false);
    setModalOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Primary">
        <div className="sidebar-mobile-head">
          <div className="brand-block">
            <div className="brand-mark">AF</div>
            <div>
              <div className="brand-name">AuraFlow</div>
              <div className="brand-subtitle">Omnichannel Revenue OS</div>
            </div>
          </div>
          <button className="icon-button mobile-close" type="button" onClick={() => setNavOpen(false)}>Close</button>
        </div>
        <button className="workspace-switcher" type="button" onClick={() => notify('Workspace switcher placeholder opened.')}>
          <div>
            <div className="workspace-label">Workspace</div>
            <strong>{workspace.name}</strong>
          </div>
          <span className="workspace-pill">{workspace.tier}</span>
        </button>
        <nav className="nav-groups">
          {navSections.map((group) => (
            <section className="nav-group" key={group.label}>
              <h2>{group.label}</h2>
              <div className="nav-list">
                {group.items.map((item) => (
                  <button key={item.id} className={`nav-item ${screen === item.id ? 'active' : ''}`} type="button" onClick={() => jump(item.id)}>
                    <span className="nav-item-icon">{item.hint.slice(0, 2).toUpperCase()}</span>
                    <span className="nav-item-copy">
                      <span className="nav-item-label">{item.label}</span>
                      <span className="nav-item-hint">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="mini-status success">10 channels synced</div>
          <div className="mini-status muted">Last webhook: 2m ago</div>
        </div>
      </aside>

      {navOpen ? <button className="backdrop" aria-label="Close navigation" type="button" onClick={() => setNavOpen(false)} /> : null}

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-heading">
            <button className="icon-button mobile-menu" type="button" onClick={() => setNavOpen(true)}>Menu</button>
            <div>
              <p className="eyebrow">Phase 1 UI foundation</p>
              <h1>{meta[screen][0]}</h1>
              <p className="lead">{meta[screen][1]}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <label className="search-field">
              <span>Search</span>
              <input type="search" value="Maya Chen, refund, automation" readOnly />
            </label>
            <button className="ghost-button" type="button" onClick={() => notify('AI summary refreshed from seeded activity.')}>Refresh AI summary</button>
            <button className="primary-button" type="button" onClick={() => setModalOpen(true)}>{primaryActionLabel(screen)}</button>
          </div>
        </header>

        <main className="page-shell">{renderScreen(screen, selectedConversation, selectedContact, setConversationId, setContactName, notify)}</main>
      </div>

      {modalOpen ? (
        <div className="modal-backdrop open" role="presentation" onClick={(event) => event.target === event.currentTarget && setModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Create automation">
            <div className="modal-head">
              <div><p className="eyebrow">Create workflow</p><h3>New automation</h3></div>
              <button className="icon-button" type="button" onClick={() => setModalOpen(false)}>Close</button>
            </div>
            <div className="modal-grid">
              <label><span>Trigger</span><input type="text" defaultValue="No reply after 24 hours" /></label>
              <label><span>Action</span><input type="text" defaultValue="Send follow-up + assign owner" /></label>
              <label><span>Channel</span><input type="text" defaultValue="WhatsApp + Email" /></label>
              <label><span>Owner</span><input type="text" defaultValue="Growth Team" /></label>
            </div>
            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="primary-button" type="button" onClick={() => { setModalOpen(false); notify('Automation draft saved to workspace memory.'); }}>Save automation</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((item) => <div className="toast show" key={item.id}>{item.message}</div>)}
      </div>
    </div>
  );
}

function renderScreen(screen, selectedConversation, selectedContact, setConversationId, setContactName, notify) {
  if (screen === 'dashboard') {
    return (
      <>
        <section className="grid stats-grid">
          {stats.map((item) => (
            <article className="stat-card" key={item.label}>
              <span className="eyebrow">{item.label}</span>
              <strong>{item.value}</strong>
              <div className={`stat-delta ${item.tone}`}>{item.delta}</div>
            </article>
          ))}
        </section>
        <section className="dashboard-grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <div><p className="eyebrow">Command center</p><h2>Priority queue</h2></div>
              <div className="tabs"><button className="tab active" type="button">Today</button><button className="tab" type="button">7 days</button><button className="tab" type="button">30 days</button></div>
            </div>
            <div className="alert-stack">
              {alerts.map((item) => <div className={`alert ${item.tone}`} key={item.title}><strong>{item.title}</strong><span>{item.detail}</span></div>)}
            </div>
            <div className="focus-grid">
              <div className="focus-card"><div className="focus-top"><span className="badge success">SLA on track</span><strong>Response automation</strong></div><p>84% of new leads receive an AI-assisted reply within 5 minutes across WhatsApp and email.</p>{renderMiniBars([82, 86, 88, 90, 92, 93, 94, 94, 95, 96], 'var(--accent)')}</div>
              <div className="focus-card"><div className="focus-top"><span className="badge warning">Revenue risk</span><strong>Refunds requiring action</strong></div><p>3 requests are pending approval. Two can be auto-resolved if invoice mismatch is verified.</p>{renderMiniBars([12, 10, 8, 9, 7, 6, 5, 4, 4, 3], 'var(--warning)')}</div>
            </div>
          </article>
          <article className="panel"><div className="panel-head"><div><p className="eyebrow">Recent activity</p><h2>Inbox snapshot</h2></div><span className="badge accent">428 open</span></div><div className="conversation-preview-list">{conversations.slice(0, 3).map(renderConversationPreview)}</div></article>
          <article className="panel"><div className="panel-head"><div><p className="eyebrow">Sales forecast</p><h2>Pipeline velocity</h2></div><span className="badge neutral">Projected $603k</span></div><div className="stacked-bars">{deals.map(renderDealForecast)}</div></article>
          <article className="panel"><div className="panel-head"><div><p className="eyebrow">Automation health</p><h2>Live workflows</h2></div><button className="ghost-button compact" type="button" onClick={() => notify('Workflow builder opened with realistic sample inputs.')}>New rule</button></div><div className="automation-list">{automations.map(renderAutomationItem)}</div></article>
        </section>
      </>
    );
  }

  if (screen === 'inbox') {
    const messages = [
      { from: 'Maya Chen', body: 'We are evaluating the team plan, but I need to know the automation limits before we proceed.', time: '9:12 AM', side: 'customer' },
      { from: 'Ada', body: 'Thanks Maya. The current Growth Suite includes 120 active automations, unlimited inbox routing, and 25 seats.', time: '9:14 AM', side: 'agent' },
      { from: 'Maya Chen', body: 'That helps. Do you also support shared inbox notes and approval flows for refunds?', time: '9:16 AM', side: 'customer' }
    ];
    return (
      <section className="inbox-layout">
        <article className="panel inbox-list-panel">
          <div className="panel-head"><div><p className="eyebrow">Unified inbox</p><h2>Queue</h2></div><span className="badge danger">12 urgent</span></div>
          <div className="filter-row"><button className="chip active" type="button">All</button><button className="chip" type="button">Unread</button><button className="chip" type="button">WhatsApp</button><button className="chip" type="button">Email</button><button className="chip" type="button">Social</button></div>
          <div className="conversation-list">
            {conversations.map((item) => (
              <button className={`conversation-row ${item.id === selectedConversation.id ? 'active' : ''}`} key={item.id} type="button" onClick={() => setConversationId(item.id)}>
                <div className="avatar">{initials(item.name)}</div>
                <div className="conversation-copy"><div className="preview-head"><strong>{item.name}</strong><span>{item.updatedAt}</span></div><p>{item.lastMessage}</p><div className="preview-tags"><span className="badge neutral">{item.channel}</span><span className={`badge ${item.statusTone}`}>{item.status}</span><span className="badge neutral">{item.tag}</span></div></div>
              </button>
            ))}
          </div>
        </article>
        <article className="panel inbox-detail-panel">
          <div className="panel-head"><div><p className="eyebrow">Conversation detail</p><h2>{selectedConversation.name}</h2></div><div className="status-stack"><span className={`badge ${selectedConversation.statusTone}`}>{selectedConversation.status}</span><span className="badge neutral">{selectedConversation.channel}</span></div></div>
          <div className="detail-meta"><div><strong>{selectedConversation.company}</strong><span>{selectedConversation.owner} assigned</span></div><div><strong>{selectedConversation.value}</strong><span>Expected value</span></div><div><strong>{selectedConversation.sentiment}</strong><span>Conversation sentiment</span></div></div>
          <div className="thread">{messages.map((message) => <div className={`message ${message.side}`} key={`${message.time}-${message.from}`}><div className="message-head"><strong>{message.from}</strong><span>{message.time}</span></div><p>{message.body}</p></div>)}</div>
          <div className="composer"><div className="composer-toolbar"><span className="badge success">AI drafting enabled</span><span className="badge neutral">Internal notes visible</span></div><div className="composer-box"><textarea rows="4" defaultValue="Thanks Maya. I can confirm the team plan includes 120 automations, shared inbox notes, and refund approval workflows. Would you like a 15-minute walkthrough?" /><div className="composer-actions"><button className="ghost-button" type="button">Save note</button><button className="primary-button" type="button">Send reply</button></div></div></div>
        </article>
        <aside className="panel inbox-side-panel">
          <div className="panel-head"><div><p className="eyebrow">AI assistant</p><h2>Suggestions</h2></div><span className="badge accent">3 ready</span></div>
          <div className="suggestion-stack">{conversationThread.aiSuggestions.map((text) => <div className="suggestion-card" key={text}><span className="badge success">AI</span><p>{text}</p></div>)}</div>
          <div className="side-card"><p className="eyebrow">Internal notes</p><ul className="note-list">{conversationThread.internalNotes.map((note) => <li key={note}>{note}</li>)}</ul></div>
          <div className="side-card"><p className="eyebrow">Customer context</p><div className="profile-snippet"><div className="avatar">MC</div><div><strong>Maya Chen</strong><span>Marketing Director, Brightlane Studio</span></div></div><div className="context-grid"><div><span>Purchase history</span><strong>$18,420</strong></div><div><span>Open tickets</span><strong>2</strong></div><div><span>Lead source</span><strong>WhatsApp</strong></div><div><span>Last order</span><strong>Jan 18</strong></div></div></div>
        </aside>
      </section>
    );
  }

  if (screen === 'contacts') {
    return (
      <section className="panel page-panel">
        <div className="panel-head"><div><p className="eyebrow">Customer management</p><h2>Profiles and segments</h2></div><div className="panel-actions"><input className="inline-search" value="Search customers, tags, owners" readOnly /><button className="ghost-button" type="button">Export CSV</button></div></div>
        <div className="two-column">
          <div className="table-card"><table><thead><tr><th>Customer</th><th>Stage</th><th>Owner</th><th>Last seen</th><th>Lifetime value</th></tr></thead><tbody>{contacts.map((item) => <tr className={item.name === selectedContact.name ? 'selected' : ''} key={item.name} onClick={() => setContactName(item.name)}><td><strong>{item.name}</strong><span>{item.company}</span></td><td><span className="badge neutral">{item.stage}</span></td><td>{item.owner}</td><td>{item.lastSeen}</td><td>{item.lifetime}</td></tr>)}</tbody></table></div>
          <aside className="side-card profile-card"><p className="eyebrow">Selected profile</p><div className="profile-snippet"><div className="avatar">{initials(selectedContact.name)}</div><div><strong>{selectedContact.name}</strong><span>{selectedContact.company}</span></div></div><div className="profile-metrics"><div><span>Lifecycle stage</span><strong>{selectedContact.stage}</strong></div><div><span>Owner</span><strong>{selectedContact.owner}</strong></div><div><span>Lifetime value</span><strong>{selectedContact.lifetime}</strong></div><div><span>Tags</span><strong>{selectedContact.tags.join(' · ')}</strong></div></div><div className="tag-cloud">{selectedContact.tags.map((tag) => <span className="badge accent" key={tag}>{tag}</span>)}</div><div className="timeline"><div className="timeline-item"><strong>Purchase completed</strong><span>Invoice #4821 recorded 19 days ago</span></div><div className="timeline-item"><strong>Support escalation</strong><span>Refund concern tagged and routed to finance</span></div><div className="timeline-item"><strong>Next follow-up</strong><span>Automated sequence due tomorrow at 11:00 AM</span></div></div></aside>
        </div>
      </section>
    );
  }

  if (screen === 'pipeline') return <section className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Sales pipeline</p><h2>Deals and opportunities</h2></div><div className="tabs"><button className="tab active" type="button">Board</button><button className="tab" type="button">Table</button><button className="tab" type="button">Forecast</button></div></div><div className="kanban">{deals.map(renderDealColumn)}</div></section>;
  if (screen === 'refunds') return <section className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Refund handling</p><h2>Review queue</h2></div><span className="badge warning">3 open approvals</span></div><div className="table-card"><table><thead><tr><th>Request</th><th>Customer</th><th>Amount</th><th>Reason</th><th>Status</th><th>Owner</th><th>Updated</th></tr></thead><tbody>{refunds.map((item) => <tr key={item.requestId}><td><strong>{item.requestId}</strong></td><td>{item.customer}</td><td>{item.amount}</td><td>{item.reason}</td><td><span className={`badge ${item.statusTone}`}>{item.status}</span></td><td>{item.owner}</td><td>{item.updatedAt}</td></tr>)}</tbody></table></div><div className="workflow-rail"><div className="workflow-step active">Request received</div><div className="workflow-step active">Identity and order verification</div><div className="workflow-step">Finance approval</div><div className="workflow-step">Customer notified</div><div className="workflow-step">Closed</div></div></section>;
  if (screen === 'outreach') return <section className="two-column"><article className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Sequences</p><h2>Outreach and follow-up automation</h2></div><button className="ghost-button" type="button">New sequence</button></div><div className="sequence-list">{sequences.map(renderSequenceCard)}</div></article><aside className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Campaign builder</p><h2>Sequence flow</h2></div><span className="badge accent">Templates ready</span></div><div className="builder-steps"><div className="builder-step">1. Trigger: new lead enters from WhatsApp</div><div className="builder-step">2. Wait 2 hours, then send AI-crafted intro</div><div className="builder-step">3. If opened but not replied, assign task to sales rep</div><div className="builder-step">4. If no reply after 48 hours, escalate to owner</div></div><div className="side-card"><p className="eyebrow">Performance</p><div className="metric-inline"><div><strong>12.8%</strong><span>Reply rate</span></div><div><strong>96.4%</strong><span>Delivery rate</span></div><div><strong>4.6x</strong><span>ROI multiplier</span></div></div></div></aside></section>;
  if (screen === 'analytics') return <section className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Analytics</p><h2>Revenue, response, and conversion insights</h2></div><div className="tabs"><button className="tab active" type="button">This month</button><button className="tab" type="button">Quarter</button><button className="tab" type="button">Year</button></div></div><div className="stats-grid compact"><div className="mini-chart-card"><span className="eyebrow">Revenue trend</span><strong>$124.8k</strong>{renderSparkline(analytics.revenueSpark, 'var(--accent)')}</div><div className="mini-chart-card"><span className="eyebrow">First response</span><strong>3m 12s</strong>{renderSparkline(analytics.responseSpark, 'var(--warning)')}</div><div className="mini-chart-card"><span className="eyebrow">Conversion rate</span><strong>21%</strong>{renderSparkline(analytics.conversionSpark, 'var(--success)')}</div></div><div className="analytics-grid"><div className="panel-subcard"><p className="eyebrow">Channel performance</p><div className="metric-rows"><div><span>WhatsApp</span><strong>62% reply rate</strong></div><div><span>Email</span><strong>41% reply rate</strong></div><div><span>Instagram</span><strong>27% reply rate</strong></div><div><span>Facebook</span><strong>19% reply rate</strong></div></div></div><div className="panel-subcard"><p className="eyebrow">Agent productivity</p><div className="metric-rows"><div><span>Ada</span><strong>93 conversations handled</strong></div><div><span>Sade</span><strong>17 refund cases closed</strong></div><div><span>Olu</span><strong>14 deals advanced</strong></div><div><span>Lina</span><strong>11 automations updated</strong></div></div></div></div></section>;
  if (screen === 'automations') return <section className="two-column"><article className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Workflow engine</p><h2>Automation catalog</h2></div><button className="primary-button" type="button" onClick={() => setModalOpen(true)}>Create automation</button></div><div className="automation-list">{automations.map(renderAutomationItem)}</div></article><aside className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Builder preview</p><h2>Rule anatomy</h2></div><span className="badge success">Version 1.0</span></div><div className="builder-steps"><div className="builder-step">Trigger: conversation marked as refund risk</div><div className="builder-step">Condition: invoice value above $250</div><div className="builder-step">Action: create finance task and notify Slack</div><div className="builder-step">Fallback: send customer status update after approval</div></div><div className="side-card"><p className="eyebrow">Execution log</p><ul className="note-list"><li>214 runs today</li><li>99.2% success rate over the last 7 days</li><li>2 rules require manual review before activation</li></ul></div></aside></section>;
  if (screen === 'integrations') return <section className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Integrations and sync</p><h2>Connected services</h2></div><span className="badge neutral">Nango as the integration layer</span></div><div className="integration-grid">{integrations.map(renderIntegrationCard)}</div></section>;
  if (screen === 'billing') return <section className="two-column"><article className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Billing</p><h2>Plan and usage</h2></div><span className="badge accent">{billing.plan}</span></div><div className="billing-card"><div className="billing-summary"><strong>{billing.nextInvoice}</strong><span>Primary payment rail: Paystack, with Monnify-compatible abstraction planned.</span></div><div className="usage-list">{billing.monthlyUsage.map(([label, percent]) => <div className="usage-item" key={label}><span>{label}</span><strong>{percent}</strong></div>)}</div></div></article><aside className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Team management</p><h2>Seats and permissions</h2></div><span className="badge success">18 active users</span></div><div className="team-list">{team.map(renderTeamRow)}</div></aside></section>;
  if (screen === 'settings') return <section className="two-column"><article className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Workspace settings</p><h2>Operational controls</h2></div><span className="badge neutral">Product ready</span></div><div className="settings-grid"><div className="side-card"><p className="eyebrow">Routing</p><p>Route by language, channel, lead score, refund type, or account tier.</p></div><div className="side-card"><p className="eyebrow">Notifications</p><p>Slack, email, and in-app alerting for high-priority conversations.</p></div><div className="side-card"><p className="eyebrow">Permissions</p><p>Owner, finance, sales, support, and admin roles with scoped access.</p></div><div className="side-card"><p className="eyebrow">Branding</p><p>Workspace identity, product colors, signature templates, and tone presets.</p></div></div></article><aside className="panel page-panel"><div className="panel-head"><div><p className="eyebrow">Onboarding</p><h2>Workspace setup</h2></div><span className="badge warning">In progress</span></div><div className="checklist">{onboardingChecklist.map((item) => <div className="check-item" key={item}>{item}</div>)}</div></aside></section>;
  if (screen === 'auth') return <section className="auth-shell"><article className="auth-panel hero-auth"><p className="eyebrow">Access layer</p><h2>Sign in and workspace setup</h2><p>Premium authentication surfaces with SSO, magic links, passkeys, and onboarding handoff.</p><div className="auth-form"><label><span>Email address</span><input type="email" defaultValue="founder@northstarcommerce.com" /></label><label><span>Password</span><input type="password" defaultValue="••••••••••••" /></label><button className="primary-button" type="button">Sign in</button></div></article><div className="auth-side">{authCards.map(renderAuthCard)}</div></section>;
  return null;
}

function renderConversationPreview(item) {
  return <div className="conversation-preview" key={item.id}><div className="avatar">{initials(item.name)}</div><div><div className="preview-head"><strong>{item.name}</strong><span>{item.updatedAt}</span></div><p>{item.lastMessage}</p><div className="preview-tags"><span className="badge neutral">{item.channel}</span><span className={`badge ${item.statusTone}`}>{item.status}</span></div></div></div>;
}

function renderDealForecast(item) {
  return <div className="forecast-row" key={item.stage}><div><strong>{item.stage}</strong><span>{item.count} deals</span></div><div className="forecast-meter"><div className={`forecast-fill ${item.tone}`} style={{ width: `${Math.min(item.count * 10 + 10, 100)}%` }} /></div><strong>{item.value}</strong></div>;
}

function renderSequenceCard(item) {
  return <article className="sequence-card" key={item.name}><div className="sequence-head"><div><strong>{item.name}</strong><span>{item.steps} steps</span></div><span className={`badge ${item.status === 'Active' ? 'success' : 'warning'}`}>{item.status}</span></div><div className="metric-inline"><div><strong>{item.replies}</strong><span>Reply rate</span></div><div><strong>{item.deliveries}</strong><span>Delivery rate</span></div><div><strong>{item.nextRun}</strong><span>Next run</span></div></div></article>;
}

function renderAutomationItem(item) {
  return <article className="automation-card" key={item.trigger}><div className="automation-top"><span className={`badge ${item.status === 'Live' ? 'success' : 'warning'}`}>{item.status}</span><span className="badge neutral">{item.health}</span></div><strong>{item.trigger}</strong><p>{item.action}</p><div className="automation-footer"><span>{item.runs}</span><strong>Event-driven</strong></div></article>;
}

function renderIntegrationCard(item) {
  return <article className="integration-card" key={item.name}><div className="integration-head"><div><strong>{item.name}</strong><span>{item.type}</span></div><span className={`badge ${item.tone}`}>{item.status}</span></div><p>{item.detail}</p></article>;
}

function renderTeamRow(item) {
  return <div className="team-row" key={item.name}><div><strong>{item.name}</strong><span>{item.role}</span></div><div><strong>{item.access}</strong><span>{item.status}</span></div></div>;
}

function renderAuthCard(item) {
  return <article className="auth-panel" key={item.title}><p className="eyebrow">{item.title}</p><p>{item.body}</p></article>;
}

function renderSparkline(values, color) {
  const width = 240;
  const height = 84;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => `${index * step},${height - ((value - min) / range) * (height - 10) - 5}`).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} className="sparkline" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function renderMiniBars(values, color) {
  return <div className="mini-bars" style={{ '--bar-color': color }}>{values.map((value, index) => <span key={`${value}-${index}`} style={{ height: `${value}%` }} />)}</div>;
}

function primaryActionLabel(screen) {
  if (screen === 'automations') return 'Create automation';
  if (screen === 'outreach') return 'Build sequence';
  if (screen === 'inbox') return 'Assign conversation';
  return 'Open command modal';
}

function initials(name) {
  return name.split(' ').map((part) => part[0]).join('');
}
