import { escapeHtml as baseEscapeHtml, initials, formatCurrency, formatRelativeDate, formatTimestamp, toneFromPriority } from './formatters.js';

export const escapeHtml = baseEscapeHtml;

function renderEmptyState(title = 'Nothing here yet', note = '', className = '') {
  return `
    <div class="empty-state ${className}">
      <strong>${escapeHtml(title)}</strong>
      ${note ? `<p>${escapeHtml(note)}</p>` : ''}
    </div>
  `;
}

function getContactPhoneHealth(contact = {}) {
  const metadata = contact?.metadata || {};
  const lookup = metadata.phone_lookup || {};
  const health = metadata.phone_health || {};
  const lineType = String(health.line_type || lookup.line_type || '').trim().toLowerCase();
  const carrierName = String(health.carrier_name || lookup.carrier_name || '').trim();
  const valid = health.valid === true || lookup.valid === true;
  const hasPhone = Boolean(String(contact?.phone || '').trim());
  const status = String(health.status || lookup.lookup_status || '').trim().toLowerCase();
  return {
    hasPhone,
    valid,
    status,
    lineType,
    carrierName,
    checkedAt: health.checked_at || lookup.looked_up_at || '',
    smsCapable: health.sms_capable === true || (valid && !['landline', 'unknown'].includes(lineType))
  };
}

function formatLineTypeLabel(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mobile') return 'Mobile';
  if (normalized === 'landline') return 'Landline';
  if (normalized === 'voip') return 'VoIP';
  return normalized ? humanizeLabel(normalized) : 'Unknown';
}

function renderContactHealthBadges(contact = {}) {
  const health = getContactPhoneHealth(contact);
  if (!health.hasPhone) {
    return '<span class="badge neutral">No phone</span>';
  }

  const badges = [];
  if (health.valid) {
    badges.push('<span class="badge success">Valid</span>');
  } else if (health.status === 'invalid') {
    badges.push('<span class="badge warning">Invalid</span>');
  } else if (health.status === 'lookup_failed') {
    badges.push('<span class="badge warning">Lookup failed</span>');
  } else {
    badges.push('<span class="badge neutral">Unchecked</span>');
  }

  if (health.lineType) {
    badges.push(`<span class="badge ${health.lineType === 'mobile' ? 'accent' : health.lineType === 'landline' ? 'warning' : 'neutral'}">${escapeHtml(formatLineTypeLabel(health.lineType))}</span>`);
  }
  if (health.carrierName) {
    badges.push(`<span class="badge neutral">${escapeHtml(health.carrierName)}</span>`);
  }
  return badges.join('');
}

export function renderWorkspaceConnections(connections = [], channels = []) {
  const rows = Array.isArray(connections) ? connections : [];
  const channelsByProvider = new Map((Array.isArray(channels) ? channels : []).map((item) => [String(item.provider || '').toLowerCase(), item]));
  const connectionsByProvider = new Map(rows.map((item) => [String(item.provider || '').toLowerCase(), item]));
  const providerCards = [
    { key: 'gmail', label: 'Gmail', note: 'Inbox sync, send, and Gmail watch renewal for this workspace.' },
    { key: 'facebook', label: 'Facebook', note: 'Meta business page authorization, page token, and lead intake for this workspace.' },
    { key: 'instagram', label: 'Instagram', note: 'Instagram DM routing and business inbox coverage for this workspace.' },
    { key: 'whatsapp', label: 'WhatsApp', note: 'WhatsApp business messaging and workflow routing for this workspace.' }
  ];

  return providerCards.map((provider) => {
    const connection = connectionsByProvider.get(provider.key) || null;
    const channel = channelsByProvider.get(provider.key) || (provider.key === 'facebook' ? channelsByProvider.get('messenger') : null) || null;
    const status = String(connection?.status || 'not_connected').toLowerCase();
    const connected = Boolean(connection);
    const badgeTone = connected ? deliveryTone(status === 'connected' ? 'verified' : status) : 'neutral';
    const badgeLabel = connected ? humanizeLabel(status || 'connected') : 'Not connected';
    const accountLabel = connection?.external_account_label || connection?.display_name || connection?.connection_metadata?.email || 'No account linked yet';
    const statusNote = connection?.last_error_message
      ? connection.last_error_message
      : connection?.last_connected_at
        ? `Last linked ${formatRelativeDate(connection.last_connected_at)}`
        : provider.note;
    const channelState = String(channel?.status || '').trim();
    const channelNote = channelState
      ? `Channel state: ${humanizeLabel(channelState)}`
      : 'Channel record will appear after the workspace sync finishes.';
    const buttonLabel = connected ? `Reconnect ${provider.label}` : `Connect ${provider.label}`;

    return `
      <div class="check-item">
        <span>${escapeHtml(provider.label.slice(0, 2).toUpperCase())}</span>
        <div>
          <strong>${escapeHtml(provider.label)}</strong>
          <span>${escapeHtml(accountLabel)}</span>
          <span>${escapeHtml(statusNote)}</span>
          <span>${escapeHtml(channelNote)}</span>
        </div>
        <span class="badge ${badgeTone}">${escapeHtml(badgeLabel)}</span>
        <button class="ghost-button compact" type="button" data-provider-connect="${escapeHtml(provider.key)}">${escapeHtml(buttonLabel)}</button>
      </div>
    `;
  }).join('');
}

export function renderTemplateHealthPanel(summary = {}) {
  const senderLabel = String(summary.senderLabel || 'Production sender pending');
  const senderState = String(summary.senderState || 'unknown');
  const callbackCoverage = Number(summary.callbackCoverage || 0);
  const templateTraffic = Number(summary.templateTraffic || 0);
  const policyBlocks = Number(summary.policyBlocks || 0);
  const transientBlocks = Number(summary.transientBlocks || 0);
  const expectedTemplates = Array.isArray(summary.expectedTemplates) ? summary.expectedTemplates : [];

  const rows = [
    {
      code: 'WA',
      title: 'Sender path',
      note: senderState === 'live'
        ? `${senderLabel} is the active WhatsApp sender for outbound traffic.`
        : 'Production sender details have not been observed in live message traffic yet.',
      badge: senderState === 'live' ? 'Live' : senderState === 'configured' ? 'Ready' : 'Waiting',
      tone: senderState === 'live' ? 'success' : senderState === 'configured' ? 'accent' : 'neutral'
    },
    {
      code: 'TP',
      title: 'Template traffic',
      note: templateTraffic
        ? `${templateTraffic} WhatsApp message${templateTraffic === 1 ? '' : 's'} already carried template metadata or a content SID.`
        : 'No template-backed WhatsApp traffic has been observed in this workspace yet.',
      badge: templateTraffic ? `${templateTraffic}` : 'Idle',
      tone: templateTraffic ? 'accent' : 'neutral'
    },
    {
      code: 'PL',
      title: 'Policy blockers',
      note: policyBlocks
        ? `${policyBlocks} failure${policyBlocks === 1 ? '' : 's'} look policy or template related and should stay out of bulk retry.`
        : 'No template or policy blockers are currently visible in callback traffic.',
      badge: policyBlocks ? 'Review' : 'Clear',
      tone: policyBlocks ? 'warning' : 'success'
    },
    {
      code: 'CB',
      title: 'Callback coverage',
      note: callbackCoverage
        ? `${callbackCoverage}% of tracked WhatsApp replies have produced a delivered or read callback.`
        : transientBlocks
          ? `${transientBlocks} transient delivery issue${transientBlocks === 1 ? '' : 's'} still need monitoring.`
          : 'Delivery callbacks will appear here once more WhatsApp traffic flows through Twilio.',
      badge: callbackCoverage ? `${callbackCoverage}%` : 'Waiting',
      tone: callbackCoverage >= 90 ? 'success' : callbackCoverage >= 70 ? 'accent' : callbackCoverage ? 'warning' : 'neutral'
    }
  ];

  const templateRows = expectedTemplates.map((template) => `
    <div class="check-item">
      <span>${escapeHtml(String(template.code || 'TM'))}</span>
      <div>
        <strong>${escapeHtml(String(template.label || 'Template'))}</strong>
        <span>${escapeHtml(String(template.note || 'No recent template traffic has been observed for this item yet.'))}</span>
      </div>
      <span class="badge ${escapeHtml(String(template.tone || 'neutral'))}">${escapeHtml(String(template.badge || 'Idle'))}</span>
    </div>
  `).join('');

  return rows.map((item) => `
    <div class="check-item">
      <span>${escapeHtml(item.code)}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.note)}</span>
      </div>
      <span class="badge ${item.tone}">${escapeHtml(item.badge)}</span>
    </div>
  `).join('') + templateRows;
}

export function renderTemplateGallery(templates = []) {
  const rows = Array.isArray(templates) ? templates : [];
  if (!rows.length) {
    return renderEmptyState(
      'No templates loaded yet',
      'Approved WhatsApp and SMS templates from Supabase will appear here once they are saved for this workspace.',
      'compact'
    );
  }

  return rows.map((template) => {
    const channel = String(template.channel || template.provider || 'Template');
    const status = String(template.approvalStatus || template.status || 'pending');
    const tone = status === 'ready' || status === 'approved'
      ? 'success'
      : status === 'rejected'
        ? 'warning'
        : 'neutral';
    const statusLabel = status === 'approved' ? 'Ready' : humanizeLabel(status);
    const templateKey = String(template.templateKey || template.name || template.contentSid || '').trim();
    const variablePreview = Array.isArray(template.variables) && template.variables.length
      ? template.variables.join(', ')
      : 'Variables will appear here once configured.';
    const note = String(template.note || template.description || '').trim()
      || `${formatProviderLabel(channel)} template`;

    return `
      <div class="check-item template-gallery-item">
        <span>${escapeHtml(String(template.code || channel.slice(0, 2).toUpperCase()))}</span>
        <div>
          <strong>${escapeHtml(String(template.label || template.name || 'Template'))}</strong>
          <span>${escapeHtml(note)}</span>
          <span>${escapeHtml(templateKey || 'No template key saved yet')}</span>
          <span>${escapeHtml(variablePreview)}</span>
        </div>
        <span class="badge ${tone}">${escapeHtml(statusLabel)}</span>
      </div>
    `;
  }).join('');
}

export function renderWorkspaceOpsReadiness(summary = {}) {
  const items = [
    {
      code: 'ID',
      title: 'Identity graph',
      note: `${Number(summary.unifiedProfiles || 0)} unified profile${Number(summary.unifiedProfiles || 0) === 1 ? '' : 's'} span multiple channels, and ${Number(summary.duplicateClusters || 0)} duplicate cluster${Number(summary.duplicateClusters || 0) === 1 ? '' : 's'} still need cleanup.`,
      badge: Number(summary.duplicateClusters || 0) ? 'Review' : 'Healthy',
      tone: Number(summary.duplicateClusters || 0) ? 'warning' : 'success'
    },
    {
      code: 'WK',
      title: 'Webhook diagnostics',
      note: Number(summary.verifiedWebhooks || 0)
        ? `${Number(summary.verifiedWebhooks || 0)} provider webhook${Number(summary.verifiedWebhooks || 0) === 1 ? '' : 's'} are verified, with ${Number(summary.staleWebhooks || 0)} stale or missing callback path${Number(summary.staleWebhooks || 0) === 1 ? '' : 's'}.`
        : 'No verified webhook paths are visible yet. Deploy verification remains a top admin task.',
      badge: Number(summary.staleWebhooks || 0) ? 'Watch' : Number(summary.verifiedWebhooks || 0) ? 'Ready' : 'Setup',
      tone: Number(summary.staleWebhooks || 0) ? 'warning' : Number(summary.verifiedWebhooks || 0) ? 'success' : 'accent'
    },
    {
      code: 'Q',
      title: 'Queue health',
      note: `${Number(summary.queuedJobs || 0)} queued job${Number(summary.queuedJobs || 0) === 1 ? '' : 's'}, ${Number(summary.retryingJobs || 0)} retrying, and ${Number(summary.failedJobs || 0)} failed still need operator eyes.`,
      badge: Number(summary.failedJobs || 0) ? 'Attention' : Number(summary.retryingJobs || 0) ? 'Active' : 'Stable',
      tone: Number(summary.failedJobs || 0) ? 'warning' : Number(summary.retryingJobs || 0) ? 'accent' : 'success'
    },
    {
      code: 'VO',
      title: 'Voice intelligence',
      note: `${Number(summary.voiceAnalyzed || 0)} analyzed call${Number(summary.voiceAnalyzed || 0) === 1 ? '' : 's'} are in the workspace, and ${Number(summary.voiceReadyFollowUps || 0)} already have a next-step recommendation.`,
      badge: Number(summary.voiceReadyFollowUps || 0) ? 'Ready' : Number(summary.voiceAnalyzed || 0) ? 'Active' : 'Idle',
      tone: Number(summary.voiceReadyFollowUps || 0) ? 'success' : Number(summary.voiceAnalyzed || 0) ? 'accent' : 'neutral'
    }
  ];

  return items.map((item) => `
    <div class="check-item">
      <span>${escapeHtml(item.code)}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.note)}</span>
      </div>
      <span class="badge ${item.tone}">${escapeHtml(item.badge)}</span>
    </div>
  `).join('');
}

function humanizeLabel(value = '') {
  return String(value || '')
    .replace(/^workflow\./i, '')
    .replace(/^conversation_/i, 'conversation.')
    .replace(/^outbound_reply_/i, 'reply.')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Unknown';
}

function deliveryTone(state = '') {
  const normalized = String(state || '').toLowerCase();
  if (['delivered', 'read', 'completed', 'verified', 'live'].includes(normalized)) return 'success';
  if (['failed', 'error', 'missing', 'stale'].includes(normalized)) return 'warning';
  if (['queued', 'retrying', 'connecting', 'manual_setup', 'configured'].includes(normalized)) return 'accent';
  return 'neutral';
}

function sentimentTone(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'positive') return 'success';
  if (normalized === 'negative') return 'warning';
  if (normalized === 'neutral') return 'neutral';
  return 'accent';
}

function formatReceiptLabel(receipt = {}) {
  const state = String(receipt.status || receipt.state || receipt.delivery_state || 'sent').toLowerCase();
  return {
    state,
    label: humanizeLabel(state),
    happenedAt: receipt.created_at || receipt.timestamp || receipt.recorded_at
      ? formatRelativeDate(receipt.created_at || receipt.timestamp || receipt.recorded_at)
      : ''
  };
}

function renderDeliveryCheckmarks(state = '', isOutbound = false) {
  if (!isOutbound) return '';
  const normalized = String(state || '').toLowerCase();
  if (!normalized || ['failed', 'undelivered', 'received'].includes(normalized)) return '';

  const checks = normalized === 'sent' || normalized === 'queued' ? 1 : 2;
  const toneClass = normalized === 'read'
    ? 'is-read'
    : normalized === 'delivered'
      ? 'is-delivered'
      : 'is-sent';
  const label = normalized === 'read'
    ? 'Read'
    : normalized === 'delivered'
      ? 'Delivered'
      : 'Sent';

  return `
    <span class="message-checkmarks ${toneClass}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      ${Array.from({ length: checks }, () => '<span class="message-checkmark">&#10003;</span>').join('')}
    </span>
  `;
}

function cleanTextValue(value = '') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized === '[object Object]') return '';
  return normalized;
}

function decodeHtmlEntities(value = '') {
  const namedEntities = {
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' '
  };

  return String(value || '')
    .replace(/&(amp|quot|#39|apos|lt|gt|nbsp);/gi, (match) => namedEntities[match.toLowerCase()] || match)
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      if (!Number.isFinite(value)) return ' ';
      return String.fromCodePoint(value);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const value = Number.parseInt(code, 16);
      if (!Number.isFinite(value)) return ' ';
      return String.fromCodePoint(value);
    });
}

function normalizeMessageWhitespace(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function sanitizeMessageBody(value = '') {
  const text = normalizeMessageWhitespace(
    decodeHtmlEntities(
      String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
    )
  );

  if (!text) return '';

  return text
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function compactMessagePreview(value = '', fallback = '') {
  const sanitized = sanitizeMessageBody(value);
  const fallbackText = sanitizeMessageBody(fallback);
  const candidate = sanitized || fallbackText;

  if (!candidate) return 'No summary yet.';

  const stopPatterns = [
    /\n(?:From|Sent|To|Subject):/i,
    /\n(?:On .+ wrote:)/i,
    /\b(?:unsubscribe|manage preferences|view in browser|read more)\b/i
  ];

  let trimmed = candidate;
  for (const pattern of stopPatterns) {
    const match = trimmed.match(pattern);
    if (match && typeof match.index === 'number' && match.index > 24) {
      trimmed = trimmed.slice(0, match.index).trim();
    }
  }

  trimmed = trimmed.replace(/\s{2,}/g, ' ').trim();
  if (!trimmed) trimmed = fallbackText || 'No summary yet.';

  if (trimmed.length > 180) {
    trimmed = `${trimmed.slice(0, 177).trimEnd()}...`;
  }

  return trimmed;
}

function pickNestedText(value, depth = 0) {
  if (depth > 3 || value == null) return '';
  if (typeof value === 'string') return cleanTextValue(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = pickNestedText(entry, depth + 1);
      if (nested) return nested;
    }
    return '';
  }
  if (typeof value !== 'object') {
    return cleanTextValue(String(value));
  }

  const preferredKeys = ['body', 'text', 'message', 'caption', 'summary', 'note', 'description', 'content', 'title'];
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const nested = pickNestedText(value[key], depth + 1);
    if (nested) return nested;
  }

  for (const nestedValue of Object.values(value)) {
    const nested = pickNestedText(nestedValue, depth + 1);
    if (nested) return nested;
  }
  return '';
}

function extractMessageBody(item = {}) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const direct = cleanTextValue(safeItem.body);
  if (direct) return sanitizeMessageBody(direct);

  const raw = safeItem.raw_payload || safeItem.rawPayload || {};
  const candidates = [
    raw,
    raw.provider_result,
    raw.payload,
    raw.value,
    raw.entry,
    raw.messages,
    raw.changes
  ];

  for (const candidate of candidates) {
    const nested = pickNestedText(candidate);
    if (nested) return sanitizeMessageBody(nested);
  }

  return 'Message content unavailable.';
}

function formatProviderLabel(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Provider';
  if (normalized === 'gmail') return 'Gmail';
  if (normalized === 'whatsapp') return 'WhatsApp';
  if (normalized === 'instagram') return 'Instagram';
  if (normalized === 'messenger') return 'Messenger';
  return humanizeLabel(normalized);
}

function extractDeliveryFailureReason(message = {}) {
  const raw = message?.raw_payload || message?.rawPayload || {};
  const providerResult = raw.provider_result || raw.providerResult || {};
  const receipts = Array.isArray(message?.delivery_receipts)
    ? message.delivery_receipts
    : Array.isArray(raw.delivery_receipts)
      ? raw.delivery_receipts
      : [];
  const candidates = [
    providerResult.error,
    providerResult.errorMessage,
    providerResult.message,
    raw.error,
    raw.error_message,
    receipts.find((receipt) => String(receipt?.status || receipt?.state || '').toLowerCase().includes('fail'))?.error,
    receipts.find((receipt) => String(receipt?.status || receipt?.state || '').toLowerCase().includes('undeliver'))?.error
  ];
  const reason = candidates.map((value) => cleanTextValue(String(value || ''))).find(Boolean) || '';
  return reason;
}

function classifyFailureReason(reason = '') {
  const normalized = String(reason || '').trim().toLowerCase();
  if (!normalized) return { label: '', tone: 'neutral', guidance: '' };
  if (
    normalized.includes('auth')
    || normalized.includes('unauthorized')
    || normalized.includes('forbidden')
    || normalized.includes('token')
    || normalized.includes('permission')
    || normalized.includes('access denied')
  ) {
    return { label: 'Auth or access', tone: 'warning', guidance: 'Reconnect the channel or refresh provider access before retrying.' };
  }
  if (
    normalized.includes('template')
    || normalized.includes('policy')
    || normalized.includes('content sid')
    || normalized.includes('not approved')
    || normalized.includes('outside the allowed window')
  ) {
    return { label: 'Template or policy', tone: 'warning', guidance: 'Review the WhatsApp template, policy window, or approval state before retrying.' };
  }
  if (
    normalized.includes('invalid number')
    || normalized.includes('not a valid')
    || normalized.includes('recipient')
    || normalized.includes('phone')
    || normalized.includes('user unavailable')
    || normalized.includes('device')
  ) {
    return { label: 'Recipient issue', tone: 'accent', guidance: 'Verify the contact phone number or ask the customer to re-engage on WhatsApp.' };
  }
  if (
    normalized.includes('rate')
    || normalized.includes('throttle')
    || normalized.includes('timeout')
    || normalized.includes('temporar')
    || normalized.includes('network')
    || normalized.includes('queue')
  ) {
    return { label: 'Transient delivery', tone: 'accent', guidance: 'Safe to retry after a short delay unless the provider keeps throttling.' };
  }
  return { label: 'Needs review', tone: 'neutral', guidance: 'Check the provider response before retrying in bulk.' };
}

function buildRetryDiagnostics(messages = []) {
  const thread = Array.isArray(messages)
    ? messages
      .filter((item) => String(item.direction || '').toLowerCase() === 'outbound')
      .slice()
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
    : [];
  const latestFailure = thread.find((item) => ['failed', 'error', 'undelivered', 'retrying'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())) || null;
  if (!latestFailure) {
    return {
      hasFailure: false,
      retryCount: 0,
      lastRetryAt: '',
      nextRetryMode: '',
      failureReason: ''
    };
  }

  const failureTime = new Date(latestFailure.created_at || latestFailure.updated_at || 0).getTime();
  const retryAttempts = thread.filter((item) => new Date(item.created_at || item.updated_at || 0).getTime() > failureTime);
  const state = String(latestFailure.delivery_state || latestFailure.raw_payload?.delivery_state || '').toLowerCase();

  return {
    hasFailure: true,
    retryCount: retryAttempts.length,
    lastRetryAt: retryAttempts[0]?.created_at || retryAttempts[0]?.updated_at || '',
    nextRetryMode: state === 'retrying' ? 'Automatic retry queued' : 'Manual retry needed',
    failureReason: extractDeliveryFailureReason(latestFailure)
  };
}

