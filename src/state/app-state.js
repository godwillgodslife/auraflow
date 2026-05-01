import { DEFAULT_SCREEN, isValidScreen } from '../routing/screens.js';

const STORAGE_KEY = 'auraflow.ui-state';
const DEFAULT_INBOX_FILTER = 'all';
const MAX_STORED_AI_TEXT = 600;
const DEFAULT_THEME_PREFERENCE = 'system';

export function normalizeThemePreference(value, fallback = DEFAULT_THEME_PREFERENCE) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['system', 'light', 'dark'].includes(normalized) ? normalized : fallback;
}

function normalizeInboxFilter(value, fallback = DEFAULT_INBOX_FILTER) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['all', 'mine', 'missed_call', 'sms_followup', 'unassigned', 'escalated', 'attention', 'verified', 'test'].includes(normalized)
    ? normalized
    : fallback;
}

export function normalizeScreen(screen, fallback = DEFAULT_SCREEN) {
  const value = String(screen || '').trim();
  if (isValidScreen(value)) return value;
  return isValidScreen(fallback) ? fallback : DEFAULT_SCREEN;
}

function normalizeAiText(value, fallback = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, MAX_STORED_AI_TEXT);
}

function normalizeAiSequenceSuggestion(value = {}) {
  if (!value || typeof value !== 'object') return {};
  return {
    name: normalizeAiText(value.name),
    trigger: normalizeAiText(value.trigger),
    channel: normalizeAiText(value.channel),
    goal: normalizeAiText(value.goal),
    notes: normalizeAiText(value.notes),
    steps: Array.isArray(value.steps)
      ? value.steps.map((item) => normalizeAiText(item)).filter(Boolean).slice(0, 8)
      : []
  };
}

function normalizeAiBriefing(value = {}) {
  if (!value || typeof value !== 'object') return null;
  const next = {
    summary: normalizeAiText(value.summary),
    classification: normalizeAiText(value.classification),
    nextAction: normalizeAiText(value.nextAction),
    reply: normalizeAiText(value.reply),
    model: normalizeAiText(value.model),
    suggestedAssignee: normalizeAiText(value.suggestedAssignee),
    followUpTiming: normalizeAiText(value.followUpTiming),
    handoffReason: normalizeAiText(value.handoffReason),
    leadScoreLabel: normalizeAiText(value.leadScoreLabel),
    leadScoreReason: normalizeAiText(value.leadScoreReason),
    sequenceSuggestion: normalizeAiSequenceSuggestion(value.sequenceSuggestion)
  };
  const confidence = Number(value.confidence ?? 0);
  if (Number.isFinite(confidence) && confidence > 0) {
    next.confidence = Math.max(0, Math.min(1, confidence));
  }
  return Object.values(next).some((entry) => {
    if (Array.isArray(entry)) return entry.length > 0;
    if (entry && typeof entry === 'object') return Object.keys(entry).length > 0;
    return Boolean(entry);
  }) ? next : null;
}

function normalizeOnboardingState(value = {}) {
  if (!value || typeof value !== 'object') {
    return { dismissedWorkspaceIds: [] };
  }
  return {
    dismissedWorkspaceIds: Array.isArray(value.dismissedWorkspaceIds)
      ? value.dismissedWorkspaceIds.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 50)
      : []
  };
}

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredState(nextState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage failures in private browsing or blocked environments.
  }
}

export function readRouteScreen() {
  if (typeof window === 'undefined') return '';

  const params = new URLSearchParams(window.location.search);
  return String(params.get('screen') || '').trim();
}

export function setRouteScreen(screen, { replace = false } = {}) {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const value = normalizeScreen(screen, '');

  if (value) {
    url.searchParams.set('screen', value);
  } else {
    url.searchParams.delete('screen');
  }

  const nextUrl = url.toString();
  if (replace) {
    window.history.replaceState({}, '', nextUrl);
  } else {
    window.history.pushState({}, '', nextUrl);
  }
}

export function loadAppState({ defaultScreen = DEFAULT_SCREEN } = {}) {
  const stored = readStoredState();
  const routeScreen = readRouteScreen();

  return {
    screen: normalizeScreen(routeScreen || stored.screen, defaultScreen),
    selectedConversationId: String(stored.selectedConversationId || '').trim(),
    selectedSequenceId: String(stored.selectedSequenceId || '').trim(),
    searchQuery: String(stored.searchQuery || '').trim(),
    inboxFilter: normalizeInboxFilter(stored.inboxFilter),
    workspaceId: String(stored.workspaceId || '').trim(),
    aiBriefing: normalizeAiBriefing(stored.aiBriefing),
    onboarding: normalizeOnboardingState(stored.onboarding),
    themePreference: normalizeThemePreference(stored.themePreference)
  };
}

export function saveAppState(patch = {}) {
  const nextState = {
    ...readStoredState(),
    ...patch
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'screen')) {
    nextState.screen = normalizeScreen(patch.screen, DEFAULT_SCREEN);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'selectedConversationId')) {
    nextState.selectedConversationId = String(patch.selectedConversationId || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'selectedSequenceId')) {
    nextState.selectedSequenceId = String(patch.selectedSequenceId || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'searchQuery')) {
    nextState.searchQuery = String(patch.searchQuery || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'inboxFilter')) {
    nextState.inboxFilter = normalizeInboxFilter(patch.inboxFilter);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'workspaceId')) {
    nextState.workspaceId = String(patch.workspaceId || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'aiBriefing')) {
    nextState.aiBriefing = normalizeAiBriefing(patch.aiBriefing);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'onboarding')) {
    nextState.onboarding = normalizeOnboardingState(patch.onboarding);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'themePreference')) {
    nextState.themePreference = normalizeThemePreference(patch.themePreference);
  }

  writeStoredState(nextState);
  return nextState;
}

export function clearAppState() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
