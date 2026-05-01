import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stateFile = path.join(workspaceRoot, '.auraflow', 'webhook-replay-state.json');
const replayStore = new Map();
let stateLoaded = false;

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function ensureLoaded() {
  if (stateLoaded) return;
  stateLoaded = true;

  if (!existsSync(stateFile)) return;

  try {
    const raw = readFileSync(stateFile, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const workspaces = parsed?.workspaces && typeof parsed.workspaces === 'object' ? parsed.workspaces : {};
    for (const [workspaceId, items] of Object.entries(workspaces)) {
      if (!workspaceId) continue;
      replayStore.set(workspaceId, Array.isArray(items) ? items : []);
    }
  } catch (error) {
    console.warn('Failed to load webhook replay state.', error);
  }
}

function persistState() {
  try {
    mkdirSync(path.dirname(stateFile), { recursive: true });
    const payload = {
      version: 1,
      updated_at: nowIso(),
      workspaces: Object.fromEntries(replayStore.entries())
    };
    writeFileSync(stateFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn('Failed to persist webhook replay state.', error);
  }
}

function getWorkspaceReplays(workspaceId) {
  ensureLoaded();
  const key = String(workspaceId || '').trim();
  if (!key) return [];
  if (!replayStore.has(key)) replayStore.set(key, []);
  return replayStore.get(key);
}

function getReplayStats(items = []) {
  return items.reduce((acc, item) => {
    if (item?.suppressed) acc.suppressed += 1;
    else acc.accepted += 1;
    return acc;
  }, { accepted: 0, suppressed: 0 });
}

export function buildWebhookReplayKey(normalized = {}) {
  const payload = {
    provider: String(normalized.provider || '').toLowerCase(),
    workspaceId: String(normalized.workspaceId || '').trim(),
    eventType: String(normalized.eventType || '').trim(),
    accountId: String(normalized.accountId || '').trim(),
    conversationId: String(normalized.conversation?.externalId || normalized.conversation?.external_id || '').trim(),
    messageIds: Array.isArray(normalized.messages)
      ? normalized.messages.map((message) => String(message.externalId || message.external_id || message.id || '').trim()).filter(Boolean)
      : [],
    verification: normalized.verification ? {
      transport: normalized.verification.transport || '',
      verified: Boolean(normalized.verification.verified),
      signatureVerified: Boolean(normalized.verification.signatureVerified)
    } : {}
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function hasSeenWebhookReplay(workspaceId, replayKey) {
  const key = String(workspaceId || '').trim();
  const token = String(replayKey || '').trim();
  if (!key || !token) return false;
  const items = getWorkspaceReplays(key);
  return items.some((item) => item.key === token);
}

export function recordWebhookReplay(workspaceId, replayKey, detail = {}) {
  const key = String(workspaceId || '').trim();
  const token = String(replayKey || '').trim();
  if (!key || !token) return false;
  const items = getWorkspaceReplays(key);
  if (items.some((item) => item.key === token)) {
    items.unshift({
      key: token,
      created_at: nowIso(),
      suppressed: true,
      reason: 'duplicate',
      detail: clone(detail)
    });
    if (items.length > 200) {
      items.length = 200;
    }
    persistState();
    return false;
  }

  items.unshift({
    key: token,
    created_at: nowIso(),
    suppressed: false,
    reason: 'accepted',
    detail: clone(detail)
  });

  if (items.length > 200) {
    items.length = 200;
  }

  persistState();
  return true;
}

export function registerWebhookReplay(workspaceId, normalized = {}) {
  const replayKey = buildWebhookReplayKey(normalized);
  return {
    replayKey,
    accepted: recordWebhookReplay(workspaceId || normalized.workspaceId, replayKey, normalized)
  };
}

export function listWebhookReplays(workspaceId) {
  return getWorkspaceReplays(workspaceId).map((item) => clone(item));
}

export function getWebhookReplay(workspaceId, replayKey) {
  const key = String(workspaceId || '').trim();
  const token = String(replayKey || '').trim();
  if (!key || !token) return null;
  const items = getWorkspaceReplays(key);
  const item = items.find((entry) => entry.key === token);
  return item ? clone(item) : null;
}

export function getWebhookReplayDiagnostics(workspaceId) {
  const items = listWebhookReplays(workspaceId);
  const stats = getReplayStats(items);
  return {
    accepted: stats.accepted,
    suppressed: stats.suppressed,
    total: items.length,
    latest_at: items[0]?.created_at || '',
    items: items.slice(0, 12)
  };
}
