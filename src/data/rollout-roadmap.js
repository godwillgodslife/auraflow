import { getRoadmapChangelog, getRoadmapStatusMap, updateRoadmapItemStatus } from '../state/roadmap-state.js';

const ROADMAP = [
  { id: 'provider-gmail-live-send', phase: 'Provider rollout', title: 'Ship Gmail live send', status: 'done', note: 'Outbound Gmail uses the provider adapter.' },
  { id: 'provider-whatsapp-live-send', phase: 'Provider rollout', title: 'Ship WhatsApp live send', status: 'done', note: 'Meta transport handles WhatsApp outbound delivery.' },
  { id: 'provider-server-backed-relay-tests', phase: 'Provider rollout', title: 'Server-backed relay tests', status: 'done', note: 'Test callbacks now run through the canonical ingest path.' },
  { id: 'provider-persist-relay-setup', phase: 'Provider rollout', title: 'Persist relay setup on channel records', status: 'done', note: 'Relay state survives reloads and restarts.' },
  { id: 'provider-expose-relay-summary', phase: 'Provider rollout', title: 'Expose relay summary in Deploy', status: 'done', note: 'Gmail and WhatsApp relay state is visible at a glance.' },
  { id: 'provider-health-sweep-jobs', phase: 'Provider rollout', title: 'Add provider health sweep jobs', status: 'done', note: 'Scheduled health checks keep readiness current.' },
  { id: 'provider-surface-webhook-verification', phase: 'Provider rollout', title: 'Surface webhook verification details', status: 'done', note: 'Exact callback and token steps appear in Deploy.' },
  { id: 'provider-wire-duplicate-replay-suppression', phase: 'Provider rollout', title: 'Wire duplicate replay suppression', status: 'done', note: 'Webhook duplicates are rejected by a replay ledger.' },
  { id: 'provider-add-delivery-receipt-state-tracking', phase: 'Provider rollout', title: 'Add delivery receipt state tracking', status: 'done', note: 'Outbound messages show sent, delivered, read, and failed.' },
  { id: 'provider-add-callback-diagnostics', phase: 'Provider rollout', title: 'Add provider callback diagnostics', status: 'in_progress', note: 'Replay and test history still need a dedicated audit view.' },
  { id: 'inbox-expand-realtime-refresh', phase: 'Inbox operations', title: 'Expand real-time inbox refresh', status: 'done', note: 'Workspace events refresh the preview automatically.' },
  { id: 'inbox-expose-thread-reply-queue', phase: 'Inbox operations', title: 'Expose thread-level reply/queue actions', status: 'done', note: 'Operators can send or queue replies from the inbox.' },
  { id: 'inbox-show-receipt-history', phase: 'Inbox operations', title: 'Show receipt history in message threads', status: 'done', note: 'Outbound badges now reflect delivery receipts.' },
  { id: 'inbox-add-assignment-target-selection', phase: 'Inbox operations', title: 'Add assignment target selection', status: 'in_progress', note: 'Workflow queue still uses a simple assignee field.' },
  { id: 'inbox-add-escalation-note-capture', phase: 'Inbox operations', title: 'Add escalation note capture', status: 'done', note: 'Escalation notes already persist in the queue.' },
  { id: 'inbox-add-contact-merge-history-drilldown', phase: 'Inbox operations', title: 'Add contact merge history drilldown', status: 'done', note: 'Merge events are visible in the contact panel.' },
  { id: 'inbox-add-contact-tag-chip-editor', phase: 'Inbox operations', title: 'Add contact tag chip editor', status: 'done', note: 'Tags can be applied and removed inline.' },
  { id: 'inbox-add-contact-tag-suggestion-picker', phase: 'Inbox operations', title: 'Add contact tag suggestion picker', status: 'done', note: 'Workspace tags are surfaced as suggestions.' },
  { id: 'inbox-add-activity-timeline', phase: 'Inbox operations', title: 'Add activity timeline for each thread', status: 'in_progress', note: 'Activity log exists, but needs stronger timeline affordances.' },
  { id: 'inbox-add-message-level-context-actions', phase: 'Inbox operations', title: 'Add message-level context actions', status: 'planned', note: 'Pin, copy, or reference messages from the thread.' },
  { id: 'ai-expose-structured-recommendations', phase: 'AI workflow', title: 'Expose structured AI recommendation cards', status: 'done', note: 'Assignments, follow-ups, and handoff reasons are visible.' },
  { id: 'ai-turn-recommendations-into-jobs', phase: 'AI workflow', title: 'Turn recommendations into workflow jobs', status: 'done', note: 'AI actions create queue items and activity events.' },
  { id: 'ai-add-handoff-audit-trail', phase: 'AI workflow', title: 'Add AI handoff audit trail', status: 'done', note: 'AI actions now leave event history in the workspace.' },
  { id: 'ai-add-follow-up-timing-chooser', phase: 'AI workflow', title: 'Add follow-up timing chooser', status: 'in_progress', note: 'Timing is inferred, but still needs a direct operator picker.' },
  { id: 'ai-add-assignee-suggestion-ranking', phase: 'AI workflow', title: 'Add assignee suggestion ranking', status: 'planned', note: 'Suggest owner by issue type, channel, and history.' },
  { id: 'ai-add-escalation-confidence-score', phase: 'AI workflow', title: 'Add escalation confidence score', status: 'planned', note: 'Show why the agent is recommending handoff.' },
  { id: 'ai-add-summary-to-note-action', phase: 'AI workflow', title: 'Add AI summary-to-note action', status: 'planned', note: 'Save summaries straight into internal notes.' },
  { id: 'ai-add-draft-to-reply-action', phase: 'AI workflow', title: 'Add AI draft-to-reply action', status: 'planned', note: 'Push drafts directly into the reply composer.' },
  { id: 'ai-add-workflow-templating', phase: 'AI workflow', title: 'Add AI workflow templating', status: 'planned', note: 'Create repeatable playbooks from successful threads.' },
  { id: 'ai-add-human-review-queue', phase: 'AI workflow', title: 'Add human-in-the-loop review queue', status: 'planned', note: 'Queue risky recommendations for operator approval.' },
  { id: 'reliability-persist-job-queue-to-disk', phase: 'Reliability', title: 'Persist job queue to disk', status: 'done', note: 'Workflow jobs survive restarts.' },
  { id: 'reliability-add-replay-worker-for-retries', phase: 'Reliability', title: 'Add replay worker for retries', status: 'done', note: 'Failed webhook and workflow jobs are replayed automatically.' },
  { id: 'reliability-add-webhook-ingest-idempotency', phase: 'Reliability', title: 'Add webhook ingest idempotency', status: 'done', note: 'Duplicate deliveries are suppressed.' },
  { id: 'reliability-add-scheduled-provider-health-sweep', phase: 'Reliability', title: 'Add scheduled provider health sweep', status: 'done', note: 'Connected channels are checked on an interval.' },
  { id: 'reliability-add-webhook-replay-diagnostics-panel', phase: 'Reliability', title: 'Add webhook replay diagnostics panel', status: 'in_progress', note: 'Operators still need a dedicated replay audit surface.' },
  { id: 'reliability-add-retry-exhaustion-reporting', phase: 'Reliability', title: 'Add retry exhaustion reporting', status: 'planned', note: 'Failed jobs should surface after all retries are used.' },
  { id: 'reliability-add-token-refresh-monitoring', phase: 'Reliability', title: 'Add token refresh monitoring', status: 'planned', note: 'Refresh failures should create visible provider issues.' },
  { id: 'reliability-add-webhook-lag-alerting', phase: 'Reliability', title: 'Add webhook lag alerting', status: 'planned', note: 'Stale inbox sync should be surfaced in the UI.' },
  { id: 'reliability-add-delivery-failure-aggregation', phase: 'Reliability', title: 'Add delivery failure aggregation', status: 'planned', note: 'Group failed receipts by provider and thread.' },
  { id: 'reliability-add-sync-backfill-jobs', phase: 'Reliability', title: 'Add sync backfill jobs', status: 'planned', note: 'Rebuild missed provider data after downtime.' },
  { id: 'production-harden-gmail-setup-docs', phase: 'Production readiness', title: 'Harden Gmail setup docs', status: 'done', note: 'Exact Google prerequisites are already visible in Deploy.' },
  { id: 'production-harden-meta-setup-docs', phase: 'Production readiness', title: 'Harden Meta setup docs', status: 'done', note: 'Exact Meta verification steps are already visible in Deploy.' },
  { id: 'production-add-callback-copy-buttons', phase: 'Production readiness', title: 'Add callback copy buttons', status: 'done', note: 'Webhook URLs can be copied from the UI.' },
  { id: 'production-add-visible-relay-state-summary', phase: 'Production readiness', title: 'Add visible relay state summary', status: 'done', note: 'Relay state persists and is surfaced in Deploy.' },
  { id: 'production-add-workspace-release-checklist', phase: 'Production readiness', title: 'Add workspace release checklist', status: 'planned', note: 'Track readiness before enabling live traffic.' },
  { id: 'production-add-role-based-permissions', phase: 'Production readiness', title: 'Add role-based permissions', status: 'planned', note: 'Control who can connect, send, and escalate.' },
  { id: 'production-add-provider-rollout-checklist', phase: 'Production readiness', title: 'Add provider rollout checklist', status: 'planned', note: 'Sequence Gmail, WhatsApp, Instagram, and Messenger.' },
  { id: 'production-add-production-incident-timeline', phase: 'Production readiness', title: 'Add production incident timeline', status: 'planned', note: 'Keep operational issues visible over time.' },
  { id: 'production-add-weekly-shipping-digest', phase: 'Production readiness', title: 'Add weekly shipping digest', status: 'planned', note: 'Summarize completed work for the team.' },
  { id: 'production-add-live-demo-checklist', phase: 'Production readiness', title: 'Add live demo checklist', status: 'planned', note: 'Make the preview easier to present to stakeholders.' }
];