function summarizeSendState(messages = []) {
  const latestOutbound = (messages || [])
    .filter((item) => String(item.direction || '').toLowerCase() === 'outbound')
    .slice()
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())[0];

  if (!latestOutbound) {
    return {
      label: 'No reply sent yet',
      tone: 'neutral',
      note: 'The next send from AuraFlow will establish the first delivery state for this thread.'
    };
  }

  const state = String(latestOutbound.delivery_state || latestOutbound.raw_payload?.delivery_state || 'sent').toLowerCase();
  const failureReason = extractDeliveryFailureReason(latestOutbound);
  if (['failed', 'error'].includes(state)) {
    return {
      label: 'Last send failed',
      tone: 'warning',
      note: failureReason
        ? `Last send failed: ${failureReason}`
        : 'Retry from the composer after reviewing the thread target and provider readiness.'
    };
  }
  if (state === 'retrying') {
    return {
      label: 'Retry in progress',
      tone: 'accent',
      note: 'AuraFlow is still trying to deliver the most recent outbound reply.'
    };
  }
  if (state === 'queued') {
    return {
      label: 'Queued for send',
      tone: 'accent',
      note: 'The latest reply is saved as queued work and has not been pushed yet.'
    };
  }
  if (['delivered', 'read'].includes(state)) {
    return {
      label: humanizeLabel(state),
      tone: 'success',
      note: 'The most recent outbound reply has a positive provider receipt.'
    };
  }
  return {
    label: humanizeLabel(state || 'sent'),
    tone: state ? deliveryTone(state) : 'neutral',
    note: 'The latest outbound reply has been handed to the provider and is waiting for more delivery detail.'
  };
}

export function normalizeContacts(rows = []) {
  return rows.map((row) => ({
    linkedChannels: Array.from(new Set((Array.isArray(row.metadata?.identities) ? row.metadata.identities : []).map((identity) => String(identity.provider || '').toUpperCase()).filter(Boolean))),
    id: row.id,
    name: row.name || row.email || 'Unknown contact',
    company: row.company || 'No company',
    stage: row.lead_stage || 'New',
    owner: row.owner_name || 'Unassigned',
    lastSeen: formatRelativeDate(row.updated_at || row.created_at),
    lifetime: formatCurrency(row.lifetime_value),
    tags: Array.isArray(row.tags) ? row.tags : [],
    email: row.email || '',
    phone: row.phone || '',
    metadata: row.metadata || {}
  }));
}

export function normalizeConversations(rows = [], contacts = [], channels = [], messages = [], activityEvents = [], workflowJobs = []) {
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const channelByProvider = new Map((channels || []).map((channel) => [String(channel.provider || '').toLowerCase(), channel]));
  const messagesByConversation = new Map();
  (messages || []).forEach((message) => {
    const conversationId = String(message?.conversation_id || '').trim();
    if (!conversationId) return;
    if (!messagesByConversation.has(conversationId)) messagesByConversation.set(conversationId, []);
    messagesByConversation.get(conversationId).push(message);
  });
  const activityByConversation = new Map();
  (activityEvents || []).forEach((item) => {
    if (String(item?.entity_type || '').toLowerCase() !== 'conversation') return;
    const conversationId = String(item?.entity_id || '').trim();
    if (!conversationId) return;
    if (!activityByConversation.has(conversationId)) activityByConversation.set(conversationId, []);
    activityByConversation.get(conversationId).push(item);
  });
  const workflowByConversation = new Map();
  (workflowJobs || []).forEach((job) => {
    if (!String(job?.type || '').startsWith('workflow.')) return;
    const conversationId = String(job?.payload?.conversationId || job?.payload?.conversation_id || '').trim();
    if (!conversationId) return;
    if (!workflowByConversation.has(conversationId)) workflowByConversation.set(conversationId, []);
    workflowByConversation.get(conversationId).push(job);
  });
  return rows.map((row) => {
    const contact = row.contact_id ? contactById.get(row.contact_id) : null;
    const providerKey = String(row.source_provider || row.source || '').toLowerCase();
    const channel = channelByProvider.get(providerKey) || null;
      const threadMessages = (messagesByConversation.get(row.id) || []).slice().sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
      const latestMessage = threadMessages[0] || null;
      const lastDirection = String(latestMessage?.direction || '').toLowerCase();
      const hasMissedCallFollowup = threadMessages.some((item) => {
        const externalId = String(item?.external_message_id || '').toLowerCase();
        const channel = String(item?.channel || item?.source_provider || '').toLowerCase();
        const body = String(item?.body || '').toLowerCase();
        return externalId.startsWith('voice-missed:') || (channel === 'sms' && body.includes('i saw you just called'));
      });
      const hasSmsFollowup = threadMessages.some((item) => {
        const channel = String(item?.channel || item?.source_provider || '').toLowerCase();
        const direction = String(item?.direction || '').toLowerCase();
        return channel === 'sms' && direction === 'outbound';
      });
      const escalationCount = (activityByConversation.get(row.id) || []).filter((item) => String(item.event_type || '').toLowerCase().includes('escal')).length;
      const relatedWorkflowJobs = (workflowByConversation.get(row.id) || []).slice();
    const workflowCounts = relatedWorkflowJobs.reduce((acc, item) => {
      const status = String(item.status || 'queued').toLowerCase();
      acc.total += 1;
      acc[status] = Number(acc[status] || 0) + 1;
      return acc;
    }, { total: 0 });
    const workflowNeedsAttention = Number(workflowCounts.queued || 0) > 0 || Number(workflowCounts.escalated || 0) > 0 || Number(workflowCounts.retrying || 0) > 0;
      const replyTargetStatus = String(row.reply_target_status || '').toLowerCase();
      const webhookState = String(channel?.webhook_state || '').toLowerCase();
      const verifiedLive = webhookState === 'verified' && !['placeholder', 'missing'].includes(replyTargetStatus);
      const isTestThread = replyTargetStatus === 'placeholder';
      const deliveryNeedsAttention = ['failed', 'error', 'undelivered', 'retrying'].includes(String(latestMessage?.delivery_state || '').toLowerCase());
      const needsAttention = lastDirection === 'inbound' || escalationCount > 0 || workflowNeedsAttention || deliveryNeedsAttention || ['missing', 'placeholder'].includes(replyTargetStatus);
      const updatedAtRaw = row.updated_at || row.created_at || latestMessage?.created_at || '';
      const ageMinutes = updatedAtRaw ? (Date.now() - new Date(updatedAtRaw).getTime()) / 60000 : 0;
      const ageHours = ageMinutes / 60;
      const waitingLabel = lastDirection === 'inbound'
        ? 'Waiting on team'
        : lastDirection === 'outbound'
          ? 'Waiting on customer'
          : 'No reply yet';
    const workflowLabel = Number(workflowCounts.escalated || 0) > 0
      ? 'Escalation queued'
      : Number(workflowCounts.assigned || 0) > 0
        ? 'Owned workflow'
        : Number(workflowCounts.queued || 0) > 0
          ? 'Follow-up queued'
          : '';
      const unassigned = !String(row.assigned_to || '').trim();
      const escalatedUnassigned = unassigned && (escalationCount > 0 || Number(workflowCounts.escalated || 0) > 0);
      const verifiedNoOwner = verifiedLive && unassigned;
      const slaRisk = lastDirection === 'inbound' && ageMinutes >= 15;
      const oldestWaitingInbound = lastDirection === 'inbound' && ageHours >= 12;
      const confidence = Number(row.intent_confidence || row.intentConfidence || 0);
      const needsHumanReview = (
        String(row.status || '').toLowerCase() === 'escalated'
        || String(row.status || '').toLowerCase() === 'needs_human'
        || (Number.isFinite(confidence) && confidence > 0 && confidence < 0.45)
      );
      const priorityRank = [
        slaRisk ? 520 + Math.min(Math.round(ageMinutes), 180) : 0,
        needsHumanReview ? 460 : 0,
        escalatedUnassigned ? 400 : 0,
        oldestWaitingInbound ? Math.min(Math.round(ageHours), 120) : 0,
        verifiedNoOwner ? 120 : 0,
        Number(workflowCounts.queued || 0) > 0 ? 40 : 0,
        verifiedLive ? 20 : 0
      ].reduce((sum, value) => sum + value, 0);
      const latestOutboundState = threadMessages
        .filter((item) => String(item.direction || '').toLowerCase() === 'outbound')
        .map((item) => String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())
        .find(Boolean) || '';
      const retryDiagnostics = buildRetryDiagnostics(threadMessages);
      return {
      id: row.id,
      name: contact?.name || row.subject || 'New conversation',
      company: contact?.company || 'Workspace contact',
      channel: row.source || 'Direct',
      status: row.status || 'Open',
      statusTone: toneFromPriority(row.priority),
      tag: contact?.tags?.[0] || row.priority || 'Live',
        owner: row.assigned_to || contact?.owner || 'Unassigned',
        lastMessage: compactMessagePreview(
          extractMessageBody(latestMessage),
          row.summary || row.subject || ''
        ),
        updatedAtRaw,
        updatedAt: formatRelativeDate(row.updated_at || row.created_at),
      value: contact?.lifetime || formatCurrency(contact?.lifetime_value || 0),
      sentiment: row.priority || 'Neutral',
      replyTargetStatus,
      replyTargetNote: row.reply_target_note || '',
      webhookState,
      verifiedLive,
      isTestThread,
      needsAttention,
      escalationCount,
        latestDeliveryState: latestOutboundState,
        latestFailureReason: retryDiagnostics.failureReason,
        retryDiagnostics,
        workflowCounts,
        workflowLabel,
        waitingLabel,
        unassigned,
        ageMinutes,
        ageHours,
        slaRisk,
        oldestWaitingInbound,
        escalatedUnassigned,
        verifiedNoOwner,
        hasMissedCallFollowup,
        hasSmsFollowup,
        needsHumanReview,
        confidence,
        priorityRank,
        previewBadges: [
          slaRisk ? { label: 'SLA risk', tone: 'warning' } : null,
          needsHumanReview ? { label: 'Needs human review', tone: 'warning' } : null,
          hasMissedCallFollowup ? { label: 'Missed-call follow-up', tone: 'accent' } : null,
          hasSmsFollowup ? { label: 'SMS follow-up sent', tone: 'neutral' } : null,
          escalatedUnassigned ? { label: 'Escalated + unassigned', tone: 'warning' } : null,
          oldestWaitingInbound ? { label: 'Oldest waiting inbound', tone: 'warning' } : null,
          verifiedNoOwner ? { label: 'Verified live + no owner', tone: 'accent' } : null,
          ['failed', 'error', 'undelivered'].includes(latestOutboundState) ? { label: 'Reply failed', tone: 'warning' } : null,
          latestOutboundState === 'retrying' ? { label: 'Retrying send', tone: 'accent' } : null,
          retryDiagnostics.hasFailure && retryDiagnostics.retryCount > 0 ? { label: `${retryDiagnostics.retryCount} retry ${retryDiagnostics.retryCount === 1 ? 'attempt' : 'attempts'}`, tone: 'neutral' } : null,
          webhookState === 'verified' ? { label: 'Verified', tone: 'success' } : null,
          isTestThread ? { label: 'Test thread', tone: 'warning' } : null,
          escalationCount ? { label: `${escalationCount} escalated`, tone: 'warning' } : null,
          Number(workflowCounts.escalated || 0) > 0 ? { label: 'Escalation queued', tone: 'warning' } : null,
          Number(workflowCounts.assigned || 0) > 0 ? { label: 'Assigned workflow', tone: 'neutral' } : null,
          !Number(workflowCounts.assigned || 0) && Number(workflowCounts.queued || 0) > 0 ? { label: `${Number(workflowCounts.queued || 0)} queued`, tone: 'accent' } : null,
          unassigned ? { label: 'Unassigned', tone: 'neutral' } : null,
          lastDirection === 'inbound' ? { label: 'Waiting on team', tone: 'accent' } : null
        ].filter(Boolean)
      };
  });
}

export function renderInboxFilterBar(currentFilter = 'all', counts = {}) {
  const filters = [
    { key: 'all', label: 'All', count: Number(counts.all || 0) },
    { key: 'high_priority', label: 'High priority', count: Number(counts.high_priority || 0) },
    { key: 'mine', label: 'Mine', count: Number(counts.mine || 0) },
    { key: 'failed', label: 'Failed sends', count: Number(counts.failed || 0) },
    { key: 'missed_call', label: 'Missed calls', count: Number(counts.missed_call || 0) },
    { key: 'sms_followup', label: 'SMS follow-up', count: Number(counts.sms_followup || 0) },
    { key: 'unassigned', label: 'Unassigned', count: Number(counts.unassigned || 0) },
    { key: 'escalated', label: 'Escalated', count: Number(counts.escalated || 0) },
    { key: 'attention', label: 'Needs attention', count: Number(counts.attention || 0) },
    { key: 'verified', label: 'Verified live', count: Number(counts.verified || 0) },
    { key: 'test', label: 'Test only', count: Number(counts.test || 0) }
  ];
  return filters.map((filter) => `
    <button class="chip ${currentFilter === filter.key ? 'active' : ''}" type="button" data-action="set-inbox-filter" data-inbox-filter="${escapeHtml(filter.key)}">
      ${escapeHtml(filter.label)} <span class="badge neutral">${escapeHtml(String(filter.count))}</span>
    </button>
  `).join('');
}

export function renderConversationPreviewList(items, selectedConversationId = '') {
  return items
    .map(
      (item) => `
        <button class="conversation-row ${item.id === selectedConversationId ? 'active' : ''} ${item.slaRisk ? 'priority-sla-risk' : ''}" type="button" data-conversation-id="${escapeHtml(item.id)}">
          <div class="avatar">${initials(item.name)}</div>
          <div class="conversation-copy">
            <div class="preview-head"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.updatedAt)}</span></div>
            <p>${escapeHtml(item.lastMessage)}</p>
            <div class="mini-status muted">${escapeHtml([item.company, item.owner, item.waitingLabel, item.slaRisk ? '15m+ without reply' : ''].filter(Boolean).join(' · '))}</div>
            <div class="preview-tags">
              <span class="badge neutral">${escapeHtml(item.channel)}</span>
              <span class="badge ${item.statusTone}">${escapeHtml(item.status)}</span>
              ${item.latestDeliveryState ? `<span class="badge ${deliveryTone(item.latestDeliveryState)}">${escapeHtml(`Reply ${humanizeLabel(item.latestDeliveryState)}`)}</span>` : ''}
              ${Array.isArray(item.previewBadges) ? item.previewBadges.map((badge) => `<span class="badge ${badge.tone}">${escapeHtml(badge.label)}</span>`).join('') : ''}
            </div>
          </div>
        </button>
      `
    )
    .join('');
}

export function renderContactRows(items) {
  return items
    .map(
      (item) => `
        <tr>
          <td><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.company)}</span><div class="tag-list section-gap-xs">${renderContactHealthBadges(item)}</div></td>
          <td><span class="badge neutral">${escapeHtml(item.stage)}</span></td>
          <td>${escapeHtml(item.owner)}${Array.isArray(item.metadata?.identities) && item.metadata.identities.length ? `<span>${escapeHtml(`${item.metadata.identities.length} linked channel${item.metadata.identities.length === 1 ? '' : 's'}${Array.isArray(item.linkedChannels) && item.linkedChannels.length ? ` · ${item.linkedChannels.join(', ')}` : ''}`)}</span>` : ''}</td>
          <td>${escapeHtml(item.lastSeen)}</td>
          <td>${escapeHtml(item.lifetime)}</td>
        </tr>
      `
    )
    .join('');
}

