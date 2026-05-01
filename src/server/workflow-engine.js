function normalizeText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function collectMessageText(normalized = {}) {
  const messages = Array.isArray(normalized.messages) ? normalized.messages : [];
  return messages
    .map((message) => `${message.senderName || ''} ${message.body || ''}`)
    .join(' ')
    .toLowerCase();
}

function detectHandoffSignal(text = '') {
  const value = String(text || '').toLowerCase();
  const signals = ['refund', 'billing', 'chargeback', 'urgent', 'angry', 'escalat', 'cancel', 'cancelled', 'canceled'];
  return signals.some((signal) => value.includes(signal));
}

function detectSalesSignal(text = '') {
  const value = String(text || '').toLowerCase();
  const signals = ['demo', 'pricing', 'price', 'proposal', 'quote', 'book', 'trial', 'upgrade'];
  return signals.some((signal) => value.includes(signal));
}

export function buildInboundWorkflowPlan({ provider = '', normalized = {}, result = {} } = {}) {
  const normalizedProvider = normalizeText(provider || normalized.provider || result.provider, 'gmail').toLowerCase();
  const workspaceId = normalizeText(normalized.workspaceId || result.workspaceId || '');
  const conversationId = normalizeText(normalized.conversation?.externalId || result.conversation?.externalId || normalized.conversation?.external_id || '', '');
  const messages = Array.isArray(normalized.messages) ? normalized.messages : Array.isArray(result.messages) ? result.messages : [];
  const messageIds = messages.map((message) => message.externalId || message.external_id || message.id).filter(Boolean);
  const threadText = collectMessageText({ messages });
  const urgency = detectHandoffSignal(threadText) ? 'high' : 'normal';
  const summaryHint = messages[0]?.body || normalized.conversation?.summary || result.conversation?.summary || '';
  const jobs = [];

  if (!workspaceId) {
    return jobs;
  }

  jobs.push({
    type: 'workflow.inbound_recorded',
    payload: {
      provider: normalizedProvider,
      workspaceId,
      conversationId,
      messageIds,
      summaryHint,
      urgency
    }
  });

  if (conversationId && messageIds.length) {
    jobs.push({
      type: 'workflow.auto_triage',
      payload: {
        provider: normalizedProvider,
        workspaceId,
        conversationId,
        messageIds,
        urgency,
        action: urgency === 'high' ? 'handoff_review' : 'summarize_and_classify'
      }
    });
  }

  if (conversationId && messageIds.length) {
    const salesSignal = detectSalesSignal(threadText);
    if (salesSignal || urgency === 'high') {
      jobs.push({
        type: 'workflow.auto_assign',
        payload: {
          provider: normalizedProvider,
          workspaceId,
          conversationId,
          targetOwner: urgency === 'high' ? 'Support Lead' : 'Sales Team',
          reason: urgency === 'high' ? 'Escalation detected in inbound message.' : 'Sales signal detected in inbound message.'
        }
      });
    }

    if (salesSignal || urgency === 'high') {
      jobs.push({
        type: 'workflow.follow_up_suggestion',
        payload: {
          provider: normalizedProvider,
          workspaceId,
          conversationId,
          suggestion: urgency === 'high'
            ? 'Create a follow-up sequence after the handoff review completes.'
            : 'Draft a follow-up sequence for the lead while the conversation is warm.'
        }
      });
    }
  }

  if (urgency === 'high') {
    jobs.push({
      type: 'workflow.handoff_review',
      payload: {
        provider: normalizedProvider,
        workspaceId,
        conversationId,
        reason: 'Detected urgency or escalation signal in inbound message.'
      }
    });
  }

  return jobs;
}