export function getRolloutRoadmap() {
  return ROADMAP.slice();
}

export function getRoadmapItemById(itemId = '') {
  const key = String(itemId || '').trim();
  return ROADMAP.find((item) => item.id === key) || null;
}

function getEffectiveRoadmapItems() {
  const statusMap = getRoadmapStatusMap();
  return ROADMAP.map((item) => {
    const override = statusMap[item.id];
    return {
      ...item,
      status: String(override?.status || item.status || 'planned').toLowerCase(),
      note: override?.note || item.note
    };
  });
}

function buildRoadmapStats(items = getEffectiveRoadmapItems()) {
  const counts = ROADMAP.reduce((acc, item) => {
    acc.total += 1;
    const current = items.find((entry) => entry.id === item.id) || item;
    acc[current.status] = (acc[current.status] || 0) + 1;
    acc.phases[current.phase] = (acc.phases[current.phase] || 0) + 1;
    return acc;
  }, { total: 0, done: 0, in_progress: 0, planned: 0, phases: {} });
  const completion = Math.round((counts.done / counts.total) * 100);
  return { counts, completion };
}

export function renderRolloutRoadmapSummary() {
  const items = getEffectiveRoadmapItems();
  const { counts, completion } = buildRoadmapStats(items);
  return `
    <div class="roadmap-summary">
      <div class="detail-meta compact">
        <div><span>Total</span><strong>${counts.total}</strong></div>
        <div><span>Done</span><strong>${counts.done}</strong></div>
        <div><span>Next</span><strong>${counts.in_progress}</strong></div>
        <div><span>Planned</span><strong>${counts.planned}</strong></div>
      </div>
      <div class="progress-shell" aria-label="Roadmap progress">
        <div class="progress-bar" style="width: ${completion}%"></div>
      </div>
      <div class="mini-status muted">${completion}% of the roadmap is already represented in the preview shell.</div>
    </div>
  `;
}

