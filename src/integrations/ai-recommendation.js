function normalizeText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function toTitleCase(value = '') {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function inferAssignee({ mode = '', output = '', conversation = {} } = {}) {
  const text = `${mode} ${output} ${conversation.subject || ''} ${conversation.summary || ''}`.toLowerCase();
  if (text.includes('refund') || text.includes('billing') || text.includes('chargeback') || text.includes('escalat')) {
    return 'Support Lead';
  }
  if (text.includes('sales') || text.includes('pricing') || text.includes('demo') || text.includes('trial') || text.includes('proposal')) {
    return 'Sales Team';
  }
  return conversation.assignedTo || conversation.assigned_to || 'Workspace operator';
}

function inferFollowUpTiming({ mode = '', output = '', conversation = {} } = {}) {
  const text = `${mode} ${output} ${conversation.priority || ''}`.toLowerCase();
  if (text.includes('urgent') || text.includes('high')) return 'Within 30 minutes';
  if (text.includes('billing') || text.includes('refund') || text.includes('chargeback')) return 'Within 1 hour';
  if (text.includes('sales') || text.includes('demo') || text.includes('pricing')) return 'Later today';
  return 'Next business day';
}

function inferHandoffReason({ mode = '', output = '', conversation = {} } = {}) {
  const text = `${mode} ${output} ${conversation.subject || ''} ${conversation.summary || ''}`.trim();
  if (!text) return 'Review the current thread before taking the next step.';
  if (/refund|billing|chargeback|escalat/i.test(text)) {
    return 'Escalation signal detected in the current thread.';
  }
  if (/demo|pricing|proposal|trial/i.test(text)) {
    return 'Sales opportunity detected and should be routed to a closer.';
  }
  return text;
}

export function buildAiRecommendationCard({
  mode = 'reply',
  output = '',
  conversation = {},
  workspaceName = 'AuraFlow Workspace',
  classification = '',
  suggestedAssignee = '',
  followUpTiming: providedFollowUpTiming = '',
  handoffReason: providedHandoffReason = '',
  actionLabel: providedActionLabel = '',
  confidence = null
} = {}) {
  const safeConversationName = normalizeText(conversation?.name || conversation?.subject, 'Selected conversation');
  const recommendedAssignee = normalizeText(suggestedAssignee, inferAssignee({ mode, output, conversation }));
  const followUpTiming = normalizeText(providedFollowUpTiming, inferFollowUpTiming({ mode, output, conversation }));
  const handoffReason = normalizeText(providedHandoffReason, inferHandoffReason({ mode, output, conversation }));
  const summary = normalizeText(output, 'No recommendation returned yet.');
  const confidenceScore = Number(confidence);
  const normalizedClassification = normalizeText(classification, '');
  const cardTone = /refund|billing|chargeback|escalat/i.test(`${handoffReason} ${normalizedClassification}`)
    || (Number.isFinite(confidenceScore) && confidenceScore > 0 && confidenceScore < 0.45)
    ? 'warning'
    : /sales|demo|pricing|trial/i.test(`${handoffReason} ${normalizedClassification}`)
      ? 'accent'
      : 'neutral';
  const actionLabel = normalizeText(
    providedActionLabel,
    mode === 'summary'
      ? 'Summarize and assign'
      : mode === 'classify'
        ? 'Classify and triage'
        : mode === 'next_action'
          ? 'Create workflow job'
          : mode === 'briefing'
            ? 'Run full assist'
            : 'Generate reply and route'
  );

  return {
    title: `Recommendation for ${safeConversationName}`,
    workspaceName,
    mode,
    summary,
    classification: normalizedClassification,
    confidence: Number.isFinite(confidenceScore) ? confidenceScore : null,
    recommendedAssignee,
    followUpTiming,
    handoffReason,
    cardTone,
    actionLabel
  };
}

export function renderAiRecommendationCard(recommendation = {}) {
  const title = normalizeText(recommendation.title, 'Recommendation card');
  const summary = normalizeText(recommendation.summary, 'No recommendation available yet.');
  const assignee = normalizeText(recommendation.recommendedAssignee, 'Workspace operator');
  const followUpTiming = normalizeText(recommendation.followUpTiming, 'Next business day');
  const handoffReason = normalizeText(recommendation.handoffReason, 'Review the thread before routing it.');
  const tone = normalizeText(recommendation.cardTone, 'neutral');
  const actionLabel = normalizeText(recommendation.actionLabel, 'Choose action');
  const classification = normalizeText(recommendation.classification, '');
  const confidence = Number(recommendation.confidence);
  const confidenceLabel = Number.isFinite(confidence) && confidence > 0
    ? `${Math.round(confidence * 100)}% confidence`
    : '';
  return `
    <div class="check-item">
      <span>${normalizeText(title.slice(0, 2), 'AI').toUpperCase()}</span>
      <div>
        <strong>${title}</strong>
        <span>${summary}</span>
        ${classification ? `<span>Classification: ${classification}</span>` : ''}
        <span>Recommended action: ${actionLabel}</span>
        <span>Suggested assignee: ${toTitleCase(assignee)}</span>
        <span>Follow-up timing: ${followUpTiming}</span>
        <span>Handoff reason: ${handoffReason}</span>
        ${confidenceLabel ? `<span>${confidenceLabel}</span>` : ''}
        <div class="composer-actions">
          <button class="ghost-button compact" type="button" data-action="create-ai-workflow-job" data-choice="assign">Assign</button>
          <button class="ghost-button compact" type="button" data-action="create-ai-workflow-job" data-choice="follow_up">Follow up</button>
          <button class="ghost-button compact" type="button" data-action="create-ai-workflow-job" data-choice="handoff">Hand off</button>
        </div>
      </div>
      <span class="badge ${tone}">${actionLabel}</span>
    </div>
  `;
}