function normalizeLeadField(label = '') {
  return String(label || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pickLeadSourceLabel(lead = {}) {
  const source = String(
    lead.captured_from
    || lead.metadata?.source_label
    || lead.metadata?.channel
    || lead.source_provider
    || 'manual'
  );
  return formatProviderLabel(source);
}

function renderLeadMetaSummary(lead = {}) {
  const values = [];
  if (lead.email) values.push(lead.email);
  if (lead.phone_e164 || lead.phone) values.push(lead.phone_e164 || lead.phone);
  if (lead.company) values.push(lead.company);
  if (values.length) return values.map((value) => `<span>${escapeHtml(value)}</span>`).join('');

  const fieldData = Array.isArray(lead.metadata?.field_data) ? lead.metadata.field_data : [];
  const firstPopulatedField = fieldData.find((item) => item && (item.value || item.values));
  if (!firstPopulatedField) return '<span>No direct contact fields captured yet.</span>';
  const rawValue = Array.isArray(firstPopulatedField.values)
    ? firstPopulatedField.values.filter(Boolean).join(', ')
    : firstPopulatedField.value;
  return `<span>${escapeHtml(`${normalizeLeadField(firstPopulatedField.name || 'Field')}: ${rawValue || 'Captured'}`)}</span>`;
}

function renderLeadFieldBadges(lead = {}) {
  const fieldData = Array.isArray(lead.metadata?.field_data) ? lead.metadata.field_data : [];
  const labels = fieldData
    .map((item) => normalizeLeadField(item?.name || ''))
    .filter(Boolean)
    .slice(0, 4);
  return labels.length
    ? labels.map((label) => `<span class="badge neutral">${escapeHtml(label)}</span>`).join('')
    : '<span class="badge neutral">Meta fields pending</span>';
}

export function renderLeadRows(items = []) {
  return items
    .map((lead) => {
      const capturedAt = lead.updated_at || lead.created_at || '';
      const exactTimestamp = formatTimestamp(capturedAt);
      const relativeTimestamp = formatRelativeDate(capturedAt);
      const stage = String(lead.lead_stage || 'new');
      const sourceLabel = pickLeadSourceLabel(lead);
      const name = lead.name || lead.metadata?.full_name || 'Unnamed lead';
      const reason = lead.capture_reason || lead.metadata?.form_name || lead.metadata?.campaign_name || 'Meta lead captured';
      return `
        <tr>
          <td data-label="Lead">
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(reason)}</span>
          </td>
          <td data-label="Source">
            <span class="badge accent">${escapeHtml(sourceLabel)}</span>
            <div class="table-inline-meta">${renderLeadFieldBadges(lead)}</div>
          </td>
          <td data-label="Stage">
            <span class="badge ${toneFromPriority(stage)}">${escapeHtml(humanizeLabel(stage))}</span>
          </td>
          <td data-label="Contact">
            <div class="table-inline-stack">
              ${renderLeadMetaSummary(lead)}
            </div>
          </td>
          <td data-label="Captured">
            <div class="table-inline-stack">
              <time datetime="${escapeHtml(capturedAt)}" title="${escapeHtml(exactTimestamp)}">${escapeHtml(relativeTimestamp)}</time>
              <span>${escapeHtml(exactTimestamp)}</span>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

export function renderMessageThread(messages = []) {
  if (!messages.length) {
    return '<div class="mini-status muted">No messages synced for this conversation yet.</div>';
  }

  return messages
      .map((item) => {
        const isOutbound = String(item.direction || '').toLowerCase() === 'outbound';
        const deliveryState = String(item.delivery_state || item.raw_payload?.delivery_state || (isOutbound ? 'sent' : 'received')).toLowerCase();
        const receipts = Array.isArray(item.delivery_receipts)
          ? item.delivery_receipts
          : Array.isArray(item.raw_payload?.delivery_receipts)
            ? item.raw_payload.delivery_receipts
            : [];
        const providerResult = item.raw_payload?.provider_result || item.rawPayload?.provider_result || {};
        const providerLabel = formatProviderLabel(item.source_provider || item.raw_payload?.provider || item.raw_payload?.channel || '');
        const providerTransport = providerResult.transport || providerResult.providerTransport || '';
        const providerMessageId = providerResult.providerMessageId || item.external_message_id || '';
        const messageBody = extractMessageBody(item);
          const failureReason = extractDeliveryFailureReason(item);
          const failureCategory = classifyFailureReason(failureReason);
          const retryDiagnostics = buildRetryDiagnostics(messages);
        const providerDetail = isOutbound
          ? [providerLabel, providerTransport, providerMessageId ? `Provider ID ${String(providerMessageId).slice(0, 18)}` : ''].filter(Boolean).join(' · ')
          : [providerLabel].filter(Boolean).join(' · ');
        const receiptSummary = receipts.length
          ? receipts.slice(0, 3).map((receipt) => {
              const formatted = formatReceiptLabel(receipt);
              return `<span class="badge ${deliveryTone(formatted.state)}">${escapeHtml(formatted.label)}</span>`;
            }).join('')
        : '';
        const receiptTimeline = receipts.length
        ? `
          <div class="message-receipts">
            <span class="message-receipts-label">Receipt history</span>
            <div class="message-receipts-list">
              ${receipts.slice(0, 5).map((receipt) => {
                const formatted = formatReceiptLabel(receipt);
                const receiptId = receipt.id || receipt.provider_message_id || receipt.external_message_id || '';
                return `
                  <div class="message-receipt-item">
                    <span class="badge ${deliveryTone(formatted.state)}">${escapeHtml(formatted.label)}</span>
                    <span>${escapeHtml([formatted.happenedAt, receiptId ? `ID ${String(receiptId).slice(0, 12)}` : ''].filter(Boolean).join(' • '))}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `
        : '';
      return `
      <article class="message ${isOutbound ? 'agent' : 'customer'}">
        <div class="message-head">
          <strong>${escapeHtml(item.sender_name || (isOutbound ? 'AuraFlow' : 'Customer'))}</strong>
          <span class="message-head-meta">${renderDeliveryCheckmarks(deliveryState, isOutbound)}${escapeHtml(formatRelativeDate(item.created_at))}</span>
        </div>
          <p>${escapeHtml(messageBody)}</p>
        ${providerDetail ? `<div class="mini-status muted">${escapeHtml(providerDetail)}</div>` : ''}
        ${isOutbound && ['failed', 'error', 'undelivered'].includes(deliveryState) && failureReason ? `<div class="mini-status muted">${escapeHtml(`Failure reason: ${failureReason}`)}</div>` : ''}
        ${isOutbound && ['failed', 'error', 'undelivered'].includes(deliveryState) && failureCategory.label ? `<div class="mini-status muted">${escapeHtml(`Failure type: ${failureCategory.label}. ${failureCategory.guidance}`)}</div>` : ''}
        ${isOutbound && ['failed', 'error', 'undelivered', 'retrying'].includes(deliveryState) && retryDiagnostics.hasFailure ? `<div class="mini-status muted">${escapeHtml(`Retry status: ${retryDiagnostics.nextRetryMode}${retryDiagnostics.retryCount ? ` • ${retryDiagnostics.retryCount} prior ${retryDiagnostics.retryCount === 1 ? 'retry' : 'retries'}` : ''}${retryDiagnostics.lastRetryAt ? ` • last retry ${formatRelativeDate(retryDiagnostics.lastRetryAt)}` : ''}`)}</div>` : ''}
        <div class="preview-tags message-delivery-row">
            <span class="badge ${deliveryTone(deliveryState)}">${escapeHtml(isOutbound ? humanizeLabel(deliveryState || 'sent') : 'Received')}</span>
          ${providerLabel ? `<span class="badge ${isOutbound ? 'neutral' : 'muted'}">${escapeHtml(providerLabel)}</span>` : ''}
          ${isOutbound && item.external_message_id ? `<span class="badge muted">ID ${escapeHtml(String(item.external_message_id).slice(0, 12))}</span>` : ''}
          ${isOutbound ? receiptSummary : ''}
        </div>
        ${isOutbound ? receiptTimeline : ''}
      </article>
    `;
    })
    .join('');
}

export function renderActivityLog(items = []) {
  if (!items.length) {
    return '<div class="check-item"><span>-</span><div><strong>No activity yet</strong><span>Assignments and notes will appear here.</span></div></div>';
  }

  return items
    .slice(0, 8)
    .map((item) => `
      <div class="check-item">
        <span>${escapeHtml(String(item.event_type || 'event').slice(0, 2).toUpperCase())}</span>
        <div>
          <strong>${escapeHtml(humanizeLabel(item.event_type || 'event'))}</strong>
          <span>${escapeHtml((item.payload && (item.payload.note || item.payload.assigned_to || item.payload.status || item.payload.choiceLabel || item.payload.choice)) || 'Activity recorded on the thread.')}</span>
          <span>${escapeHtml(formatRelativeDate(item.created_at))}</span>
        </div>
      </div>
    `)
    .join('');
}

export function renderConversationInsights(conversation = {}, messages = [], activityEvents = [], channel = null) {
  const orderedMessages = Array.isArray(messages) ? messages.slice().sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime()) : [];
  const inboundCount = orderedMessages.filter((item) => String(item.direction || '').toLowerCase() === 'inbound').length;
  const outboundCount = orderedMessages.filter((item) => String(item.direction || '').toLowerCase() === 'outbound').length;
  const lastMessage = orderedMessages.at(-1) || null;
  const lastDirection = String(lastMessage?.direction || '').toLowerCase();
  const waitingLabel = lastDirection === 'outbound'
    ? 'Waiting on customer'
    : lastDirection === 'inbound'
      ? 'Waiting on team'
      : 'Waiting on activity';
  const latestDelivery = orderedMessages
    .filter((item) => String(item.direction || '').toLowerCase() === 'outbound')
    .map((item) => String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())
    .filter(Boolean)
    .at(-1) || '';
  const escalationCount = activityEvents.filter((item) => String(item.event_type || '').toLowerCase().includes('escal')).length;
  const owner = String(conversation?.assigned_to || '').trim() || 'Unassigned';
  const lastActiveAt = lastMessage?.created_at || conversation?.updated_at || conversation?.created_at || '';
  const ageHours = lastActiveAt ? (Date.now() - new Date(lastActiveAt).getTime()) / 3600000 : 0;
  const slaRisk = lastDirection === 'inbound' && ageHours >= 24
    ? 'SLA drift'
    : lastDirection === 'inbound' && ageHours >= 4
      ? 'Needs follow-up'
      : 'Within window';
  const replyTargetStatus = String(conversation?.reply_target_status || '').toLowerCase();
  const replyTargetNote = String(conversation?.reply_target_note || '').trim();
  const webhookState = String(channel?.webhook_state || '').toLowerCase();
  const lastWebhookAt = channel?.external_metadata?.last_webhook_at || channel?.last_webhook_at || '';
  const lastProviderEvent = channel?.external_metadata?.last_provider_event || '';
  const sendState = summarizeSendState(orderedMessages);
  const retryDiagnostics = buildRetryDiagnostics(orderedMessages);
  const failureCategory = classifyFailureReason(retryDiagnostics.failureReason);
  const insightItems = [
    {
      label: 'Thread health',
      value: waitingLabel,
      tone: lastDirection === 'inbound' ? 'warning' : 'success',
      note: lastMessage?.created_at ? `Last message ${formatRelativeDate(lastMessage.created_at)}` : 'No message timestamps yet.'
    },
    {
      label: 'Message flow',
      value: `${inboundCount} in / ${outboundCount} out`,
      tone: outboundCount > 0 ? 'accent' : 'neutral',
      note: inboundCount ? 'Conversation history is live in the workspace.' : 'Waiting for the first inbound message.'
    },
      {
        label: 'Reply delivery',
        value: sendState.label,
        tone: sendState.tone,
        note: sendState.note
      },
    {
      label: 'Reply readiness',
      value: replyTargetStatus === 'ready'
        ? 'Reply ready'
        : replyTargetStatus === 'placeholder'
          ? 'Test thread'
          : replyTargetStatus === 'missing'
            ? 'Routing missing'
            : 'Checking',
      tone: replyTargetStatus === 'ready' ? 'success' : replyTargetStatus ? 'warning' : 'neutral',
        note: replyTargetNote || 'This tells the operator whether this thread can be replied to safely right now.'
      },
    {
      label: 'Provider signal',
      value: webhookState === 'verified'
        ? 'Webhook verified'
        : webhookState
          ? humanizeLabel(webhookState)
          : 'No signal yet',
      tone: webhookState === 'verified' ? 'success' : webhookState ? 'accent' : 'neutral',
      note: lastWebhookAt
        ? `Last provider signal ${formatRelativeDate(lastWebhookAt)}${lastProviderEvent ? ` via ${lastProviderEvent}` : ''}`
        : 'No recent provider callback has been stamped on this channel yet.'
    },
    {
      label: 'Owner coverage',
      value: owner,
      tone: owner === 'Unassigned' ? 'warning' : 'success',
      note: owner === 'Unassigned'
        ? 'Assign an owner so escalations and follow-ups land with someone specific.'
        : 'This thread has a named owner for handoff and escalation accountability.'
    },
    {
      label: 'Escalations and SLA',
      value: escalationCount ? `${escalationCount} logged` : slaRisk,
      tone: escalationCount || slaRisk !== 'Within window' ? 'warning' : 'success',
      note: escalationCount
        ? 'This thread already has escalation history.'
        : slaRisk === 'SLA drift'
          ? 'Customer is still waiting and the response window is slipping.'
          : slaRisk === 'Needs follow-up'
            ? 'Customer is waiting and this thread should be reviewed soon.'
            : 'No escalation events recorded and the thread is still within the response window.'
    },
    {
      label: 'Retry diagnostics',
        value: retryDiagnostics.hasFailure
          ? retryDiagnostics.nextRetryMode
          : 'No retry pressure',
        tone: retryDiagnostics.hasFailure ? 'warning' : 'success',
        note: retryDiagnostics.hasFailure
          ? `${failureCategory.label ? `${failureCategory.label}. ${failureCategory.guidance} ` : ''}${retryDiagnostics.failureReason ? `${retryDiagnostics.failureReason}. ` : ''}${retryDiagnostics.retryCount ? `${retryDiagnostics.retryCount} retr${retryDiagnostics.retryCount === 1 ? 'y has' : 'ies have'} already been attempted.` : 'No retry has been attempted yet.'}${retryDiagnostics.lastRetryAt ? ` Last retry ${formatRelativeDate(retryDiagnostics.lastRetryAt)}.` : ''}`
          : 'No failed outbound reply is currently waiting for a retry decision.'
      }
  ];

  return insightItems.map((item) => `
    <div class="mini-chart-card conversation-insight-card">
      <span class="eyebrow">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <span class="badge ${item.tone}">${escapeHtml(item.tone === 'warning' ? 'Needs attention' : item.tone === 'success' ? 'Healthy' : item.tone === 'accent' ? 'Live' : 'Idle')}</span>
      <span>${escapeHtml(item.note)}</span>
    </div>
  `).join('');
}

export function renderReplyGuidance(conversation = {}, messages = []) {
  const channel = String(conversation.source || conversation.channel || '').toLowerCase();
  const orderedMessages = Array.isArray(messages) ? messages.slice().sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime()) : [];
  const lastInbound = orderedMessages.filter((item) => String(item.direction || '').toLowerCase() === 'inbound').at(-1);
  const replyTargetStatus = String(conversation?.reply_target_status || '').toLowerCase();
  const guidance = channel === 'whatsapp'
    ? {
        title: 'WhatsApp reply guidance',
        note: lastInbound
          ? `Customer last replied ${formatRelativeDate(lastInbound.created_at)}. Free-form replies are in the best position to deliver now.`
          : 'Send a fresh inbound WhatsApp message first if delivery becomes inconsistent.',
        detail: 'Watch the receipt history below the thread for sent, delivered, and read updates.'
      }
    : channel === 'gmail' || channel === 'email'
      ? {
          title: 'Gmail reply guidance',
          note: 'Outbound Gmail send is live from AuraFlow.',
          detail: 'Inbound auto-sync still depends on Gmail watch plus the Pub/Sub relay staying healthy.'
        }
      : channel === 'instagram'
        ? {
            title: 'Instagram reply guidance',
            note: replyTargetStatus === 'ready'
              ? 'This Instagram thread has a real Twilio Conversation SID and is ready for a live reply test.'
              : 'Outbound Instagram DMs still need a real inbound Twilio conversation before replies can be sent.',
            detail: replyTargetStatus === 'placeholder'
              ? 'This selected thread is still a test-only thread. Wait for a real DM to arrive through Twilio before testing replies.'
              : 'Use a genuine inbound DM thread so AuraFlow can capture the Twilio Conversation SID for replies.'
          }
        : channel === 'messenger' || channel === 'facebook'
          ? {
              title: 'Messenger reply guidance',
              note: replyTargetStatus === 'ready'
                ? 'This Messenger thread has a real Twilio Conversation SID and is ready for a live reply test.'
                : 'Messenger send uses Twilio Conversations and expects a real inbound conversation.',
              detail: replyTargetStatus === 'placeholder'
                ? 'This selected thread is still a test-only thread. Wait for a real customer message to land through Twilio.'
                : 'Best verification is to reply directly to a customer who already messaged the channel connected in Twilio.'
            }
          : {
              title: 'Reply guidance',
              note: 'Use the latest AI draft or write a manual reply, then watch the thread for delivery updates.',
              detail: 'Handoff and internal note actions will keep the timeline clean for the next operator.'
            };

  return `
    <div class="check-item">
      <span>GO</span>
      <div>
        <strong>${escapeHtml(guidance.title)}</strong>
        <span>${escapeHtml(guidance.note)}</span>
        <span>${escapeHtml(guidance.detail)}</span>
      </div>
      <span class="badge accent">Operator cue</span>
    </div>
  `;
}

export function renderThreadWorkflowPanel(conversation = {}, workflowJobs = [], sequences = []) {
  const conversationId = String(conversation?.id || '').trim();
  if (!conversationId) {
    return '<div class="mini-status muted">Thread workflow coverage will appear here once a thread is selected.</div>';
  }

  const relatedJobs = (Array.isArray(workflowJobs) ? workflowJobs : []).filter((job) => {
    const payloadConversationId = String(job?.payload?.conversationId || job?.payload?.conversation_id || '').trim();
    return payloadConversationId && payloadConversationId === conversationId;
  });
  const providerKey = String(conversation?.source_provider || conversation?.source || '').toLowerCase();
  const matchingSequences = (Array.isArray(sequences) ? sequences : []).filter((sequence) => {
    const channel = String(sequence?.channel || '').toLowerCase();
    return !channel || channel.includes(providerKey) || providerKey.includes(channel);
  });

  const counts = relatedJobs.reduce((acc, item) => {
    const status = String(item.status || 'queued').toLowerCase();
    acc.total += 1;
    acc[status] = Number(acc[status] || 0) + 1;
    return acc;
  }, { total: 0 });

  const topJobs = relatedJobs.slice(0, 3).map((item) => {
    const status = String(item.status || 'queued').toLowerCase();
    const tone = status === 'completed' ? 'success' : status === 'escalated' ? 'warning' : status === 'assigned' ? 'neutral' : 'accent';
    const detail = item?.payload?.recommendation || item?.payload?.note || item?.payload?.handoffReason || item?.payload?.followUpTiming || 'Workflow step queued for this thread.';
    return `
      <div class="check-item">
        <span>${escapeHtml(String(item.type || 'wf').slice(0, 2).toUpperCase())}</span>
        <div>
          <strong>${escapeHtml(humanizeLabel(item.type || 'workflow'))}</strong>
          <span>${escapeHtml(detail)}</span>
          <span>${escapeHtml([
            item.assigned_to ? `Owner: ${item.assigned_to}` : 'Unassigned',
            item.created_at ? `Queued ${formatRelativeDate(item.created_at)}` : ''
          ].filter(Boolean).join(' · '))}</span>
        </div>
        <span class="badge ${tone}">${escapeHtml(humanizeLabel(status))}</span>
      </div>
    `;
  }).join('');

  const sequenceSummary = matchingSequences.length
    ? `
      <div class="detail-meta compact section-gap-xs">
        <div><span>Matching sequences</span><strong>${matchingSequences.length}</strong></div>
        <div><span>Active</span><strong>${matchingSequences.filter((item) => String(item.status || '').toLowerCase() === 'active').length}</strong></div>
        <div><span>Channel fit</span><strong>${escapeHtml(providerKey || 'mixed')}</strong></div>
      </div>
      <div class="mini-status muted section-gap-xs">Top sequence: ${escapeHtml(matchingSequences[0]?.name || 'Sequence engine ready')}.</div>
    `
    : renderEmptyState(
      'No channel-matched sequence yet',
      'Save a follow-up sequence for this channel mix so the thread can move into automation when it is ready.',
      'compact section-gap-xs'
    );

  return `
    <div class="panel-head compact">
      <div>
        <p class="eyebrow">Thread workflow</p>
        <h3>Queue and next-step coverage</h3>
      </div>
      <div class="composer-actions">
        <button class="ghost-button compact" type="button" data-action="create-ai-workflow-job" data-choice="follow_up">AI follow-up</button>
        <button class="ghost-button compact" type="button" data-action="create-ai-workflow-job" data-choice="assign">AI assign</button>
        <button class="ghost-button compact" type="button" data-action="create-ai-workflow-job" data-choice="handoff">AI handoff</button>
      </div>
    </div>
    <div class="detail-meta compact">
      <div><span>Total jobs</span><strong>${Number(counts.total || 0)}</strong></div>
      <div><span>Queued</span><strong>${Number(counts.queued || 0)}</strong></div>
      <div><span>Assigned</span><strong>${Number(counts.assigned || 0)}</strong></div>
      <div><span>Escalated</span><strong>${Number(counts.escalated || 0)}</strong></div>
    </div>
    <div class="mini-status muted section-gap-xs">Use the AI actions after summary/classification to push this specific thread into follow-up, assignment, or handoff workflow.</div>
    <div class="source-list section-gap-xs">
      ${topJobs || renderEmptyState('No workflow jobs attached', 'This thread has not been pushed into follow-up, assignment, or handoff yet.', 'compact')}
    </div>
    ${sequenceSummary}
  `;
}

export function renderThreadPrioritySummary(conversation = {}) {
  if (!conversation?.id) {
    return 'Priority reasoning will appear here once a thread is selected.';
  }

  const reasons = [];
  if (conversation.escalatedUnassigned) {
    reasons.push('This thread is escalated and still has no owner, so it is treated as top priority.');
  }
  if (conversation.oldestWaitingInbound) {
    reasons.push(`The customer has been waiting on the team for roughly ${Math.max(1, Math.round(conversation.ageHours || 0))} hours.`);
  }
  if (conversation.slaRisk) {
    reasons.push(`The latest inbound lead message is older than 15 minutes and still has no reply.`);
  }
  if (conversation.verifiedNoOwner) {
    reasons.push('The provider path is verified live, but the thread still has no owner assigned.');
  }
  if (conversation.workflowCounts?.total) {
    reasons.push(`${Number(conversation.workflowCounts.total)} workflow item${Number(conversation.workflowCounts.total) === 1 ? '' : 's'} are already attached to this conversation.`);
  }
  if (!reasons.length && conversation.needsAttention) {
    reasons.push('This thread is still active in the queue and needs operator attention.');
  }
  if (!reasons.length) {
    reasons.push('This thread is currently in a healthy state and is being shown mainly by recency.');
  }

  return reasons.join(' ');
}

export function renderReplyComposerStatus(conversation = {}) {
  if (!conversation?.id) {
    return 'Send now publishes immediately. Queue for later stores the draft as queued work.';
  }

  const notes = [];
  const replyTargetStatus = String(conversation.reply_target_status || '').toLowerCase();
  const latestDeliveryState = String(conversation.latestDeliveryState || '').toLowerCase();

  if (conversation.escalatedUnassigned) {
    notes.push('This thread is escalated and unassigned. Give it an owner before sending.');
  } else if (conversation.escalationCount > 0) {
    notes.push('This thread already has escalation history. Keep the reply aligned with the handoff context.');
  }

  if (conversation.unassigned && !conversation.escalatedUnassigned) {
    notes.push('No owner is assigned yet.');
  }

  if (conversation.verifiedNoOwner) {
    notes.push('Provider path is verified live, but the thread still has no owner.');
  }
  if (conversation.slaRisk) {
    notes.push('This thread is now in the high-priority SLA lane until the team replies.');
  }

  if (replyTargetStatus === 'placeholder') {
    notes.push('This is a test-only thread. Do not expect a live Meta delivery from it.');
  } else if (replyTargetStatus === 'missing') {
    notes.push('Reply routing is missing. Confirm the target before sending.');
  } else if (replyTargetStatus === 'ready') {
    notes.push('Reply routing is ready for this thread.');
  }

  if (['failed', 'error'].includes(latestDeliveryState)) {
    notes.push('The last send failed. Use Retry failed after checking the destination.');
  } else if (latestDeliveryState === 'queued') {
    notes.push('The latest draft is queued, not delivered yet.');
  } else if (latestDeliveryState === 'retrying') {
    notes.push('The latest outbound reply is still retrying.');
  }

  if (!notes.length) {
    notes.push('Send now publishes immediately. Queue for later stores the draft as queued work.');
  }

  return notes.join(' ');
}

export function renderAiOperatorLane(conversation = {}) {
  if (!conversation?.id) {
    return `
      <div class="check-item">
        <span>AI</span>
        <div>
          <strong>AI lane pending</strong>
          <span>Select a thread to see whether AI should reply, hand off, assign, or push follow-up.</span>
        </div>
        <span class="badge neutral">Waiting</span>
      </div>
    `;
  }

  const replyTargetStatus = String(conversation.reply_target_status || '').toLowerCase();
  const workflowQueued = Number(conversation.workflowCounts?.total || 0) > 0;

  let title = 'Direct reply is the right lane';
  let note = 'Use summarize or draft reply first, then send or queue a response from this thread.';
  let tone = 'success';

  if (conversation.escalatedUnassigned) {
    title = 'Ownership first, then handoff';
    note = 'This thread is escalated and still unassigned. Save an owner before relying on AI to draft the next move.';
    tone = 'warning';
  } else if (replyTargetStatus === 'placeholder') {
    title = 'Follow-up or handoff, not direct send';
    note = 'This is a test-only thread. Use AI for summary and workflow guidance, not a live reply.';
    tone = 'warning';
  } else if (replyTargetStatus === 'missing') {
    title = 'Routing first';
    note = 'AI can still summarize and classify, but fix reply routing before using a generated response.';
    tone = 'warning';
  } else if (conversation.verifiedNoOwner) {
    title = 'Assign ownership before replying';
    note = 'The provider path is live, but nobody owns this thread yet. Assign first so the AI output has a clear operator home.';
    tone = 'accent';
  } else if (conversation.slaRisk) {
    title = 'Reply now to protect the SLA';
    note = 'This inbound lead has crossed the 15-minute threshold without a reply and should stay at the top of the queue.';
    tone = 'warning';
  } else if (conversation.oldestWaitingInbound) {
    title = 'Direct reply should move now';
    note = 'This is one of the oldest waiting inbound threads. Generate a concise reply or next action immediately.';
    tone = 'warning';
  } else if (workflowQueued) {
    title = 'Workflow already attached';
    note = 'A follow-up, assignment, or handoff job already exists for this thread. Use AI to support that path rather than starting from scratch.';
    tone = 'accent';
  } else if (conversation.unassigned) {
    title = 'Assign or reply';
    note = 'This thread is workable, but the next best move is to either assign it or send a direct AI-assisted reply with clear ownership.';
    tone = 'accent';
  }

  const label = tone === 'warning' ? 'Priority cue' : tone === 'accent' ? 'Operator cue' : 'Ready';

  return `
    <div class="check-item">
      <span>AI</span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(note)}</span>
      </div>
      <span class="badge ${tone}">${escapeHtml(label)}</span>
    </div>
  `;
}

function renderProviderGridLegacy(providers = [], channels = []) {
  if (!providers.length) {
    return '<div class="mini-status muted">No provider readiness detected yet.</div>';
  }

  const channelsByProvider = new Map(channels.map((item) => [String(item.provider || '').toLowerCase(), item]));
  const productionCounts = providers.reduce((acc, provider) => {
    if (provider.outboundReady) acc.outbound += 1;
    if (provider.inboundReady) acc.inbound += 1;
    if (provider.outboundImplemented) acc.adapter += 1;
    return acc;
  }, { outbound: 0, inbound: 0, adapter: 0 });
  const totals = providers.reduce((acc, provider) => {
    const channel = channelsByProvider.get(String(provider.provider || '').toLowerCase());
    const liveStatus = String(channel?.status || (provider.configured ? 'configured' : 'missing')).toLowerCase();
    if (liveStatus === 'live') acc.live += 1;
    else if (liveStatus === 'configured') acc.configured += 1;
    else if (liveStatus === 'paused') acc.paused += 1;
    else acc.missing += 1;
    return acc;
  }, { live: 0, configured: 0, paused: 0, missing: 0 });

  const attention = providers
    .filter((provider) => !channelsByProvider.has(String(provider.provider || '').toLowerCase()) || !provider.configured)
    .slice(0, 2)
    .map((provider) => provider.label)
    .join(' - ');
  const issueBadges = providers
    .filter((provider) => {
      const channel = channelsByProvider.get(String(provider.provider || '').toLowerCase());
      const liveStatus = String(channel?.status || (provider.configured ? 'configured' : 'missing')).toLowerCase();
      const operationalStatus = String(provider.operationalStatus || '').toLowerCase() || (provider.configured ? 'connected' : 'token_missing');
      return ['token_missing', 'webhook_stale'].includes(operationalStatus) || ['missing', 'paused', 'needs_review'].includes(liveStatus);
    })
    .slice(0, 3)
    .map((provider) => {
      const channel = channelsByProvider.get(String(provider.provider || '').toLowerCase());
      const liveStatus = String(channel?.status || (provider.configured ? 'configured' : 'missing')).toLowerCase();
      const operationalStatus = String(provider.operationalStatus || '').toLowerCase() || (provider.configured ? 'connected' : 'token_missing');
      const label = operationalStatus === 'token_missing'
        ? 'token missing'
        : operationalStatus === 'webhook_stale'
          ? 'webhook stale'
          : liveStatus;
      return `<span class="badge warning">${escapeHtml(provider.label)}: ${escapeHtml(label)}</span>`;
    })
    .join('');
  const rolloutPlan = providers.map((provider) => provider.label).filter(Boolean).join(' → ');
  const summary = `
    <div class="detail-meta compact">
      <div><span>Live</span><strong>${totals.live}</strong></div>
      <div><span>Configured</span><strong>${totals.configured}</strong></div>
      <div><span>Paused</span><strong>${totals.paused}</strong></div>
      <div><span>Missing</span><strong>${totals.missing}</strong></div>
    </div>
    <div class="detail-meta compact" style="margin-top: 12px;">
      <div><span>Outbound ready</span><strong>${productionCounts.outbound}</strong></div>
      <div><span>Inbound ready</span><strong>${productionCounts.inbound}</strong></div>
      <div><span>Adapters wired</span><strong>${productionCounts.adapter}</strong></div>
      <div><span>Workspace auth</span><strong>${providers.filter((provider) => provider.manualSetupMode === false).length}</strong></div>
    </div>
    <div class="mini-status muted">${rolloutPlan ? `Rollout order: ${escapeHtml(rolloutPlan)}` : 'Rollout order will appear once providers are configured.'}</div>
    <div class="mini-status muted">${attention ? `Attention: ${escapeHtml(attention)}` : 'All provider readiness items are accounted for.'}</div>
    ${issueBadges ? `<div class="tag-list">${issueBadges}</div>` : ''}
  `;

  return `${summary}${providers.map((provider) => {
    const channel = channelsByProvider.get(String(provider.provider || '').toLowerCase());
    const liveStatus = channel?.status || (provider.configured ? 'configured' : 'missing');
    const operationalStatus = String(provider.operationalStatus || '').toLowerCase() || (provider.configured ? 'connected' : 'token_missing');
    const relaySetup = channel?.external_metadata?.relay_setup || {};
    const relayStatus = String(relaySetup.relay_status || '').toLowerCase();
    const lastWebhookAt = channel?.external_metadata?.last_webhook_at || '';
    const lastProviderEvent = channel?.external_metadata?.last_provider_event || '';
    const webhookVerification = channel?.external_metadata?.last_webhook_verification || channel?.external_metadata?.webhook_status || '';
    const outboundReady = Boolean(provider.outboundReady);
    const inboundReady = Boolean(provider.inboundReady);
    const outboundImplemented = provider.outboundImplemented !== false;
    const verificationMode = provider.verificationMode || 'manual verification';
    const badgeTone = operationalStatus === 'connected'
      ? 'success'
      : operationalStatus === 'watch_registered' || operationalStatus === 'oauth_connected'
        ? 'accent'
        : operationalStatus === 'pending_binding'
          ? 'accent'
          : 'warning';
    const statusLabel = operationalStatus === 'connected'
        ? 'Live now'
      : operationalStatus === 'watch_registered'
          ? 'Inbound watch ready'
      : operationalStatus === 'oauth_connected'
          ? 'Connected, finishing setup'
      : operationalStatus === 'pending_binding'
          ? 'Asset link pending'
      : operationalStatus === 'needs_review'
        ? 'Needs review'
      : operationalStatus === 'webhook_stale'
          ? 'Webhook needs refresh'
          : 'Setup incomplete';
    const connectedAccountLabel = provider.connectionDisplayName || provider.externalAccountLabel || '';
    const externalAccountId = channel?.provider_account_id || provider.externalAccountId || '';
    const sublabel = connectedAccountLabel || externalAccountId || 'No account linked yet';
    const readinessNote = channel?.external_metadata?.readiness_note || channel?.external_metadata?.notes || '';
    const relayLabel = relayStatus === 'verified'
      ? 'Relay verified'
      : relayStatus === 'connecting'
        ? 'Relay connecting'
        : relayStatus === 'needs_review'
          ? 'Relay needs review'
          : relaySetup.callback_url
            ? 'Relay saved'
            : 'Relay not saved';
    const nextAction = operationalStatus === 'token_missing'
        ? 'Add the missing setup values before this provider can go live.'
      : operationalStatus === 'pending_binding'
          ? 'Finish the Twilio channel mapping and webhook target before running live traffic.'
      : operationalStatus === 'oauth_connected'
          ? 'Connection is in place. Finish verification and sync before marking it live.'
      : operationalStatus === 'needs_review'
        ? 'Review the saved connection and finish the missing provider binding or verification steps.'
      : operationalStatus === 'webhook_stale'
          ? 'Refresh the webhook or verify token so inbound events can resume.'
      : liveStatus === 'missing'
          ? 'Connect the provider to start syncing.'
          : liveStatus === 'paused'
            ? 'Reconnect to resume sync.'
            : liveStatus === 'needs_review'
            ? 'Review the readiness note before marking live.'
              : 'Provider is live and syncing inside AuraFlow.';
    const channelSpecificNote = provider.provider === 'instagram'
      ? 'Instagram webhook intake is wired through Twilio Conversations and will go live as soon as you link the Instagram account in Twilio and receive the first real thread.'
      : provider.provider === 'messenger'
        ? 'Messenger webhook intake is wired through Twilio Conversations and will go live as soon as you link the Messenger account in Twilio and receive the first real thread.'
        : provider.provider === 'gmail'
          ? 'Gmail inbound and outbound are both verified through the workspace connection and Pub/Sub relay.'
        : provider.provider === 'whatsapp'
            ? 'WhatsApp inbound is expected through Twilio Conversations, and outbound now uses the registered production sender plus approved templates.'
            : '';
    const realityState = provider.provider === 'gmail'
      ? { label: 'Live and verified', tone: 'success', note: 'Real Gmail inbound sync and outbound send are both working in AuraFlow.' }
      : provider.provider === 'whatsapp'
        ? { label: 'Live and verified', tone: 'success', note: 'Real WhatsApp inbound and outbound are both working in AuraFlow.' }
        : provider.provider === 'instagram'
          ? { label: 'Twilio wiring ready', tone: 'accent', note: 'Webhook validation is ready. Link Instagram in Twilio and the first real thread will make the channel reply-safe.' }
          : provider.provider === 'messenger'
            ? { label: 'Twilio wiring ready', tone: 'accent', note: 'Webhook validation is ready. Link Messenger in Twilio and the first real thread will make the channel reply-safe.' }
            : { label: 'In progress', tone: 'neutral', note: 'Provider state will sharpen as more live traffic arrives.' };
    const detail = provider.manualSetupMode === false
      ? `Workspace connection active${connectedAccountLabel ? ` - ${connectedAccountLabel}` : externalAccountId ? ` - ${externalAccountId}` : ''}`
      : provider.configured
        ? `Configured${provider.externalAccountId ? ` - ${provider.externalAccountId}` : ''}`
        : `Missing: ${provider.missing.join(', ')}`;
    const healthNote = provider.statusReason || readinessNote || nextAction;
    const credentialLabel = provider.manualSetupMode === false
      ? 'Workspace connected'
      : provider.configured
        ? 'Platform configured'
        : 'Token missing';
    const webhookLabel = operationalStatus === 'connected'
      ? 'Inbound healthy'
      : operationalStatus === 'watch_registered'
        ? 'Inbound watch active'
      : operationalStatus === 'oauth_connected'
        ? 'Connection active'
      : operationalStatus === 'pending_binding'
        ? 'Linking still needed'
      : operationalStatus === 'webhook_stale'
        ? 'Inbound needs refresh'
        : 'Inbound not ready';
    const credentialTone = provider.configured ? 'success' : 'warning';
    const webhookTone = operationalStatus === 'connected'
      ? 'success'
      : operationalStatus === 'watch_registered' || operationalStatus === 'oauth_connected' || operationalStatus === 'pending_binding'
        ? 'accent'
        : 'warning';
    const rolloutLabel = provider.rolloutPriority
      ? `Rollout ${provider.rolloutPriority}`
      : 'Rollout pending';
    const connectLabel = provider.provider === 'gmail'
      ? (provider.manualSetupMode === false ? 'Reconnect Gmail' : 'Connect Gmail')
      : provider.manualSetupMode === false
        ? 'Reconnect Twilio'
        : provider.configured
          ? 'Review setup'
          : provider.connectLabel || 'Open setup';
    const credentialsReady = provider.manualSetupMode === false || Boolean(provider.configured);
    const webhookReady = operationalStatus === 'connected' || relayStatus === 'verified' || Boolean(lastWebhookAt);
    const syncReady = ['configured', 'live'].includes(String(liveStatus || '').toLowerCase()) && (credentialsReady || webhookReady);
    const checklistItems = [
      {
        done: credentialsReady,
        title: 'Credentials',
        note: provider.manualSetupMode === false
          ? 'This workspace has an OAuth connection stored for the provider.'
          : credentialsReady
            ? 'Platform-level app credentials are present.'
            : 'Add the required platform credentials first.'
      },
      {
        done: webhookReady,
        title: 'Webhook',
        note: webhookReady ? 'Callback path has been verified or exercised.' : 'Run a callback test or finish webhook verification.'
      },
      {
        done: syncReady,
        title: 'Workspace sync',
        note: syncReady ? 'Channel is ready to sync into Supabase.' : provider.manualSetupMode === false ? 'Finish channel sync and readiness checks for this workspace.' : 'Save setup, then sync the provider into the workspace.'
      },
      {
        done: outboundImplemented,
        title: 'Outbound adapter',
        note: outboundImplemented ? 'The code path for outbound send is wired in AuraFlow.' : 'This provider still needs outbound transport implementation.'
      },
      {
        done: outboundReady,
        title: 'Outbound verification',
        note: outboundReady ? 'Credentials and identifiers are in place for live send tests.' : provider.manualSetupMode === false ? 'Connection exists, but the remaining send prerequisites are still missing.' : 'Finish setup before running live outbound tests.'
      },
      {
        done: inboundReady,
        title: 'Inbound verification',
        note: inboundReady ? `Inbound path is wired through ${verificationMode}.` : `Finish ${verificationMode} setup before expecting live inbound sync.`
      }
    ];
    const connectionModeBadge = provider.manualSetupMode === false
      ? '<span class="badge accent">Workspace connected</span>'
      : '<span class="badge neutral">Platform setup</span>';
    const readinessBadges = [
      `<span class="badge ${outboundImplemented ? 'success' : 'warning'}">${escapeHtml(outboundImplemented ? 'Adapter wired' : 'Adapter missing')}</span>`,
      connectionModeBadge,
      `<span class="badge ${outboundReady ? 'success' : 'warning'}">${escapeHtml(outboundReady ? 'Reply path ready' : 'Reply path blocked')}</span>`,
      `<span class="badge ${inboundReady ? 'success' : 'warning'}">${escapeHtml(inboundReady ? 'Inbound ready' : 'Inbound still blocked')}</span>`,
      provider.recipientRequirement ? `<span class="badge ${provider.provider === 'instagram' || provider.provider === 'messenger' ? 'accent' : 'neutral'}">${escapeHtml(humanizeLabel(provider.recipientRequirement))}</span>` : ''
    ].filter(Boolean).join('');
    const missingList = Array.isArray(provider.missing) && provider.missing.length
      ? `<div class="source-list">
          ${provider.missing.map((item) => `
            <div class="check-item">
              <span>~</span>
              <div>
                <strong>${escapeHtml(item)}</strong>
                <span>Add this env value before marking the provider production-ready.</span>
              </div>
            </div>
          `).join('')}
        </div>`
      : '';
    return `
      <article class="integration-card ${provider.configured ? 'deployed' : ''}">
        <div class="integration-head"><strong>${escapeHtml(provider.label)}</strong><span>${escapeHtml(sublabel)}</span></div>
        <span class="badge ${badgeTone}">${escapeHtml(statusLabel)}</span>
        <p>${escapeHtml(detail)}</p>
        <div class="tag-list">
          <span class="badge ${credentialTone}">${escapeHtml(credentialLabel)}</span>
          <span class="badge ${webhookTone}">${escapeHtml(webhookLabel)}</span>
          <span class="badge neutral">${escapeHtml(rolloutLabel)}</span>
          <span class="badge ${relayStatus === 'verified' ? 'success' : 'warning'}">${escapeHtml(relayLabel)}</span>
          <span class="badge ${realityState.tone}">${escapeHtml(realityState.label)}</span>
        </div>
        <div class="tag-list">${readinessBadges}</div>
        ${provider.manualSetupMode === false ? `
          <div class="detail-meta compact" style="margin-top: 12px;">
            <div><span>Connection</span><strong>${escapeHtml(humanizeLabel(provider.connectionState || 'connected'))}</strong></div>
            <div><span>Account</span><strong>${escapeHtml(connectedAccountLabel || 'Linked')}</strong></div>
            <div><span>External id</span><strong>${escapeHtml(externalAccountId || provider.connectionId || 'Stored')}</strong></div>
            <div><span>Auth mode</span><strong>Workspace OAuth</strong></div>
          </div>
        ` : ''}
        <div class="mini-status muted">${escapeHtml(healthNote)}</div>
        <div class="mini-status muted">${escapeHtml(realityState.note)}</div>
        <div class="mini-status muted">${escapeHtml(nextAction)}</div>
        ${channelSpecificNote ? `<div class="mini-status muted">${escapeHtml(channelSpecificNote)}</div>` : ''}
        ${provider.recipientHint ? `<div class="mini-status muted">${escapeHtml(provider.recipientHint)}</div>` : ''}
        ${provider.rolloutNote ? `<div class="mini-status muted">${escapeHtml(provider.rolloutNote)}</div>` : ''}
        ${relaySetup.callback_url ? `
          <div class="mini-status muted" style="margin-top: 8px;">Callback:</div>
          <div class="url-pill compact-pill">
            <span class="url-pill-text" title="${escapeHtml(relaySetup.callback_url)}">${escapeHtml(relaySetup.callback_url)}</span>
          </div>
        ` : ''}
        ${relaySetup.last_webhook_test_at ? `<div class="mini-status muted">Last webhook test: ${escapeHtml(relaySetup.last_webhook_test_at)}</div>` : ''}
        ${lastWebhookAt ? `<div class="mini-status muted">Last webhook: ${escapeHtml(lastWebhookAt)}</div>` : ''}
        ${lastProviderEvent ? `<div class="mini-status muted">Last event: ${escapeHtml(lastProviderEvent)}</div>` : ''}
        ${webhookVerification ? `<div class="mini-status muted">Webhook verification: ${escapeHtml(webhookVerification)}</div>` : ''}
        <div class="source-list">
          ${checklistItems.map((item) => `
            <div class="check-item">
              <span>${item.done ? 'OK' : '~'}</span>
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.note)}</span>
              </div>
            </div>
          `).join('')}
        </div>
        ${missingList}
        <div class="modal-grid compact provider-editor-grid">
          <label><span>Status</span>
            <select data-channel-status="${escapeHtml(provider.provider)}">
              <option value="configured" ${liveStatus === 'configured' ? 'selected' : ''}>Configured</option>
              <option value="live" ${liveStatus === 'live' ? 'selected' : ''}>Live</option>
              <option value="paused" ${liveStatus === 'paused' ? 'selected' : ''}>Paused</option>
              <option value="needs_review" ${liveStatus === 'needs_review' ? 'selected' : ''}>Needs review</option>
            </select>
          </label>
          <label><span>Readiness note</span><textarea rows="3" data-channel-note="${escapeHtml(provider.provider)}" placeholder="Add channel readiness notes">${escapeHtml(readinessNote)}</textarea></label>
        </div>
        <div class="composer-actions">
          <button class="ghost-button compact" type="button" data-provider-connect="${escapeHtml(provider.provider)}">${escapeHtml(connectLabel)}</button>
          <button class="primary-button compact" type="button" data-action="save-channel-readiness" data-provider-key="${escapeHtml(provider.provider)}">Save readiness</button>
          <button class="ghost-button compact" type="button" data-action="reset-provider-relay" data-provider-key="${escapeHtml(provider.provider)}">Reset relay</button>
        </div>
      </article>
    `;
  }).join('')}`;
}

export function renderProviderGrid(providers = [], channels = []) {
  if (!providers.length) {
    return '<div class="mini-status muted">No provider readiness detected yet.</div>';
  }

  const channelsByProvider = new Map(channels.map((item) => [String(item.provider || '').toLowerCase(), item]));
  const productionCounts = providers.reduce((acc, provider) => {
    if (provider.outboundReady) acc.outbound += 1;
    if (provider.inboundReady) acc.inbound += 1;
    return acc;
  }, { outbound: 0, inbound: 0 });
  const totals = providers.reduce((acc, provider) => {
    const channel = channelsByProvider.get(String(provider.provider || '').toLowerCase());
    const liveStatus = String(channel?.status || (provider.configured ? 'configured' : 'missing')).toLowerCase();
    if (liveStatus === 'live') acc.live += 1;
    else if (liveStatus === 'configured') acc.configured += 1;
    else if (liveStatus === 'paused') acc.paused += 1;
    else acc.missing += 1;
    return acc;
  }, { live: 0, configured: 0, paused: 0, missing: 0 });

  const blockers = providers
    .filter((provider) => {
      const channel = channelsByProvider.get(String(provider.provider || '').toLowerCase());
      const liveStatus = String(channel?.status || (provider.configured ? 'configured' : 'missing')).toLowerCase();
      const operationalStatus = String(provider.operationalStatus || '').toLowerCase() || (provider.configured ? 'connected' : 'token_missing');
      return ['token_missing', 'webhook_stale'].includes(operationalStatus) || ['missing', 'paused', 'needs_review'].includes(liveStatus);
    })
    .slice(0, 3)
    .map((provider) => {
      const channel = channelsByProvider.get(String(provider.provider || '').toLowerCase());
      const liveStatus = String(channel?.status || (provider.configured ? 'configured' : 'missing')).toLowerCase();
      const operationalStatus = String(provider.operationalStatus || '').toLowerCase() || (provider.configured ? 'connected' : 'token_missing');
      const label = operationalStatus === 'token_missing'
        ? 'token missing'
        : operationalStatus === 'webhook_stale'
          ? 'webhook stale'
          : liveStatus;
      return `<span class="badge warning">${escapeHtml(provider.label)}: ${escapeHtml(label)}</span>`;
    })
    .join('');

  return `
    <div class="deploy-summary-grid">
      <div class="deploy-summary-card">
        <span>Live channels</span>
        <strong>${totals.live}</strong>
        <p>${totals.configured} configured and ${totals.paused} paused</p>
      </div>
      <div class="deploy-summary-card">
        <span>Inbound ready</span>
        <strong>${productionCounts.inbound}</strong>
        <p>Providers with working inbound verification</p>
      </div>
      <div class="deploy-summary-card">
        <span>Outbound ready</span>
        <strong>${productionCounts.outbound}</strong>
        <p>Providers that can send from AuraFlow now</p>
      </div>
      <div class="deploy-summary-card">
        <span>Needs attention</span>
        <strong>${totals.missing + totals.paused}</strong>
        <p>${escapeHtml(
          providers
            .filter((provider) => !provider.configured || ['webhook_stale', 'token_missing'].includes(String(provider.operationalStatus || '').toLowerCase()))
            .slice(0, 2)
            .map((provider) => provider.label)
            .join(', ') || 'No major blockers right now'
        )}</p>
      </div>
    </div>
    ${blockers ? `<div class="tag-list deploy-summary-tags">${blockers}</div>` : ''}
    <div class="provider-card-grid">
      ${providers.map((provider) => {
        const providerKey = String(provider.provider || '').toLowerCase();
        const channel = channelsByProvider.get(providerKey);
        const liveStatus = String(channel?.status || (provider.configured ? 'configured' : 'missing')).toLowerCase();
        const operationalStatus = String(provider.operationalStatus || '').toLowerCase() || (provider.configured ? 'connected' : 'token_missing');
        const relaySetup = channel?.external_metadata?.relay_setup || {};
        const relayStatus = String(relaySetup.relay_status || '').toLowerCase();
        const lastWebhookAt = channel?.external_metadata?.last_webhook_at || '';
        const lastProviderEvent = channel?.external_metadata?.last_provider_event || '';
        const webhookVerification = channel?.external_metadata?.last_webhook_verification || channel?.external_metadata?.webhook_status || '';
        const outboundReady = Boolean(provider.outboundReady);
        const inboundReady = Boolean(provider.inboundReady);
        const connectedAccountLabel = provider.connectionDisplayName || provider.externalAccountLabel || '';
        const externalAccountId = channel?.provider_account_id || provider.externalAccountId || '';
        const sublabel = connectedAccountLabel || externalAccountId || 'No account linked yet';
        const readinessNote = channel?.external_metadata?.readiness_note || channel?.external_metadata?.notes || '';
        const statusLabel = operationalStatus === 'connected'
          ? 'Live now'
          : operationalStatus === 'watch_registered'
            ? 'Inbound watch ready'
            : operationalStatus === 'oauth_connected'
              ? 'Connected, finishing setup'
              : operationalStatus === 'pending_binding'
                ? 'Asset link pending'
                : operationalStatus === 'needs_review'
                  ? 'Needs review'
                  : operationalStatus === 'webhook_stale'
                    ? 'Webhook needs refresh'
                    : 'Setup incomplete';
        const badgeTone = operationalStatus === 'connected'
          ? 'success'
          : operationalStatus === 'watch_registered' || operationalStatus === 'oauth_connected' || operationalStatus === 'pending_binding'
            ? 'accent'
            : 'warning';
        const relayLabel = relayStatus === 'verified'
          ? 'Relay verified'
          : relayStatus === 'connecting'
            ? 'Relay connecting'
            : relayStatus === 'needs_review'
              ? 'Relay needs review'
              : relaySetup.callback_url
                ? 'Relay saved'
                : 'Relay not saved';
        const credentialLabel = provider.manualSetupMode === false
          ? 'Workspace connected'
          : provider.configured
            ? 'Platform configured'
            : 'Token missing';
        const credentialTone = provider.configured ? 'success' : 'warning';
        const webhookLabel = operationalStatus === 'connected'
          ? 'Inbound healthy'
          : operationalStatus === 'watch_registered'
            ? 'Inbound watch active'
            : operationalStatus === 'oauth_connected'
              ? 'Connection active'
              : operationalStatus === 'pending_binding'
                ? 'Linking still needed'
                : operationalStatus === 'webhook_stale'
                  ? 'Inbound needs refresh'
                  : 'Inbound not ready';
        const webhookTone = operationalStatus === 'connected'
          ? 'success'
          : operationalStatus === 'watch_registered' || operationalStatus === 'oauth_connected' || operationalStatus === 'pending_binding'
            ? 'accent'
            : 'warning';
        const nextAction = operationalStatus === 'token_missing'
          ? 'Add the missing setup values before this provider can go live.'
          : operationalStatus === 'pending_binding'
            ? 'Finish the Meta page, account, or phone binding before running live traffic.'
          : operationalStatus === 'oauth_connected'
            ? 'Connection is in place. Finish verification and sync before marking it live.'
          : operationalStatus === 'webhook_stale'
            ? 'Refresh the webhook or verify token so inbound events can resume.'
          : liveStatus === 'paused'
            ? 'Reconnect to resume sync.'
            : liveStatus === 'missing'
              ? 'Connect the provider to start syncing.'
              : 'Provider is live and syncing inside AuraFlow.';
        const realityState = providerKey === 'gmail'
          ? { label: 'Live and verified', tone: 'success', note: 'Real Gmail inbound sync and outbound send are both working in AuraFlow.' }
          : providerKey === 'whatsapp'
            ? { label: 'Live and verified', tone: 'success', note: 'Real WhatsApp inbound and outbound are both working in AuraFlow.' }
            : providerKey === 'instagram'
              ? { label: 'Connected, waiting on Meta', tone: 'warning', note: 'Webhook validation works, but real Instagram traffic is still blocked until Meta fully approves the live setup.' }
              : providerKey === 'messenger'
                ? { label: 'Connected, waiting on Meta', tone: 'warning', note: 'Webhook validation works, but real Messenger traffic is still blocked until Meta fully approves the live setup.' }
                : { label: 'In progress', tone: 'neutral', note: 'Provider state will sharpen as more live traffic arrives.' };
        const supportingMeta = [
          provider.recipientHint,
          provider.rolloutNote,
          relaySetup.callback_url ? `Callback: ${relaySetup.callback_url}` : '',
          relaySetup.last_webhook_test_at ? `Last webhook test: ${relaySetup.last_webhook_test_at}` : '',
          lastWebhookAt ? `Last webhook: ${lastWebhookAt}` : '',
          lastProviderEvent ? `Last event: ${lastProviderEvent}` : '',
          webhookVerification ? `Webhook verification: ${webhookVerification}` : ''
        ].filter(Boolean);
        const missingList = Array.isArray(provider.missing) && provider.missing.length
          ? `<div class="source-list provider-missing-list">
              ${provider.missing.map((item) => `
                <div class="check-item">
                  <span>~</span>
                  <div>
                    <strong>${escapeHtml(item)}</strong>
                    <span>Add this env value before marking the provider production-ready.</span>
                  </div>
                </div>
              `).join('')}
            </div>`
          : '';

        return `
          <article class="integration-card provider-card ${provider.configured ? 'deployed' : ''}">
            <div class="provider-card-head">
              <div>
                <div class="integration-head"><strong>${escapeHtml(provider.label)}</strong><span>${escapeHtml(sublabel)}</span></div>
                <p class="provider-card-copy">${escapeHtml(
                  provider.manualSetupMode === false
                    ? `Workspace connection active${connectedAccountLabel ? ` - ${connectedAccountLabel}` : externalAccountId ? ` - ${externalAccountId}` : ''}`
                    : provider.configured
                      ? `Configured${provider.externalAccountId ? ` - ${provider.externalAccountId}` : ''}`
                      : `Missing: ${(provider.missing || []).join(', ')}`
                )}</p>
              </div>
              <span class="badge ${badgeTone}">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="tag-list provider-primary-tags">
              <span class="badge ${realityState.tone}">${escapeHtml(realityState.label)}</span>
              <span class="badge ${credentialTone}">${escapeHtml(credentialLabel)}</span>
              <span class="badge ${webhookTone}">${escapeHtml(webhookLabel)}</span>
              <span class="badge ${relayStatus === 'verified' ? 'success' : 'warning'}">${escapeHtml(relayLabel)}</span>
            </div>
            <div class="detail-meta compact provider-status-grid">
              <div><span>Connection</span><strong>${escapeHtml(statusLabel)}</strong></div>
              <div><span>Inbound</span><strong>${escapeHtml(inboundReady ? 'Ready' : 'Blocked')}</strong></div>
              <div><span>Outbound</span><strong>${escapeHtml(outboundReady ? 'Ready' : 'Blocked')}</strong></div>
              <div><span>Mode</span><strong>${escapeHtml(provider.manualSetupMode === false ? 'Workspace OAuth' : 'Platform setup')}</strong></div>
            </div>
            <div class="mini-status muted">${escapeHtml(provider.statusReason || readinessNote || nextAction)}</div>
            <div class="mini-status muted">${escapeHtml(realityState.note)}</div>
            <div class="mini-status muted">${escapeHtml(providerKey === 'instagram' || providerKey === 'messenger' ? 'Keep this test-only until a real customer thread is available.' : nextAction)}</div>
            <div class="tag-list provider-checklist-tags">
              <span class="badge ${provider.configured ? 'success' : 'warning'}">Credentials</span>
              <span class="badge ${inboundReady ? 'success' : 'warning'}">Inbound</span>
              <span class="badge ${outboundReady ? 'success' : 'warning'}">Outbound</span>
              <span class="badge ${provider.outboundImplemented !== false ? 'success' : 'warning'}">Adapter</span>
            </div>
            <div class="provider-supporting-meta">
              ${supportingMeta.map((item) => {
                if (item.startsWith('Callback: ')) {
                  const url = item.replace('Callback: ', '');
                  return `
                    <div class="mini-status muted">Callback:</div>
                    <div class="url-pill compact-pill">
                      <span class="url-pill-text" title="${escapeHtml(url)}">${escapeHtml(url)}</span>
                    </div>
                  `;
                }
                return `<div class="mini-status muted">${escapeHtml(item)}</div>`;
              }).join('')}
            </div>
            ${missingList}
            <div class="modal-grid compact provider-editor-grid">
              <label><span>Status</span>
                <select data-channel-status="${escapeHtml(provider.provider)}">
                  <option value="configured" ${liveStatus === 'configured' ? 'selected' : ''}>Configured</option>
                  <option value="live" ${liveStatus === 'live' ? 'selected' : ''}>Live</option>
                  <option value="paused" ${liveStatus === 'paused' ? 'selected' : ''}>Paused</option>
                  <option value="needs_review" ${liveStatus === 'needs_review' ? 'selected' : ''}>Needs review</option>
                </select>
              </label>
              <label><span>Readiness note</span><textarea rows="3" data-channel-note="${escapeHtml(provider.provider)}" placeholder="Add channel readiness notes">${escapeHtml(readinessNote)}</textarea></label>
            </div>
            <div class="composer-actions">
              <button class="ghost-button compact" type="button" data-provider-connect="${escapeHtml(provider.provider)}">${escapeHtml(providerKey === 'gmail' ? (provider.manualSetupMode === false ? 'Reconnect Gmail' : 'Connect Gmail') : provider.manualSetupMode === false ? 'Reconnect Meta' : provider.configured ? 'Review setup' : provider.connectLabel || 'Open setup')}</button>
              <button class="primary-button compact" type="button" data-action="save-channel-readiness" data-provider-key="${escapeHtml(provider.provider)}">Save readiness</button>
              <button class="ghost-button compact" type="button" data-action="reset-provider-relay" data-provider-key="${escapeHtml(provider.provider)}">Reset relay</button>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

export function renderPermissionsPanel(role = 'viewer', permissions = {}, members = []) {
  const normalizedRole = String(role || 'viewer').trim().toLowerCase() || 'viewer';
  const roleLabel = normalizedRole === 'owner'
    ? 'Owner'
    : normalizedRole === 'admin'
      ? 'Admin'
      : normalizedRole === 'agent'
        ? 'Agent'
        : 'Viewer';
  const capabilityMap = [
    ['connectChannels', 'Connect channels'],
    ['sendReplies', 'Send replies'],
    ['escalateThreads', 'Escalate threads'],
    ['manageWorkflows', 'Manage workflows'],
    ['manageAgents', 'Manage agents'],
    ['retryReliability', 'Retry reliability jobs'],
    ['editContacts', 'Edit contacts'],
    ['saveNotes', 'Save internal notes']
  ];
  const allowed = capabilityMap.filter(([key]) => Boolean(permissions?.[key])).map(([, label]) => label);
  const denied = capabilityMap.filter(([key]) => permissions && permissions[key] === false).map(([, label]) => label);
  const memberRows = Array.isArray(members) && members.length
    ? members.slice(0, 4).map((member) => {
        const memberRole = String(member.role || 'viewer').trim().toLowerCase();
        const memberLabel = memberRole === 'owner'
          ? 'Owner'
          : memberRole === 'admin'
            ? 'Admin'
            : memberRole === 'agent'
              ? 'Agent'
              : 'Viewer';
        return `<div class="check-item"><span>${escapeHtml(memberLabel.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(member.user_id || member.userId || 'Workspace member')}</strong><span>${escapeHtml(memberLabel)}</span></div></div>`;
      }).join('')
    : renderEmptyState('No team members yet', 'Invite teammates to populate workspace roles and permissions.', 'compact');

  return `
    <div class="detail-meta compact">
      <div><span>Role</span><strong>${escapeHtml(roleLabel)}</strong></div>
      <div><span>Allowed</span><strong>${allowed.length}</strong></div>
      <div><span>Denied</span><strong>${denied.length}</strong></div>
      <div><span>Members</span><strong>${Array.isArray(members) ? members.length : 0}</strong></div>
    </div>
    <div class="mini-status muted">${allowed.length ? `Allowed actions: ${escapeHtml(allowed.join(', '))}` : 'This role is read-only until permissions are granted.'}</div>
    ${denied.length ? `<div class="mini-status muted">Blocked actions: ${escapeHtml(denied.join(', '))}</div>` : ''}
    <div class="source-list">${memberRows}</div>
  `;
}

export function renderProviderRelaySummary(providers = [], channels = []) {
  if (!providers.length) {
  return '<div class="check-item"><span>~</span><div><strong>No relay summary yet</strong><span>Run manual setup or callback tests for Gmail or WhatsApp to capture relay state.</span></div></div>';
  }

  const channelsByProvider = new Map(channels.map((item) => [String(item.provider || '').toLowerCase(), item]));
  const tracked = providers
    .filter((provider) => ['gmail', 'whatsapp'].includes(String(provider.provider || '').toLowerCase()))
    .slice(0, 2)
    .map((provider) => {
      const providerKey = String(provider.provider || '').toLowerCase();
      const channel = channelsByProvider.get(providerKey);
      const relaySetup = channel?.external_metadata?.relay_setup || {};
      const relayStatus = String(relaySetup.relay_status || '').toLowerCase();
      const callback = relaySetup.callback_url || 'Callback not saved yet';
      const testAt = relaySetup.last_webhook_test_at || '';
      const stateLabel = relayStatus === 'verified'
        ? 'Verified'
        : relayStatus === 'connecting'
          ? 'Connecting'
          : relayStatus === 'needs_review'
            ? 'Needs review'
            : relayStatus === 'saved'
              ? 'Saved'
              : 'Not saved';
      return `
        <div class="check-item">
          <span>${escapeHtml(provider.label.slice(0, 2).toUpperCase())}</span>
          <div>
            <strong>${escapeHtml(provider.label)} relay</strong>
            <span>${escapeHtml(stateLabel)}</span>
            <div class="url-pill">
              <span class="url-pill-text" title="${escapeHtml(callback)}">${escapeHtml(callback)}</span>
            </div>
            ${channel?.external_metadata?.last_webhook_at ? `<span>Last webhook: ${escapeHtml(channel.external_metadata.last_webhook_at)}</span>` : ''}
            ${channel?.external_metadata?.last_provider_event ? `<span>Last event: ${escapeHtml(channel.external_metadata.last_provider_event)}</span>` : ''}
            ${testAt ? `<span>Last test: ${escapeHtml(testAt)}</span>` : '<span>No callback test recorded yet.</span>'}
          </div>
        </div>
      `;
    });

  return tracked.length
    ? tracked.join('')
    : '<div class="check-item"><span>~</span><div><strong>No Gmail or WhatsApp relay yet</strong><span>Relay setup will appear after the first connect flow.</span></div></div>';
}

export function renderWebhookSetupGuide(providers = [], workspaceId = '', origin = '') {
  if (!providers.length) {
    return '<div class="mini-status muted">No providers available for webhook setup.</div>';
  }

  const baseOrigin = String(origin || '').replace(/\/$/, '');
  const workspaceParam = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
  const webhookUrlFor = (provider) => provider === 'whatsapp'
    ? `${baseOrigin}/.netlify/functions/whatsapp-webhook`
    : `${baseOrigin}/api/webhook/${encodeURIComponent(provider)}${workspaceParam}`;

  return providers
      .map((provider) => {
        const key = String(provider.provider || '').toLowerCase();
        const providerLabel = provider.label || key;
        const steps = key === 'gmail'
          ? [
            'Create a Google Cloud Pub/Sub topic and push subscription for the inbox relay.',
            'Point the Pub/Sub push into this callback URL.',
            'Renew the Gmail watch before it expires.'
          ]
          : key === 'whatsapp'
            ? [
            'Set the Netlify WhatsApp webhook URL as the Twilio inbound webhook target for WhatsApp.',
            'Keep the registered production sender attached to the correct WABA inside Twilio.',
            'Use approved templates for lead alerts and appointment reminders after the sender is online.'
          ]
            : key === 'instagram'
              ? [
                'Set the Supabase Edge Function URL as the Twilio Conversations webhook target for Instagram.',
                'Link the Instagram account inside the Twilio Console.',
                'Let Twilio forward inbound conversation events into AuraFlow with the unified Conversations payload.'
              ]
              : key === 'messenger'
                ? [
                  'Set the Supabase Edge Function URL as the Twilio Conversations webhook target for Messenger.',
                  'Link the Messenger account inside the Twilio Console.',
                  'Let Twilio forward inbound conversation events into AuraFlow with the unified Conversations payload.'
                ]
                : [
                'Set this callback URL in the provider dashboard.',
                'Use the matching verify token for the integration.',
                'Forward inbound events into AuraFlow through this endpoint.'
              ];
      const statusLabel = key === 'gmail'
        ? 'Gmail watch/push'
        : key === 'whatsapp'
          ? 'Twilio Conversations + production WhatsApp sender'
          : key === 'instagram'
            ? 'Twilio Conversations Instagram'
            : key === 'messenger'
              ? 'Twilio Conversations Messenger'
              : 'Webhook relay';
      return `
        <div class="check-item">
          <span>${escapeHtml(providerLabel.slice(0, 2).toUpperCase())}</span>
          <div>
            <strong>${escapeHtml(providerLabel)}</strong>
            <span>${escapeHtml(statusLabel)}</span>
            <div class="url-pill">
              <span class="url-pill-text">${escapeHtml(webhookUrlFor(key))}</span>
              <button class="ghost-button compact icon-only" title="Copy callback url" type="button" data-action="copy-webhook-url" data-webhook-url="${escapeHtml(webhookUrlFor(key))}">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="9" height="9" rx="2"/><path d="M10.5 5.5V3.5C10.5 2.39543 9.60457 1.5 8.5 1.5H2.5C1.39543 1.5 0.5 2.39543 0.5 3.5V9.5C0.5 10.6046 1.39543 11.5 2.5 11.5H4.5"/></svg>
              </button>
            </div>
            ${steps.map((step) => `<span>${escapeHtml(step)}</span>`).join('')}
            <span>${escapeHtml(key === 'gmail'
              ? 'Gmail uses a Pub/Sub relay. The watch does not post directly to the callback URL.'
              : 'Webhook verification uses the same token and challenge flow handled by the preview server.')}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderContactDetail(contact, conversation, activityEvents = []) {
  if (!contact) {
    return `
      <div class="mini-status muted">No contact selected.</div>
    `;
  }

  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const activityHistory = activityEvents.slice(0, 4);
  const tagChips = tags.length
    ? tags.map((tag) => `<button class="badge neutral tag-chip" type="button" title="Remove tag" aria-label="Remove tag ${escapeHtml(tag)}" data-action="remove-contact-tag" data-contact-tag-value="${escapeHtml(tag)}">${escapeHtml(tag)} <span aria-hidden="true">&times;</span></button>`).join('')
    : '<span class="badge muted">No tags</span>';
  const linkedIdentities = Array.isArray(contact.metadata?.identities) ? contact.metadata.identities : [];
  const linkedProviders = Array.from(new Set(linkedIdentities.map((identity) => String(identity.provider || '').toUpperCase()).filter(Boolean)));
  const identityCount = Number(contact.metadata?.identity_count || linkedIdentities.length || 0);
  const unifiedChannels = Array.isArray(contact.metadata?.unified_channels) ? contact.metadata.unified_channels : [];
  const phoneHealth = getContactPhoneHealth(contact);
  const dedupeHint = identityCount >= 2
    ? 'AuraFlow already recognizes this customer across multiple channels.'
    : 'This profile still needs more live channel traffic before the identity graph becomes fully reliable.';
  const addressRows = [
    contact.email ? { label: 'Email', value: contact.email } : null,
    contact.phone ? { label: 'Phone', value: contact.phone } : null,
    conversation?.recipient_email ? { label: 'Reply email', value: conversation.recipient_email } : null,
    conversation?.recipient_phone ? { label: 'Reply phone', value: conversation.recipient_phone } : null
  ].filter(Boolean);
  const providerIdentityRows = [
    {
      label: 'Channel',
      value: conversation?.source_provider || conversation?.source || ''
    },
    {
      label: 'Recipient ID',
      value: conversation?.recipient_id || conversation?.recipientId || ''
    },
    {
      label: 'External thread ID',
      value: conversation?.external_conversation_id || conversation?.externalConversationId || ''
    },
    {
      label: 'Recipient phone',
      value: conversation?.recipient_phone || conversation?.recipientPhone || ''
    },
    {
      label: 'Recipient email',
      value: conversation?.recipient_email || conversation?.recipientEmail || ''
    }
  ].filter((item) => String(item.value || '').trim());
  const providerIdentity = providerIdentityRows.length
    ? `
      <div class="provider-identity-card">
        <div class="panel-head compact">
          <div>
            <p class="eyebrow">Provider routing</p>
            <h4>Reply targets</h4>
          </div>
          <span class="badge accent">${escapeHtml(String(conversation?.source_provider || conversation?.source || 'manual').toUpperCase())}</span>
        </div>
        <div class="provider-identity-list">
          ${providerIdentityRows.map((item) => `
            <div class="provider-identity-row">
              <span>${escapeHtml(item.label)}</span>
              <strong title="${escapeHtml(String(item.value))}">${escapeHtml(String(item.value))}</strong>
            </div>
          `).join('')}
        </div>
        <div class="mini-status muted">Platform-scoped recipient IDs are what AuraFlow uses for Instagram and Messenger reply tests.</div>
      </div>
    `
    : '';
  const linkedIdentityPanel = linkedIdentities.length
    ? `
      <div class="provider-identity-card">
        <div class="panel-head compact">
          <div>
            <p class="eyebrow">Linked identities</p>
            <h4>Omnichannel profile</h4>
          </div>
          <span class="badge success">${escapeHtml(`${linkedIdentities.length} linked`)}</span>
        </div>
        <div class="provider-identity-list">
          ${linkedIdentities.map((identity) => `
            <div class="provider-identity-row">
              <span>${escapeHtml(String(identity.provider || 'provider').toUpperCase())}</span>
              <strong title="${escapeHtml(String(identity.external_identity_id || identity.email || identity.phone || ''))}">${escapeHtml(identity.display_name || identity.email || identity.phone || identity.external_identity_id || 'Identity linked')}</strong>
            </div>
          `).join('')}
        </div>
        <div class="mini-status muted">${escapeHtml(`This profile is already unified across ${linkedProviders.length} channel${linkedProviders.length === 1 ? '' : 's'}: ${linkedProviders.join(', ')}.`)}</div>
      </div>
    `
    : `
      <div class="mini-status muted">No linked channel identities yet. The first real Gmail or Meta inbound event will attach one here.</div>
    `;

  return `
    <div class="contact-detail-card">
      <div class="panel-head compact">
        <div>
          <p class="eyebrow">Contact profile</p>
          <h4>${escapeHtml(contact.name || 'Unknown contact')}</h4>
        </div>
        <span class="badge neutral">${escapeHtml(contact.stage || 'New')}</span>
      </div>
        <div class="detail-meta compact">
          <div><span>Company</span><strong>${escapeHtml(contact.company || 'No company')}</strong></div>
          <div><span>Owner</span><strong>${escapeHtml(contact.owner || 'Unassigned')}</strong></div>
          <div><span>Lifetime</span><strong>${escapeHtml(contact.lifetime || '$0')}</strong></div>
        </div>
        <div class="detail-meta compact">
          <div><span>Linked identities</span><strong>${escapeHtml(String(identityCount || 0))}</strong></div>
          <div><span>Unified channels</span><strong>${escapeHtml(unifiedChannels.length ? unifiedChannels.join(', ') : 'Pending')}</strong></div>
          <div><span>Profile state</span><strong>${escapeHtml(identityCount >= 2 ? 'Unified' : 'Growing')}</strong></div>
        </div>
        <div class="provider-identity-card">
          <div class="panel-head compact">
            <div>
              <p class="eyebrow">Phone health</p>
              <h4>Contactability</h4>
            </div>
            <span class="badge ${phoneHealth.valid ? 'success' : phoneHealth.hasPhone ? 'warning' : 'neutral'}">${escapeHtml(phoneHealth.valid ? 'Ready' : phoneHealth.hasPhone ? 'Review' : 'Missing')}</span>
          </div>
          <div class="tag-list section-gap-sm">${renderContactHealthBadges(contact)}</div>
          <div class="provider-identity-list">
            <div class="provider-identity-row">
              <span>Phone state</span>
              <strong>${escapeHtml(!phoneHealth.hasPhone ? 'No phone saved' : phoneHealth.valid ? 'Reachable format confirmed' : phoneHealth.status === 'lookup_failed' ? 'Lookup needs retry' : 'Needs review')}</strong>
            </div>
            <div class="provider-identity-row">
              <span>Line type</span>
              <strong>${escapeHtml(phoneHealth.lineType ? formatLineTypeLabel(phoneHealth.lineType) : 'Unknown')}</strong>
            </div>
            <div class="provider-identity-row">
              <span>Carrier</span>
              <strong>${escapeHtml(phoneHealth.carrierName || 'Unknown')}</strong>
            </div>
            <div class="provider-identity-row">
              <span>SMS posture</span>
              <strong>${escapeHtml(!phoneHealth.hasPhone ? 'Unavailable' : phoneHealth.smsCapable ? 'Safe to try SMS' : 'Prefer WhatsApp or email')}</strong>
            </div>
          </div>
          <div class="mini-status muted">${escapeHtml(
            !phoneHealth.hasPhone
              ? 'Save a phone number on this contact before relying on SMS or WhatsApp routing.'
              : phoneHealth.valid
                ? `${phoneHealth.carrierName || 'Carrier'} and ${phoneHealth.lineType ? formatLineTypeLabel(phoneHealth.lineType).toLowerCase() : 'phone'} were confirmed through Twilio Lookup.${phoneHealth.checkedAt ? ` Checked ${formatRelativeDate(phoneHealth.checkedAt)}.` : ''}`
                : phoneHealth.status === 'lookup_failed'
                  ? 'Twilio Lookup could not confirm this number yet. Review the number before spending SMS credits.'
                  : 'This number is not confirmed as mobile. Use caution before sending SMS.'
          )}</div>
        </div>
        <div class="mini-status muted">${escapeHtml(dedupeHint)}</div>
        ${addressRows.length ? `
          <div class="provider-identity-card">
            <div class="panel-head compact">
              <div>
                <p class="eyebrow">Address book</p>
                <h4>Known endpoints</h4>
              </div>
              <span class="badge ${identityCount >= 2 ? 'success' : 'accent'}">${escapeHtml(identityCount >= 2 ? 'Merged' : 'Growing')}</span>
            </div>
            <div class="provider-identity-list">
              ${addressRows.map((item) => `
                <div class="provider-identity-row">
                  <span>${escapeHtml(item.label)}</span>
                  <strong title="${escapeHtml(String(item.value))}">${escapeHtml(String(item.value))}</strong>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="tag-list" data-contact-tags-list>${tagChips}</div>
      <label class="modal-full"><span>Add tag</span><input type="text" data-contact-tag-input placeholder="VIP" /></label>
      <div class="composer-actions">
        <button class="ghost-button compact" type="button" data-action="add-contact-tag">Add tag</button>
        <button class="primary-button compact" type="button" data-action="save-contact-tags">Save tags</button>
      </div>
      <div class="mini-status muted" data-contact-tags-status>Use add tag to build a chip list, then save to persist it.</div>
      <div class="contact-tag-suggestions" data-contact-tag-suggestions></div>
      ${linkedIdentityPanel}
      ${providerIdentity}
      <div class="source-list">
        ${
          activityHistory.length
            ? activityHistory.map((item) => `
              <div class="check-item">
                <span>-</span>
                <div>
                  <strong>${escapeHtml(item.event_type || 'activity')}</strong>
                  <span>${escapeHtml(item.payload?.note || item.payload?.status || item.payload?.assigned_to || 'Recent activity')}</span>
                </div>
              </div>
            `).join('')
            : '<div class="check-item"><span>*</span><div><strong>No recent activity</strong><span>Conversation events and notes will appear here.</span></div></div>'
        }
      </div>
    </div>
  `;
}

export function renderReplyTarget(conversation = {}) {
  const provider = String(conversation?.source_provider || conversation?.source || 'manual').trim() || 'manual';
  const recipientId = String(conversation?.recipient_id || conversation?.recipientId || '').trim();
  const recipientPhone = String(conversation?.recipient_phone || conversation?.recipientPhone || '').trim();
  const recipientEmail = String(conversation?.recipient_email || conversation?.recipientEmail || '').trim();
  const replyTargetStatus = String(conversation?.reply_target_status || '').trim().toLowerCase();
  const replyTargetNote = String(conversation?.reply_target_note || '').trim();
  const externalThreadId = String(conversation?.external_conversation_id || conversation?.externalConversationId || '').trim();
  const identityId = String(conversation?.reply_target_identity_id || '').trim();
  const targetValue = provider === 'whatsapp'
    ? recipientPhone || 'Recipient phone missing'
    : provider === 'gmail'
      ? recipientEmail || 'Recipient email missing'
      : recipientId || 'Platform recipient ID missing';
  const helperText = provider === 'instagram' || provider === 'messenger'
    ? 'Instagram and Messenger replies use the Twilio Conversation SID captured from a real inbound thread.'
    : provider === 'whatsapp'
      ? 'WhatsApp replies use the saved destination phone number, the registered production sender, and approved templates when needed.'
      : provider === 'gmail'
        ? 'Gmail replies use the saved recipient email.'
        : 'Manual replies will use the selected conversation routing data.';
  const targetBadgeTone = replyTargetStatus === 'ready'
    ? 'success'
    : replyTargetStatus === 'placeholder' || replyTargetStatus === 'missing'
      ? 'warning'
      : 'neutral';
  const targetBadgeLabel = replyTargetStatus === 'ready'
    ? 'Reply ready'
    : replyTargetStatus === 'placeholder'
      ? 'Test thread'
      : replyTargetStatus === 'missing'
        ? 'Routing missing'
        : 'Routing';
  const latestDeliveryState = String(conversation?.latestDeliveryState || '').toLowerCase();
  const sendState = latestDeliveryState
    ? {
        label: humanizeLabel(latestDeliveryState),
        tone: deliveryTone(latestDeliveryState),
        note: ['failed', 'error'].includes(latestDeliveryState)
          ? 'The most recent outbound reply failed. Retry after checking destination and provider readiness.'
          : latestDeliveryState === 'queued'
            ? 'The most recent outbound reply is queued and has not been delivered yet.'
            : latestDeliveryState === 'retrying'
              ? 'AuraFlow is still retrying the most recent outbound reply.'
              : 'The most recent outbound reply has already been handed to the provider.'
      }
    : {
        label: 'No reply sent yet',
        tone: 'neutral',
        note: 'The next send from AuraFlow will establish the first delivery state for this thread.'
      };

  return `
    <div class="reply-target-inner">
      <span class="badge accent">${escapeHtml(formatProviderLabel(provider))}</span>
      <div>
        <strong>${escapeHtml(targetValue)}</strong>
        <span>${escapeHtml(helperText)}${externalThreadId ? ` Thread ${externalThreadId}` : ''}${identityId ? ` Identity ${identityId}` : ''}</span>
        <span><span class="badge ${targetBadgeTone}">${escapeHtml(targetBadgeLabel)}</span> ${escapeHtml(replyTargetNote || 'Ready state is based on the saved reply target for this conversation.')}</span>
        <span><span class="badge ${sendState.tone}">${escapeHtml(sendState.label)}</span> ${escapeHtml(sendState.note)}</span>
      </div>
    </div>
  `;
}

export function renderFollowUpSequences(items = [], selectedSequenceId = '') {
  if (!items.length) {
    return renderEmptyState(
      'No follow-up sequences yet',
      'Create the first recovery or reactivation flow to give the agent a durable next step.',
      'compact'
    );
  }

  return items
    .map((item) => `
      <button class="automation-card sequence-card ${item.id === selectedSequenceId ? 'active' : ''}" type="button" data-action="load-sequence" data-sequence-id="${escapeHtml(item.id)}">
        <div class="automation-top">
          <span class="badge ${String(item.status || '').toLowerCase() === 'active' ? 'success' : 'warning'}">${escapeHtml(item.status || 'draft')}</span>
          <span class="badge neutral">${escapeHtml(String(item.steps || 0))} steps</span>
        </div>
        <strong>${escapeHtml(item.name || 'Follow-up sequence')}</strong>
        <p>${escapeHtml(item.goal || item.trigger || item.summary || 'Sequence details')}</p>
        ${
          item.steps_detail
            ? `<div class="mini-status muted">${escapeHtml(Array.isArray(item.steps_detail) ? item.steps_detail.slice(0, 2).join(' - ') : String(item.steps_detail).split('\n').filter(Boolean).slice(0, 2).join(' - '))}</div>`
            : ''
        }
        <div class="mini-status muted">${escapeHtml([item.trigger ? `Trigger: ${item.trigger}` : '', item.owner ? `Owner: ${item.owner}` : '', item.next_run ? `Next run: ${item.next_run}` : ''].filter(Boolean).join(' · '))}</div>
        <div class="automation-footer">
          <span>${escapeHtml(item.replies || '0%')} replies</span>
          <strong>${escapeHtml(item.channel || 'Email')}</strong>
          <span>${escapeHtml(item.deliveries || '0%')} delivered</span>
        </div>
      </button>
    `)
    .join('');
}

export function renderKnowledgeBase(sources = [], savedAgentSources = []) {
  const trainingSources = Array.isArray(sources) ? sources : [];
  const savedSources = Array.isArray(savedAgentSources) ? savedAgentSources : [];
  const combinedCount = trainingSources.length + savedSources.length;

  if (!combinedCount) {
    return `
      <div class="check-item">
        <span>KB</span>
        <div>
          <strong>No knowledge base coverage yet</strong>
          <span>Add durable workspace sources so the agent is grounded in real material, not just instructions.</span>
        </div>
        <span class="badge warning">Needs work</span>
      </div>
    `;
  }

  const savedRows = savedSources.map((source) => `
    <div class="check-item">
      <span>AG</span>
      <div>
        <strong>${escapeHtml(source)}</strong>
        <span>Saved directly on the agent as a standing source of truth.</span>
      </div>
      <span class="badge accent">Agent source</span>
    </div>
  `);

  const trainingRows = trainingSources.slice(0, 8).map((source) => {
    const type = String(source.type || source.source_type || source.kind || 'source').trim() || 'source';
    const status = String(source.status || 'ready').toLowerCase();
    const title = source.title || source.name || source.label || 'Workspace source';
    const detail = [
      source.url || source.location || source.path || '',
      source.updated_at ? `Updated ${formatRelativeDate(source.updated_at)}` : '',
      source.chunk_count ? `${source.chunk_count} chunks` : source.document_count ? `${source.document_count} documents` : ''
    ].filter(Boolean).join(' · ') || 'Workspace grounding material';
    return `
      <div class="check-item">
        <span>${escapeHtml(type.slice(0, 2).toUpperCase())}</span>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(detail)}</span>
        </div>
        <span class="badge ${status === 'ready' || status === 'active' ? 'success' : status === 'syncing' ? 'accent' : 'warning'}">${escapeHtml(humanizeLabel(status))}</span>
      </div>
    `;
  });

  return `
    <div class="detail-meta compact">
      <div><span>Workspace sources</span><strong>${escapeHtml(String(trainingSources.length))}</strong></div>
      <div><span>Agent sources</span><strong>${escapeHtml(String(savedSources.length))}</strong></div>
      <div><span>Coverage</span><strong>${combinedCount >= 4 ? 'Strong' : combinedCount >= 2 ? 'Growing' : 'Thin'}</strong></div>
    </div>
    <div class="source-list section-gap-xs">
      ${trainingRows.join('') || renderEmptyState('No imported workspace sources yet', 'Connect docs, chats, or policies so the agent can ground its answers in real material.', 'compact')}
      ${savedRows.join('')}
    </div>
  `;
}

export function renderBusinessKnowledgeList(items = []) {
  const entries = Array.isArray(items) ? items : [];
  if (!entries.length) {
    return renderEmptyState(
      'No business knowledge yet',
      'Add services, pricing, and hours so the agent can answer with business facts instead of generic guidance.',
      'compact'
    );
  }

  return entries
    .slice()
    .sort((left, right) => Number(right?.priority || 0) - Number(left?.priority || 0))
    .slice(0, 12)
    .map((item) => {
      const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 4) : [];
      return `
        <div class="check-item">
          <span>BK</span>
          <div>
            <strong>${escapeHtml(item.topic || item.question || 'Business knowledge')}</strong>
            <span>${escapeHtml(String(item.question || 'No question prompt configured.').slice(0, 110))}</span>
            <span>${escapeHtml(String(item.answer || '').slice(0, 160) || 'No answer configured.')}</span>
            <span>${escapeHtml(`Priority ${Number(item.priority || 0)}${tags.length ? ` | Tags: ${tags.join(', ')}` : ''}`)}</span>
          </div>
          <div class="composer-actions">
            <button class="ghost-button compact" type="button" data-action="load-business-knowledge" data-knowledge-id="${escapeHtml(item.id || '')}">Load</button>
            <button class="ghost-button compact" type="button" data-action="delete-business-knowledge" data-knowledge-id="${escapeHtml(item.id || '')}">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderFollowUpCoverage(sequences = [], conversations = [], currentOwnerLabel = '') {
  const normalizedSequences = Array.isArray(sequences) ? sequences : [];
  const normalizedConversations = Array.isArray(conversations) ? conversations : [];
  const activeSequences = normalizedSequences.filter((item) => String(item.status || '').toLowerCase() === 'active');
  const uncoveredThreads = normalizedConversations
    .filter((item) => item.escalatedUnassigned || item.oldestWaitingInbound || item.verifiedNoOwner || Number(item.workflowCounts?.queued || 0) > 0)
    .filter((item) => {
      const channel = String(item.channel || '').toLowerCase();
      return !activeSequences.some((sequence) => {
        const sequenceChannel = String(sequence.channel || '').toLowerCase();
        return !sequenceChannel || sequenceChannel.includes(channel) || channel.includes(sequenceChannel);
      });
    })
    .slice(0, 5);

  const coach = uncoveredThreads.length
    ? `Create or adapt a sequence for ${uncoveredThreads[0].channel || 'this channel'} so the queue has coverage where operators are currently improvising.`
    : activeSequences.length
      ? 'Current high-priority threads all have at least one active sequence path covering their channel.'
      : 'No active follow-up sequences yet. The queue is relying on manual operator action only.';

  return `
    <div class="detail-meta compact">
      <div><span>Active sequences</span><strong>${activeSequences.length}</strong></div>
      <div><span>Uncovered threads</span><strong>${uncoveredThreads.length}</strong></div>
      <div><span>Owner focus</span><strong>${escapeHtml(currentOwnerLabel || 'Shared')}</strong></div>
    </div>
    <div class="mini-status muted" style="margin-top: 12px;">${escapeHtml(coach)}</div>
    <div class="source-list" style="margin-top: 12px;">
      ${
        uncoveredThreads.length
          ? uncoveredThreads.map((thread) => `
            <div class="check-item">
              <span>${escapeHtml(String(thread.channel || 'WF').slice(0, 2).toUpperCase())}</span>
              <div>
                <strong>${escapeHtml(thread.name || 'Thread')}</strong>
                <span>${escapeHtml([
                  thread.channel || '',
                  thread.escalatedUnassigned ? 'Escalated + unassigned' : '',
                  thread.oldestWaitingInbound ? 'Oldest waiting inbound' : '',
                  thread.verifiedNoOwner ? 'Verified live + no owner' : '',
                  thread.workflowLabel || ''
                ].filter(Boolean).join(' · '))}</span>
              </div>
              <span class="badge warning">Uncovered</span>
            </div>
          `).join('')
          : '<div class="check-item"><span>OK</span><div><strong>Coverage looks healthy</strong><span>No high-priority thread is currently missing sequence coverage by channel.</span></div><span class="badge success">Covered</span></div>'
      }
    </div>
  `;
}

function renderSearchBucket(title, items, emptyLabel, renderItem) {
  return `
    <article class="panel-subcard">
      <div class="panel-head compact">
        <div>
          <p class="eyebrow">${escapeHtml(title)}</p>
          <h3>${items.length}</h3>
        </div>
      </div>
      <div class="source-list">
        ${
          items.length
            ? items.map(renderItem).join('')
            : `<div class="check-item"><span>*</span><div><strong>${escapeHtml(emptyLabel)}</strong><span>No matches in this bucket.</span></div></div>`
        }
      </div>
    </article>
  `;
}

export function renderWorkspaceSearchResults(results = {}, query = '') {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    return '<div class="mini-status muted">Enter a query above to search the workspace.</div>';
  }

  const contacts = Array.isArray(results.contacts) ? results.contacts : [];
  const conversations = Array.isArray(results.conversations) ? results.conversations : [];
  const messages = Array.isArray(results.messages) ? results.messages : [];
  const activityEvents = Array.isArray(results.activityEvents) ? results.activityEvents : [];

  return `
    <div class="mini-status muted">Showing the most relevant workspace matches for <strong>${escapeHtml(normalizedQuery)}</strong>.</div>
    <div class="search-results-grid">
      ${renderSearchBucket('Contacts', contacts.slice(0, 4), 'No matching contacts', (item) => `
          <div class="check-item">
            <span>C</span>
            <div>
              <strong>${escapeHtml(item.name || item.email || 'Contact')}</strong>
              <span>${escapeHtml([item.company, item.email, Array.isArray(item.tags) ? item.tags.join(', ') : ''].filter(Boolean).join(' | ') || 'Contact record')}</span>
            </div>
          </div>
        `)}
      ${renderSearchBucket('Conversations', conversations.slice(0, 4), 'No matching conversations', (item) => `
          <div class="check-item">
            <span>CH</span>
            <div>
              <strong>${escapeHtml(item.subject || item.summary || 'Conversation')}</strong>
              <span>${escapeHtml([item.status, item.priority, item.source].filter(Boolean).join(' | ') || 'Conversation record')}</span>
            </div>
          </div>
        `)}
      ${renderSearchBucket('Messages', messages.slice(0, 4), 'No matching messages', (item) => `
          <div class="check-item">
            <span>M</span>
            <div>
              <strong>${escapeHtml(item.sender_name || item.direction || 'Message')}</strong>
              <span>${escapeHtml(extractMessageBody(item).slice(0, 140) || 'Message record')}</span>
            </div>
          </div>
        `)}
      ${renderSearchBucket('Activity', activityEvents.slice(0, 4), 'No matching activity', (item) => `
        <div class="check-item">
          <span>A</span>
          <div>
            <strong>${escapeHtml(item.event_type || 'Activity event')}</strong>
            <span>${escapeHtml((item.payload && (item.payload.note || item.payload.status || item.payload.assigned_to)) || 'Activity timeline record')}</span>
          </div>
        </div>
      `)}
    </div>
  `;
}

export function renderSyncJobsList(items = []) {
  if (!items.length) {
    return renderEmptyState('No sync jobs yet', 'Background sync work will appear here after the first live channel event.', 'compact');
  }

  const totals = items.reduce((acc, item) => {
    const status = String(item.status || 'queued').toLowerCase();
    acc.total += 1;
    acc[status] = Number(acc[status] || 0) + 1;
    return acc;
  }, { total: 0 });

  return `
    <div class="detail-meta compact">
      <div><span>Total</span><strong>${totals.total}</strong></div>
      <div><span>Queued</span><strong>${Number(totals.queued || 0)}</strong></div>
      <div><span>Retrying</span><strong>${Number(totals.retrying || 0)}</strong></div>
      <div><span>Failed</span><strong>${Number(totals.failed || 0)}</strong></div>
    </div>
    ${items
    .slice(0, 8)
    .map((item) => {
      const status = String(item.status || 'queued').toLowerCase();
      const tone = status === 'completed' ? 'success' : status === 'failed' ? 'warning' : 'accent';
      const payload = item.payload || {};
      const provider = payload.source || payload.provider || payload.source_provider || payload.channel || 'manual';
      const context = [
        payload.conversationId ? `Conversation ${String(payload.conversationId).slice(0, 8)}` : '',
        Number(item.retry_count || 0) ? `${Number(item.retry_count || 0)} retries` : '',
        item.next_retry_at ? `Next ${formatRelativeDate(item.next_retry_at)}` : ''
      ].filter(Boolean).join(' • ');
      return `
        <div class="check-item">
          <span>${escapeHtml((item.type || item.jobType || 'job').slice(0, 2).toUpperCase())}</span>
          <div>
            <strong>${escapeHtml(humanizeLabel(item.type || item.jobType || 'Sync job'))}</strong>
            <span>${escapeHtml([humanizeLabel(status), item.created_at ? formatRelativeDate(item.created_at) : '', provider].filter(Boolean).join(' • '))}</span>
            ${context ? `<span>${escapeHtml(context)}</span>` : ''}
          </div>
          <span class="badge ${tone}">${escapeHtml(status)}</span>
        </div>
      `;
    })
    .join('')}`;
}

export function renderWorkflowQueueList(items = []) {
  if (!items.length) {
    return renderEmptyState('No workflow jobs yet', 'Queued follow-up, assignment, and escalation work will appear here.', 'compact');
  }

  const totals = items.reduce((acc, item) => {
    const status = String(item.status || 'queued').toLowerCase();
    acc.total += 1;
    acc[status] = Number(acc[status] || 0) + 1;
    return acc;
  }, { total: 0 });

  return `
    <div class="detail-meta compact">
      <div><span>Total</span><strong>${totals.total}</strong></div>
      <div><span>Queued</span><strong>${Number(totals.queued || 0)}</strong></div>
      <div><span>Assigned</span><strong>${Number(totals.assigned || 0)}</strong></div>
      <div><span>Escalated</span><strong>${Number(totals.escalated || 0)}</strong></div>
    </div>
    ${items
    .slice(0, 10)
    .map((item) => {
      const status = String(item.status || 'queued').toLowerCase();
      const tone = status === 'completed' ? 'success' : status === 'escalated' || status === 'retrying' || status === 'failed' ? 'warning' : status === 'assigned' ? 'neutral' : 'accent';
      const payload = item.payload || {};
      const label = String(item.type || 'workflow').replace(/^workflow\./, '').replace(/[._-]+/g, ' ').trim() || 'workflow';
        const detail = payload.reason || payload.suggestion || payload.action || payload.targetOwner || payload.urgency || payload.note || 'Queued workflow step';
        const assignee = String(item.assigned_to || payload.assignee || payload.targetOwner || '').trim();
        const conversationId = String(payload.conversationId || payload.conversation_id || '').trim();
      const createdAt = item.created_at ? formatRelativeDate(item.created_at) : '';
      const updatedAt = item.updated_at ? formatRelativeDate(item.updated_at) : '';
      const nextRetry = item.next_retry_at ? formatRelativeDate(item.next_retry_at) : '';
      const retryCount = Number(item.retry_count || 0);
      const retryLabel = Number(item.max_retries || 0) > 0 ? `${retryCount}/${Number(item.max_retries || 0)} retries` : `${retryCount} retries`;
      return `
        <div class="check-item">
          <span>${escapeHtml(label.slice(0, 2).toUpperCase())}</span>
          <div>
            <strong>${escapeHtml(humanizeLabel(label))}</strong>
            <span>${escapeHtml(detail)}</span>
            <span>${escapeHtml([assignee ? `Assignee: ${assignee}` : 'Unassigned', createdAt ? `Queued ${createdAt}` : '', updatedAt ? `Updated ${updatedAt}` : '', nextRetry ? `Retry ${nextRetry}` : '', retryCount ? retryLabel : ''].filter(Boolean).join(' · '))}</span>
              <div class="composer-actions">
                ${conversationId ? `<button class="ghost-button compact" type="button" data-conversation-id="${escapeHtml(conversationId)}">Open thread</button>` : ''}
                <button class="ghost-button compact" type="button" data-action="assign-workflow-job" data-job-id="${escapeHtml(item.id)}" data-job-assignee="${escapeHtml(assignee || 'Workspace operator')}">Assign</button>
              <button class="ghost-button compact" type="button" data-action="complete-workflow-job" data-job-id="${escapeHtml(item.id)}" data-job-assignee="${escapeHtml(assignee || 'Workspace operator')}">Complete</button>
              <button class="ghost-button compact" type="button" data-action="escalate-workflow-job" data-job-id="${escapeHtml(item.id)}" data-job-assignee="${escapeHtml(assignee || 'Escalation queue')}" data-job-note="${escapeHtml(payload.reason || payload.suggestion || detail)}">Escalate</button>
              <button class="ghost-button compact" type="button" data-action="retry-workflow-job" data-job-id="${escapeHtml(item.id)}" data-job-assignee="${escapeHtml(assignee || 'Workspace operator')}" data-job-note="${escapeHtml(payload.reason || payload.suggestion || detail)}">Retry</button>
            </div>
          </div>
          <span class="badge ${tone}">${escapeHtml(status)}</span>
        </div>
      `;
    })
    .join('')}`;
}

export function renderReliabilityPanel(reliability = null) {
  if (!reliability) {
    return `
      <div class="detail-meta compact">
        <div><span>Jobs</span><strong>0</strong></div>
        <div><span>Replays</span><strong>0</strong></div>
        <div><span>Duplicates</span><strong>0</strong></div>
        <div><span>Failures</span><strong>0</strong></div>
      </div>
      <div class="mini-status muted">Retrying jobs, replay history, and duplicate suppression will appear here after the first webhook or workflow event.</div>
    `;
  }

  const summary = reliability.summary || {};
  const jobCounts = summary.jobCounts || {};
  const replayCounts = summary.replayCounts || {};
  const fallbackNote = reliability.fallback ? (reliability.error || 'Loaded from local state fallback.') : '';
  const recentFailures = Array.isArray(reliability.recentFailures) ? reliability.recentFailures.slice(0, 5) : [];
  const recentReplays = Array.isArray(reliability.recentReplays) ? reliability.recentReplays.slice(0, 5) : [];
  const recentReliabilityEvents = Array.isArray(reliability.recentReliabilityEvents) ? reliability.recentReliabilityEvents.slice(0, 5) : [];
  const duplicateCount = Number(replayCounts.suppressed || 0);
  const replayTotal = Number(replayCounts.total || 0);
  const acceptedCallbacks = recentReliabilityEvents.filter((item) => ['tested', 'accepted'].includes(String(item.status || '').toLowerCase())).length;
  const queueHealthItems = [
    {
      label: 'Queue backlog',
      note: Number(jobCounts.queued || 0) > 0 ? `${Number(jobCounts.queued || 0)} jobs are waiting to be processed.` : 'No queued jobs are building up right now.',
      tone: Number(jobCounts.queued || 0) > 0 ? 'accent' : 'success'
    },
    {
      label: 'Retry pressure',
      note: Number(jobCounts.retrying || 0) > 0 ? `${Number(jobCounts.retrying || 0)} jobs are retrying and need an eye on them.` : 'No jobs are currently stuck in retry.',
      tone: Number(jobCounts.retrying || 0) > 0 ? 'warning' : 'success'
    },
    {
      label: 'Webhook signals',
      note: acceptedCallbacks > 0 ? `${acceptedCallbacks} recent callback checks or accepted events were captured.` : 'Run a callback test to seed the reliability history.',
      tone: acceptedCallbacks > 0 ? 'success' : 'neutral'
    }
  ];

  const jobBadges = [
    `<div><span>Queued</span><strong>${Number(jobCounts.queued || 0)}</strong></div>`,
    `<div><span>Retrying</span><strong>${Number(jobCounts.retrying || 0)}</strong></div>`,
    `<div><span>Failed</span><strong>${Number(jobCounts.failed || 0)}</strong></div>`,
    `<div><span>Completed</span><strong>${Number(jobCounts.completed || 0)}</strong></div>`
  ].join('');

  const replayBadges = [
    `<div><span>Accepted</span><strong>${Number(replayCounts.accepted || 0)}</strong></div>`,
    `<div><span>Suppressed</span><strong>${duplicateCount}</strong></div>`,
    `<div><span>Total</span><strong>${replayTotal}</strong></div>`,
    `<div><span>Latest</span><strong>${replayCounts.latest_at ? escapeHtml(formatRelativeDate(replayCounts.latest_at)) : 'None'}</strong></div>`
  ].join('');

  const replayList = recentReplays.length
    ? recentReplays.map((item) => {
        const provider = String(item.detail?.provider || 'webhook').toLowerCase();
        const status = item.suppressed ? 'suppressed' : 'accepted';
        const tone = item.suppressed ? 'warning' : 'success';
        const replayKey = String(item.key || item.replayKey || '').trim();
        return `
          <div class="check-item">
            <span>${escapeHtml(provider.slice(0, 2).toUpperCase())}</span>
            <div>
              <strong>${escapeHtml(provider)} replay</strong>
              <span>${escapeHtml(status)} · ${escapeHtml(item.detail?.eventType || item.detail?.event_type || 'event')} · ${escapeHtml(item.created_at ? formatRelativeDate(item.created_at) : 'Just now')}</span>
              ${item.detail?.verification?.note ? `<span>${escapeHtml(item.detail.verification.note)}</span>` : ''}
              ${item.detail?.verification?.verified === false ? '<span>Verification failed or incomplete.</span>' : ''}
            </div>
            <div class="composer-actions">
              <button class="ghost-button compact" type="button" data-action="retry-webhook-replay" data-replay-key="${escapeHtml(replayKey)}">Retry</button>
            </div>
            <span class="badge ${tone}">${escapeHtml(status)}</span>
          </div>
        `;
      }).join('')
    : '<div class="mini-status muted">No replay activity recorded yet.</div>';

  const failureList = recentFailures.length
    ? recentFailures.map((job) => {
        const status = String(job.status || 'queued').toLowerCase();
        const tone = status === 'failed' ? 'warning' : 'accent';
        const retryLabel = job.next_retry_at ? `Retry ${formatRelativeDate(job.next_retry_at)}` : 'No retry scheduled yet';
        return `
          <div class="check-item">
            <span>${escapeHtml(String(job.type || 'job').slice(0, 2).toUpperCase())}</span>
            <div>
              <strong>${escapeHtml(job.type || 'Retry job')}</strong>
              <span>${escapeHtml(job.last_error || job.note || 'Workflow job needs attention.')}</span>
              <span>${escapeHtml([retryLabel, job.assigned_to ? `Owner: ${job.assigned_to}` : 'Unassigned'].filter(Boolean).join(' · '))}</span>
            </div>
            <span class="badge ${tone}">${escapeHtml(status)}</span>
          </div>
        `;
      }).join('')
    : '<div class="mini-status muted">No failed workflow jobs right now.</div>';

  const reliabilityEventList = recentReliabilityEvents.length
    ? recentReliabilityEvents.map((item) => `
      <div class="check-item">
        <span>${escapeHtml(String(item.provider || 'reliability').slice(0, 2).toUpperCase())}</span>
        <div>
          <strong>${escapeHtml(item.event_type || 'reliability.event')}</strong>
          <span>${escapeHtml(item.status || 'received')} · ${escapeHtml(item.error_message || 'Saved to reliability log.')}</span>
          <span>${escapeHtml(item.created_at ? formatRelativeDate(item.created_at) : 'Just now')}</span>
        </div>
        <span class="badge neutral">${escapeHtml(item.status || 'received')}</span>
      </div>
    `).join('')
    : '<div class="mini-status muted">Test callback logs will appear here.</div>';

  return `
    <div class="detail-meta compact">
      <div><span>Queued</span><strong>${Number(jobCounts.queued || 0)}</strong></div>
      <div><span>Retrying</span><strong>${Number(jobCounts.retrying || 0)}</strong></div>
      <div><span>Failed</span><strong>${Number(jobCounts.failed || 0)}</strong></div>
      <div><span>Duplicates</span><strong>${duplicateCount}</strong></div>
    </div>
    <div class="detail-meta compact" style="margin-top: 12px;">
      ${jobBadges}
    </div>
    <div class="detail-meta compact" style="margin-top: 12px;">
      ${replayBadges}
    </div>
    <div class="composer-actions" style="margin-top: 12px;">
      <button class="ghost-button compact" type="button" data-action="refresh-reliability">Refresh diagnostics</button>
      <button class="ghost-button compact" type="button" data-action="test-gmail-webhook">Retry Gmail relay</button>
      <button class="ghost-button compact" type="button" data-action="test-whatsapp-webhook">Retry WhatsApp relay</button>
    </div>
    ${fallbackNote ? `<div class="mini-status muted" style="margin-top: 12px;">${escapeHtml(fallbackNote)}</div>` : ''}
    <div class="source-list" style="margin-top: 12px;">
      ${queueHealthItems.map((item) => `
        <div class="check-item">
          <span>${escapeHtml(item.label.slice(0, 2).toUpperCase())}</span>
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.note)}</span>
          </div>
          <span class="badge ${item.tone}">${escapeHtml(item.tone === 'warning' ? 'Watch' : item.tone === 'accent' ? 'Active' : item.tone === 'success' ? 'Healthy' : 'Idle')}</span>
        </div>
      `).join('')}
    </div>
    <div class="panel-subcard" style="margin-top: 12px;">
      <div class="panel-head compact"><div><p class="eyebrow">Replay history</p><h3>Webhook attempts</h3></div></div>
      <div class="source-list">${replayList}</div>
    </div>
    <div class="panel-subcard" style="margin-top: 12px;">
      <div class="panel-head compact"><div><p class="eyebrow">Reliability log</p><h3>Callback tests and diagnostics</h3></div></div>
      <div class="source-list">${reliabilityEventList}</div>
    </div>
    <div class="panel-subcard" style="margin-top: 12px;">
      <div class="panel-head compact"><div><p class="eyebrow">Retry queue</p><h3>Failed workflow jobs</h3></div></div>
      <div class="source-list">${failureList}</div>
    </div>
  `;
}

export function renderAgentConfig(agent) {
  const sources = Array.isArray(agent?.knowledge_sources) ? agent.knowledge_sources : [];
  return {
    name: agent?.name || 'Northstar Support Agent',
    tone: agent?.tone || 'balanced',
    status: agent?.status || 'active',
    instructions: agent?.instructions || '',
    sources
  };
}

export function renderAgentGuardrails(agent = {}, snapshot = {}, providerReadiness = []) {
  const sources = Array.isArray(agent.sources) ? agent.sources : [];
  const trainingSources = Array.isArray(snapshot?.trainingSources) ? snapshot.trainingSources : [];
  const instructions = String(agent.instructions || '').trim();
  const liveProviders = Array.isArray(providerReadiness)
    ? providerReadiness.filter((item) => item.outboundReady || item.inboundReady)
    : [];
  const totalKnowledgeSources = sources.length + trainingSources.length;
  const checks = [
    {
      title: 'Escalation posture',
      tone: /escalat|handoff|human/i.test(instructions) ? 'success' : 'warning',
      note: /escalat|handoff|human/i.test(instructions)
        ? 'Instructions mention escalation or handoff behavior.'
        : 'Add explicit escalation rules so the agent knows when to hand a thread to a human.'
    },
      {
        title: 'Knowledge coverage',
        tone: totalKnowledgeSources >= 3 ? 'success' : totalKnowledgeSources >= 1 ? 'accent' : 'warning',
        note: totalKnowledgeSources >= 3
          ? `${totalKnowledgeSources} knowledge sources are available across agent settings and imported workspace material.`
          : totalKnowledgeSources >= 1
            ? 'Some knowledge coverage exists, but it is still thin for a dependable production agent.'
            : 'No durable knowledge sources are saved yet.'
      },
    {
      title: 'Channel reach',
      tone: liveProviders.length >= 2 ? 'success' : liveProviders.length ? 'accent' : 'warning',
      note: liveProviders.length
        ? `${liveProviders.map((item) => item.label).join(', ')} are operational for this agent right now.`
        : 'No live channels are fully operational for the agent yet.'
    },
    {
      title: 'Instruction depth',
      tone: instructions.length > 180 ? 'success' : instructions.length > 60 ? 'accent' : 'warning',
      note: instructions.length > 180
        ? 'Instructions are detailed enough to guide style and safety.'
        : instructions.length > 60
          ? 'Instructions exist, but they still read lightweight for a production support agent.'
          : 'Instructions are still too thin for a dependable production agent.'
    }
  ];

  return checks.map((item) => `
    <div class="check-item">
      <span>${item.tone === 'success' ? 'OK' : item.tone === 'accent' ? 'AI' : '!'}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.note)}</span>
      </div>
      <span class="badge ${item.tone}">${escapeHtml(item.tone === 'success' ? 'Ready' : item.tone === 'accent' ? 'Improving' : 'Needs work')}</span>
    </div>
  `).join('');
}

function aiToneFromConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence <= 0) return 'neutral';
  if (confidence < 0.45) return 'warning';
  if (confidence < 0.75) return 'accent';
  return 'success';
}

export function renderAiFollowUpBrief(briefing = {}) {
  const sequence = briefing?.sequenceSuggestion || {};
  const templateRecommendation = String(briefing?.templateRecommendation || '').trim();
  const hasBriefing = Boolean(
    briefing && (
      briefing.summary ||
      briefing.nextAction ||
      sequence.name ||
      sequence.goal ||
      sequence.trigger
    )
  );
  if (!hasBriefing) {
    return '<div class="mini-status muted">Run AI brief from Inbox to suggest a follow-up plan for the current thread.</div>';
  }

  const tone = aiToneFromConfidence(briefing.confidence);
  const steps = Array.isArray(sequence.steps) ? sequence.steps.filter(Boolean).slice(0, 4) : [];
  return `
    <div class="check-item">
      <span>AI</span>
      <div>
        <strong>${escapeHtml(sequence.name || 'Suggested follow-up')}</strong>
        <span>${escapeHtml(sequence.goal || briefing.nextAction || briefing.summary || 'AI will suggest the next outreach move here.')}</span>
      </div>
      <span class="badge ${tone}">${escapeHtml(briefing.followUpTiming || 'Planned')}</span>
    </div>
    <div class="check-item">
      <span>CH</span>
      <div>
        <strong>Channel mix</strong>
        <span>${escapeHtml(sequence.channel || 'Email + WhatsApp')}</span>
      </div>
      <span class="badge neutral">${escapeHtml(sequence.trigger || 'When the thread cools')}</span>
    </div>
      <div class="check-item">
        <span>OW</span>
        <div>
          <strong>Suggested owner</strong>
          <span>${escapeHtml(briefing.suggestedAssignee || 'Workspace operator')}</span>
        </div>
        <span class="badge accent">${escapeHtml(briefing.classification || 'Awaiting classification')}</span>
      </div>
      ${templateRecommendation ? `
        <div class="check-item">
          <span>TP</span>
          <div>
            <strong>WhatsApp posture</strong>
            <span>${escapeHtml(templateRecommendation === 'freeform' ? 'Free-form is still a good fit while the thread is active.' : `${humanizeLabel(templateRecommendation)} is the safer WhatsApp path once the conversation cools down.`)}</span>
          </div>
          <span class="badge ${templateRecommendation === 'freeform' ? 'success' : 'accent'}">${escapeHtml(templateRecommendation === 'freeform' ? 'Free-form' : 'Template')}</span>
        </div>
      ` : ''}
      ${steps.length ? `
        <div class="empty-state compact">
          <strong>Suggested sequence steps</strong>
        <p>${escapeHtml(steps.join(' -> '))}</p>
      </div>
    ` : ''}
  `;
}

export function renderAiOutreachGuide(briefing = {}) {
  const sequence = briefing?.sequenceSuggestion || {};
  const templateRecommendation = String(briefing?.templateRecommendation || '').trim();
  const hasBriefing = Boolean(
    briefing?.summary ||
    briefing?.nextAction ||
    sequence?.name ||
    sequence?.goal ||
    sequence?.channel
  );
  if (!hasBriefing) {
    return renderEmptyState(
      'No outreach plan yet',
      'Run AI brief from Inbox to generate a sequence plan, owner suggestion, and channel mix for the current lead.',
      'compact'
    );
  }

  const steps = Array.isArray(sequence.steps) ? sequence.steps.filter(Boolean).slice(0, 5) : [];
  return `
    <div class="check-item">
      <span>PL</span>
      <div>
        <strong>${escapeHtml(sequence.name || 'AI outreach plan')}</strong>
        <span>${escapeHtml(sequence.goal || briefing.nextAction || briefing.summary || 'AI will suggest the next move here.')}</span>
      </div>
      <span class="badge ${aiToneFromConfidence(briefing.confidence)}">${escapeHtml(briefing.followUpTiming || 'Suggested')}</span>
    </div>
      <div class="detail-meta compact section-gap-sm">
        <div><span>Channel mix</span><strong>${escapeHtml(sequence.channel || 'Email + WhatsApp')}</strong></div>
        <div><span>Owner</span><strong>${escapeHtml(briefing.suggestedAssignee || 'Workspace operator')}</strong></div>
        <div><span>Trigger</span><strong>${escapeHtml(sequence.trigger || 'When the thread cools')}</strong></div>
      </div>
      ${templateRecommendation ? `<div class="mini-status muted section-gap-sm">${escapeHtml(templateRecommendation === 'freeform' ? 'WhatsApp can stay free-form while the thread is still active.' : `${humanizeLabel(templateRecommendation)} is the safer WhatsApp path once the customer is outside the active reply window.`)}</div>` : ''}
      ${steps.length ? `
        <div class="source-list section-gap-sm">
        ${steps.map((step, index) => `
          <div class="check-item">
            <span>${index + 1}</span>
            <div>
              <strong>Step ${index + 1}</strong>
              <span>${escapeHtml(step)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

export function renderAiLeadBrief(briefing = {}) {
  if (!briefing?.classification && !briefing?.summary && !briefing?.nextAction) {
    return renderEmptyState(
      'No lead signal yet',
      'Once AI briefs a live thread, AuraFlow will show lead temperature, routing notes, and next-touch guidance here.',
      'compact'
    );
  }

  const confidence = Number(briefing?.confidence || 0);
  const leadScoreLabel = briefing?.leadScoreLabel
    || (confidence >= 0.8 ? 'Hot lead' : confidence >= 0.55 ? 'Warm lead' : confidence > 0 ? 'Needs review' : 'Unscored');
  const leadScoreReason = briefing?.leadScoreReason
    || briefing?.handoffReason
    || briefing?.summary
    || 'AI will explain the lead posture here.';

  return `
    <div class="check-item">
      <span>LS</span>
      <div>
        <strong>${escapeHtml(leadScoreLabel)}</strong>
        <span>${escapeHtml(leadScoreReason)}</span>
      </div>
      <span class="badge ${aiToneFromConfidence(confidence)}">${escapeHtml(briefing?.classification || 'Awaiting class')}</span>
    </div>
    <div class="detail-meta compact section-gap-sm">
      <div><span>Next action</span><strong>${escapeHtml(briefing?.nextAction || 'Hold')}</strong></div>
      <div><span>Suggested owner</span><strong>${escapeHtml(briefing?.suggestedAssignee || 'Workspace operator')}</strong></div>
      <div><span>Confidence</span><strong>${escapeHtml(confidence > 0 ? `${Math.round(confidence * 100)}%` : 'Pending')}</strong></div>
    </div>
  `;
}

export function renderAiAnalyticsBrief(briefing = {}, conversations = [], workflowJobs = [], providerReadiness = [], ops = {}) {
  const openConversations = Array.isArray(conversations)
    ? conversations.filter((item) => String(item.status || '').toLowerCase() !== 'closed')
    : [];
  const escalatedCount = openConversations.filter((item) => String(item.status || '').toLowerCase() === 'escalated').length;
  const workflowCount = Array.isArray(workflowJobs) ? workflowJobs.filter((item) => String(item.type || '').startsWith('workflow.')).length : 0;
  const liveProviders = Array.isArray(providerReadiness) ? providerReadiness.filter((item) => item.outboundReady || item.inboundReady).length : 0;
  const voiceFollowUps = Number(ops?.voiceFollowUps || 0);
  const unifiedProfiles = Number(ops?.unifiedProfiles || 0);
  const whatsappDeliveryRate = Number.isFinite(Number(ops?.whatsappDeliveryRate))
    ? Math.max(0, Math.min(100, Math.round(Number(ops.whatsappDeliveryRate))))
    : 0;
  const whatsappTracked = Number(ops?.whatsappTracked || 0);
  const whatsappRead = Number(ops?.whatsappRead || 0);
  const whatsappFailures = Number(ops?.whatsappFailures || 0);
  const whatsappFailureReason = String(ops?.whatsappFailureReason || '').trim();
  const whatsappFailureCategory = String(ops?.whatsappFailureCategory || '').trim();
  const whatsappRetryMode = String(ops?.whatsappRetryMode || '').trim();
  const whatsappRetryCount = Number(ops?.whatsappRetryCount || 0);
  const whatsappLastRetryAt = String(ops?.whatsappLastRetryAt || '').trim();
  const confidence = Number(briefing?.confidence);
  const tone = aiToneFromConfidence(confidence);
  const confidenceLabel = Number.isFinite(confidence) && confidence > 0 ? `${Math.round(confidence * 100)}% confidence` : 'No AI brief yet';
  const whatsappStatusSummary = whatsappTracked
    ? `${whatsappDeliveryRate}% of tracked WhatsApp replies are reaching delivered or read, with ${whatsappRead} read receipt${whatsappRead === 1 ? '' : 's'} and ${whatsappFailures} failure${whatsappFailures === 1 ? '' : 's'} to review.${whatsappFailureCategory ? ` Current pattern: ${whatsappFailureCategory}.` : ''}${whatsappFailureReason ? ` Latest blocker: ${whatsappFailureReason}.` : ''}${whatsappRetryMode ? ` ${whatsappRetryMode}${whatsappRetryCount ? ` after ${whatsappRetryCount} prior ${whatsappRetryCount === 1 ? 'retry' : 'retries'}` : ''}${whatsappLastRetryAt ? `, last retried ${formatRelativeDate(whatsappLastRetryAt)}` : ''}.` : ''}`
    : 'Delivery analytics will appear here once WhatsApp replies begin receiving provider status callbacks.';
  const whatsappBadge = whatsappTracked
    ? (whatsappFailures
      ? 'warning'
      : whatsappDeliveryRate >= 90
        ? 'success'
        : whatsappDeliveryRate >= 70
          ? 'accent'
          : 'warning')
    : 'neutral';
  const whatsappBadgeLabel = whatsappTracked
    ? (whatsappRetryMode
      ? 'Retry watch'
      : `${whatsappDeliveryRate}%`)
    : 'Waiting';

  return `
    <div class="check-item">
      <span>AI</span>
      <div>
        <strong>${escapeHtml(briefing?.classification || 'No active AI classification')}</strong>
        <span>${escapeHtml(briefing?.summary || 'Run AI brief from Inbox to snapshot the latest customer signal here.')}</span>
      </div>
      <span class="badge ${tone}">${escapeHtml(confidenceLabel)}</span>
    </div>
    <div class="check-item">
      <span>WF</span>
      <div>
        <strong>Workflow pressure</strong>
        <span>${workflowCount} workflow jobs are active and ${escalatedCount} open conversations are escalated.</span>
      </div>
      <span class="badge ${workflowCount || escalatedCount ? 'warning' : 'success'}">${workflowCount + escalatedCount ? 'Watch' : 'Healthy'}</span>
    </div>
    <div class="check-item">
      <span>DP</span>
      <div>
        <strong>Channel coverage</strong>
        <span>${liveProviders} live providers are ready to deliver AI-guided replies and follow-up steps.</span>
      </div>
      <span class="badge ${liveProviders >= 2 ? 'success' : liveProviders ? 'accent' : 'warning'}">${liveProviders >= 2 ? 'Ready' : liveProviders ? 'Partial' : 'Blocked'}</span>
    </div>
    <div class="check-item">
      <span>VC</span>
      <div>
        <strong>Voice follow-up load</strong>
        <span>${voiceFollowUps} analyzed call${voiceFollowUps === 1 ? '' : 's'} currently have a recommended next step, and ${unifiedProfiles} contact profile${unifiedProfiles === 1 ? '' : 's'} already span multiple channels.</span>
      </div>
      <span class="badge ${voiceFollowUps ? 'accent' : unifiedProfiles ? 'success' : 'neutral'}">${voiceFollowUps ? 'Active' : unifiedProfiles ? 'Mapped' : 'Idle'}</span>
    </div>
      <div class="check-item">
        <span>WA</span>
        <div>
          <strong>WhatsApp delivery health</strong>
          <span>${whatsappStatusSummary}</span>
        </div>
        <span class="badge ${whatsappBadge}">${escapeHtml(whatsappBadgeLabel)}</span>
      </div>
    `;
}

export function renderAiDeployBrief(briefing = {}, providerReadiness = [], ops = {}) {
  const providers = Array.isArray(providerReadiness) ? providerReadiness : [];
  const blocked = providers.filter((item) => !(item.outboundReady || item.inboundReady));
  const live = providers.filter((item) => item.outboundReady || item.inboundReady);
  const focusProvider = blocked[0] || live[0] || null;
  const voiceProfiles = Number(ops?.voiceProfiles || 0);
  const pendingVoiceAnalysis = Number(ops?.pendingVoiceAnalysis || 0);
  const deliverySuccessRate = Number.isFinite(Number(ops?.deliverySuccessRate))
    ? Math.max(0, Math.min(100, Math.round(Number(ops.deliverySuccessRate))))
    : 0;
  const deliveryVolume = Number(ops?.deliveryVolume || 0);
  const nextStep = briefing?.nextAction || focusProvider?.recommendedAction || focusProvider?.note || 'Connect a provider so AI actions can move from draft-only to live operations.';
  return `
    <div class="check-item">
      <span>AI</span>
      <div>
        <strong>${escapeHtml(focusProvider?.label || 'Deployment guidance')}</strong>
        <span>${escapeHtml(nextStep)}</span>
      </div>
      <span class="badge ${blocked.length ? 'warning' : live.length ? 'success' : 'neutral'}">${escapeHtml(blocked.length ? 'Needs setup' : live.length ? 'Live' : 'Idle')}</span>
    </div>
    <div class="check-item">
      <span>RL</span>
      <div>
        <strong>Routing note</strong>
        <span>${escapeHtml(briefing?.handoffReason || 'AI brief will describe the routing or escalation risk for the active thread here.')}</span>
      </div>
      <span class="badge accent">${escapeHtml(briefing?.suggestedAssignee || 'Ops')}</span>
    </div>
    <div class="check-item">
      <span>VO</span>
      <div>
        <strong>Voice readiness</strong>
        <span>${voiceProfiles} approved voice profile${voiceProfiles === 1 ? '' : 's'} configured, with ${pendingVoiceAnalysis} queued or in-progress call analysis item${pendingVoiceAnalysis === 1 ? '' : 's'}.</span>
      </div>
      <span class="badge ${voiceProfiles ? (pendingVoiceAnalysis ? 'accent' : 'success') : 'warning'}">${voiceProfiles ? (pendingVoiceAnalysis ? 'Active' : 'Ready') : 'Setup'}</span>
    </div>
    <div class="check-item">
      <span>DL</span>
      <div>
        <strong>Delivery success rate</strong>
        <span>${deliveryVolume ? `${deliverySuccessRate}% of outbound updates have reached delivered or read.` : 'Outbound delivery callbacks will begin charting this once statuses come back from Twilio and the connected channels.'}</span>
      </div>
      <span class="badge ${deliveryVolume ? (deliverySuccessRate >= 90 ? 'success' : deliverySuccessRate >= 70 ? 'accent' : 'warning') : 'neutral'}">${deliveryVolume ? `${deliverySuccessRate}%` : 'Waiting'}</span>
    </div>
  `;
}

export function renderVoiceProfiles(items = []) {
  if (!items.length) {
    return '<div class="check-item"><span>-</span><div><strong>No voice profiles yet</strong><span>Create the first approved voice below.</span></div></div>';
  }

  return items
    .map((item) => `
      <div class="check-item">
        <span>${item.is_default ? '*' : '-'}</span>
        <div>
          <strong>${escapeHtml(item.name || item.label || 'Voice profile')}</strong>
          <span>${escapeHtml(item.label || item.voice_source || 'Approved voice')} - ${escapeHtml(item.consent_status || 'approved')}</span>
        </div>
      </div>
    `)
    .join('');
}

export function renderVoiceSessions(items = [], contacts = [], profiles = []) {
  if (!items.length) {
    return '<div class="check-item"><span>-</span><div><strong>No queued calls yet</strong><span>Queue a call to populate this list.</span></div></div>';
  }

  const contactsById = new Map(contacts.map((item) => [item.id, item]));
  const profilesById = new Map(profiles.map((item) => [item.id, item]));
  return items
    .slice(0, 6)
    .map((item) => {
      const contact = contactsById.get(item.contact_id);
      const profile = profilesById.get(item.voice_profile_id);
      const sentiment = String(item.analysis_sentiment || '').trim().toLowerCase();
      const summary = String(item.analysis_summary || '').trim();
      const followUpPlan = item.analysis_metadata?.follow_up_plan || {};
      const sessionState = String(item.analysis_status || item.status || 'queued').trim();
      const followUpNote = followUpPlan?.nextAction
        ? `${followUpPlan.nextAction} ${followUpPlan.followUpTiming ? `(${followUpPlan.followUpTiming})` : ''}`.trim()
        : '';
      return `
        <div class="check-item">
          <span>${sentiment ? sentiment.slice(0, 1).toUpperCase() : '-'}</span>
          <div>
            <strong>${escapeHtml(contact?.name || 'Unassigned contact')}</strong>
            <span>${escapeHtml(sessionState)} - ${escapeHtml(profile?.name || 'No voice profile')} - ${escapeHtml(formatRelativeDate(item.created_at))}</span>
            <span>${escapeHtml(summary || item.outcome || 'Waiting for Deepgram recap or operator outcome.')}</span>
            ${followUpNote ? `<span>${escapeHtml(followUpNote)}</span>` : ''}
          </div>
          <span class="badge ${sentiment ? sentimentTone(sentiment) : deliveryTone(sessionState)}">${escapeHtml(sentiment ? humanizeLabel(sentiment) : humanizeLabel(sessionState))}</span>
        </div>
      `;
    })
    .join('');
}

export function renderVoiceNotes(items = [], contacts = [], profiles = []) {
  if (!items.length) {
    return '<div class="check-item"><span>-</span><div><strong>No voice notes yet</strong><span>Saved call summaries will appear here.</span></div></div>';
  }

  const contactsById = new Map(contacts.map((item) => [item.id, item]));
  const profilesById = new Map(profiles.map((item) => [item.id, item]));
  return items
    .slice(0, 6)
    .map((item) => {
      const contact = contactsById.get(item.contact_id);
      const profile = profilesById.get(item.voice_profile_id);
      const sentiment = String(item.sentiment || '').trim().toLowerCase();
      const sentimentLabel = sentiment ? humanizeLabel(sentiment) : 'Unscored';
      const summary = String(item.summary || item.body || '').trim();
      const followUpPlan = item.metadata?.follow_up_plan || {};
      const noteLine = [
        contact?.name || 'Unassigned contact',
        profile?.name || 'No voice profile',
        item.voice_session_id ? 'Linked to call' : '',
        item.status || 'draft'
      ].filter(Boolean).join(' - ');
      const followUpLine = followUpPlan?.nextAction
        ? `${followUpPlan.leadTemperature ? `${humanizeLabel(followUpPlan.leadTemperature)} lead` : 'Follow-up ready'} - ${followUpPlan.nextAction}`
        : '';
      return `
        <div class="check-item">
          <span>${sentiment ? sentiment.slice(0, 1).toUpperCase() : '-'}</span>
          <div>
            <strong>${escapeHtml(item.title || 'Voice note')}</strong>
            <span>${escapeHtml(noteLine)}</span>
            <span>${escapeHtml(summary || 'Deepgram transcript summary will appear here after analysis.')}</span>
            ${followUpLine ? `<span>${escapeHtml(followUpLine)}</span>` : ''}
          </div>
          <span class="badge ${sentimentTone(sentiment)}">${escapeHtml(sentimentLabel)}</span>
        </div>
      `;
    })
    .join('');
}

export function syncSelectedConversation({
  auth,
  conversations,
  snapshot,
  contactDetail,
  contactTagSuggestions = [],
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
  workflowJobs = [],
  sequences = [],
  saveAppState
}) {
  const rawConversations = Array.isArray(snapshot?.conversations) ? snapshot.conversations : [];
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
  const activityEvents = Array.isArray(snapshot?.activityEvents) ? snapshot.activityEvents : [];
  const contactsById = new Map((snapshot?.contacts || []).map((item) => [item.id, item]));
  const selectedId = auth.selectedConversationId && rawConversations.find((item) => item.id === auth.selectedConversationId)
    ? auth.selectedConversationId
    : rawConversations[0]?.id || '';
  auth.selectedConversationId = selectedId;
  saveAppState({ selectedConversationId: selectedId });

  const selectedConversation = rawConversations.find((item) => item.id === selectedId);
  const normalizedConversation = conversations.find((item) => item.id === selectedId);

  if (!selectedConversation || !normalizedConversation) {
    if (selectedConversationTitle) selectedConversationTitle.textContent = 'Select a conversation';
    if (selectedConversationChannel) selectedConversationChannel.textContent = 'Waiting';
    if (selectedConversationStatus) selectedConversationStatus.textContent = 'Not loaded';
    if (selectedConversationOwner) selectedConversationOwner.textContent = 'Unassigned';
    if (selectedConversationUpdated) selectedConversationUpdated.textContent = 'Recently';
    if (threadPrioritySummary) threadPrioritySummary.textContent = 'Priority reasoning will appear here once a thread is selected.';
    if (conversationInsights) conversationInsights.innerHTML = '<div class="mini-status muted">Conversation health will appear here once a thread is selected.</div>';
    if (replyGuidance) replyGuidance.innerHTML = '<div class="mini-status muted">Channel-specific reply guidance will appear here.</div>';
    if (replyTarget) replyTarget.innerHTML = 'Send target details will appear here for the selected conversation.';
    if (threadWorkflow) threadWorkflow.innerHTML = '<div class="mini-status muted">Thread workflow coverage will appear here once a thread is selected.</div>';
    if (replyStatus) replyStatus.textContent = 'Send now publishes immediately. Queue for later stores the draft as queued work.';
    if (messageThread) messageThread.innerHTML = renderMessageThread([]);
    if (activityLog) activityLog.innerHTML = renderActivityLog([]);
    if (contactDetail) contactDetail.innerHTML = '<div class="mini-status muted">No contact selected.</div>';
    return;
  }

  const selectedContact = selectedConversation.contact_id ? contactsById.get(selectedConversation.contact_id) : null;
  if (selectedConversationTitle) selectedConversationTitle.textContent = normalizedConversation.name;
  if (selectedConversationChannel) selectedConversationChannel.textContent = normalizedConversation.channel;
  if (selectedConversationStatus) selectedConversationStatus.textContent = normalizedConversation.status;
  if (selectedConversationOwner) selectedConversationOwner.textContent = normalizedConversation.owner;
  if (selectedConversationUpdated) selectedConversationUpdated.textContent = normalizedConversation.updatedAt;
  if (threadPrioritySummary) threadPrioritySummary.textContent = renderThreadPrioritySummary(normalizedConversation);
  if (assignmentInput) assignmentInput.value = selectedConversation.assigned_to || selectedContact?.owner_name || '';
  const selectedMessages = messages
    .filter((item) => item.conversation_id === selectedId)
    .sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime());
    const selectedActivity = activityEvents
      .filter((item) => item.entity_type === 'conversation' && item.entity_id === selectedId)
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
    const selectedChannel = Array.isArray(snapshot?.channels)
      ? snapshot.channels.find((item) => String(item.provider || '').toLowerCase() === String(selectedConversation.source_provider || '').toLowerCase())
      : null;

    if (conversationInsights) {
      conversationInsights.innerHTML = renderConversationInsights(selectedConversation, selectedMessages, selectedActivity, selectedChannel);
    }
  if (replyGuidance) {
    replyGuidance.innerHTML = renderReplyGuidance(selectedConversation, selectedMessages);
  }
  if (replyTarget) {
    replyTarget.innerHTML = renderReplyTarget({
      ...selectedConversation,
      latestDeliveryState: normalizedConversation?.latestDeliveryState || ''
    });
  }
  if (threadWorkflow) {
    threadWorkflow.innerHTML = renderThreadWorkflowPanel(selectedConversation, workflowJobs, sequences);
  }
  if (replyStatus) {
    replyStatus.textContent = renderReplyComposerStatus(normalizedConversation);
  }

  if (messageThread) {
    messageThread.innerHTML = renderMessageThread(selectedMessages);
  }

  if (activityLog) {
    activityLog.innerHTML = renderActivityLog(selectedActivity);
  }

  if (contactDetail) {
    contactDetail.innerHTML = renderContactDetail(selectedContact || {
      name: normalizedConversation.name,
      company: normalizedConversation.company,
      stage: normalizedConversation.sentiment,
      owner: normalizedConversation.owner,
      tags: [normalizedConversation.channel]
    }, selectedConversation, activityEvents, contactTagSuggestions);
  }
}

export function setSelectOptions(node, items, getLabel, includeEmptyLabel) {
  if (!node) return;
  const options = [];
  if (includeEmptyLabel) {
    options.push(`<option value="">${escapeHtml(includeEmptyLabel)}</option>`);
  }
  options.push(
    ...items.map((item) => {
      const label = typeof getLabel === 'function' ? getLabel(item) : String(item?.label || item?.name || '');
      const value = item?.id || item?.value || label;
      return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    })
  );
  node.innerHTML = options.join('');
}