export function renderRolloutRoadmapList() {
  const items = getEffectiveRoadmapItems();
  const phaseOrder = ['Provider rollout', 'Inbox operations', 'AI workflow', 'Reliability', 'Production readiness'];
  const rows = phaseOrder.flatMap((phase) => items
    .filter((item) => item.phase === phase)
    .map((item) => {
      const status = String(item.status || 'planned').toLowerCase();
      const tone = status === 'done' ? 'success' : status === 'in_progress' ? 'accent' : 'neutral';
      const label = status === 'done'
        ? 'Reopen'
        : status === 'in_progress'
          ? 'Mark done'
          : 'Mark done';
      return `
        <div class="roadmap-item roadmap-${status}">
          <div class="roadmap-copy">
            <div class="roadmap-phase">${phase}</div>
            <strong>${item.title}</strong>
            <span>${item.note}</span>
          </div>
          <button class="badge ${tone}" type="button" data-action="toggle-roadmap-item" data-roadmap-item-id="${item.id}" data-roadmap-next-status="${status === 'done' ? 'in_progress' : 'done'}">${label}</button>
        </div>
      `;
    }));

  return rows.join('');
}

export function renderRolloutRoadmap() {
  return `${renderRolloutRoadmapSummary()}<div class="roadmap-list">${renderRolloutRoadmapList()}</div>`;
}

export function renderRoadmapChangelog() {
  const entries = getRoadmapChangelog();
  if (!entries.length) {
    return '<div class="check-item"><span>1</span><div><strong>No roadmap updates yet</strong><span>Roadmap changes will appear here as items are completed.</span></div></div>';
  }

  return entries.slice(0, 8).map((entry) => {
    const item = getRoadmapItemById(entry.itemId);
    return `
      <div class="check-item">
        <span>${String(entry.status || '').slice(0, 2).toUpperCase()}</span>
        <div>
          <strong>${item?.title || entry.itemId}</strong>
          <span>${entry.note || 'Milestone status updated.'}</span>
          <span>${entry.created_at}</span>
        </div>
      </div>
    `;
  }).join('');
}

export function markRoadmapItemComplete(itemId, note = '') {
  return updateRoadmapItemStatus(itemId, 'done', note);
}

export function getRoadmapCompletionPercent() {
  const { completion } = buildRoadmapStats();
  return completion;
}
