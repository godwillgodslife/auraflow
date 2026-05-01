import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishWorkspaceEvent } from './realtime-bus.js';

const jobStore = new Map();
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stateFile = path.join(workspaceRoot, '.auraflow', 'job-queue-state.json');
let stateLoaded = false;
let retrySweepStarted = false;
let retrySweepTimer = null;

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix, seed = '') {
  const suffix = String(seed || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'job';
  return `${prefix}-${suffix}-${Date.now().toString(36)}`;
}

function cloneJob(job) {
  return job ? JSON.parse(JSON.stringify(job)) : null;
}

function normalizeJob(job = {}) {
  const status = String(job.status || 'queued').toLowerCase();
  return {
    id: String(job.id || makeId('job')),
    workspace_id: String(job.workspace_id || '').trim(),
    type: String(job.type || 'workflow.unknown').trim(),
    status,
    payload: job.payload && typeof job.payload === 'object' ? job.payload : {},
    assigned_to: String(job.assigned_to || '').trim(),
    assigned_at: job.assigned_at || '',
    completed_at: job.completed_at || '',
    escalated_at: job.escalated_at || '',
    note: String(job.note || '').trim(),
    retry_count: Number(job.retry_count || 0),
    max_retries: Number(job.max_retries || 5),
    retry_delay_ms: Number(job.retry_delay_ms || 15000),
    next_retry_at: job.next_retry_at || '',
    last_error: String(job.last_error || '').trim(),
    created_at: job.created_at || nowIso(),
    updated_at: job.updated_at || nowIso()
  };
}

function ensureLoaded() {
  if (stateLoaded) return;
  stateLoaded = true;

  if (!existsSync(stateFile)) return;

  try {
    const raw = readFileSync(stateFile, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const workspaces = parsed?.workspaces && typeof parsed.workspaces === 'object'
      ? parsed.workspaces
      : parsed && typeof parsed === 'object' && Array.isArray(parsed.jobs)
        ? { default: parsed.jobs }
        : parsed && typeof parsed === 'object' && Array.isArray(parsed.workspaces)
          ? Object.fromEntries(parsed.workspaces.map((entry) => [entry.workspaceId || entry.workspace_id, entry.jobs || []]))
          : {};
    for (const [workspaceId, jobs] of Object.entries(workspaces)) {
      const key = String(workspaceId || '').trim();
      if (!key) continue;
      const normalizedJobs = Array.isArray(jobs) ? jobs.map((job) => normalizeJob(job)).filter((job) => job.id) : [];
      jobStore.set(key, normalizedJobs);
    }
  } catch (error) {
    console.warn('Failed to load workflow job state.', error);
  }
}

function persistState() {
  try {
    mkdirSync(path.dirname(stateFile), { recursive: true });
    const payload = {
      version: 1,
      updated_at: nowIso(),
      workspaces: Object.fromEntries(
        [...jobStore.entries()].map(([workspaceId, jobs]) => [workspaceId, jobs.map((job) => cloneJob(job))])
      )
    };
    writeFileSync(stateFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn('Failed to persist workflow job state.', error);
  }
}

function computeRetryDelay(job = {}, attempt = 0) {
  const base = Number(job.retry_delay_ms || 15000);
  const cappedBase = Number.isFinite(base) && base > 0 ? base : 15000;
  return Math.min(cappedBase * Math.max(1, 2 ** Math.max(0, attempt - 1)), 30 * 60 * 1000);
}

function sweepRetryingJobs() {
  const now = Date.now();
  let changed = false;
  for (const [workspaceId, jobs] of jobStore.entries()) {
    for (const job of jobs) {
      const nextRetryAt = job.next_retry_at ? Date.parse(job.next_retry_at) : NaN;
      if (!nextRetryAt || Number.isNaN(nextRetryAt) || nextRetryAt > now) continue;
      if (!['retrying', 'failed'].includes(String(job.status || '').toLowerCase())) continue;
      if (Number(job.retry_count || 0) >= Number(job.max_retries || 5)) continue;
      job.status = 'queued';
      job.updated_at = nowIso();
      job.next_retry_at = '';
      job.last_error = '';
      changed = true;
      publishWorkspaceEvent(workspaceId, {
        type: 'workspace.updated',
        mutationType: 'job.requeued',
        detail: { job: cloneJob(job) }
      });
    }
  }
  if (changed) persistState();
}

function startRetrySweep() {
  if (retrySweepStarted) return;
  retrySweepStarted = true;
  retrySweepTimer = setInterval(sweepRetryingJobs, 15000);
  retrySweepTimer.unref?.();
}

function getJobs(workspaceId) {
  ensureLoaded();
  startRetrySweep();
  const key = String(workspaceId || '').trim();
  if (!key) return [];
  if (!jobStore.has(key)) jobStore.set(key, []);
  return jobStore.get(key);
}

export function enqueueWorkspaceJob(workspaceId, type, payload = {}) {
  const key = String(workspaceId || '').trim();
  if (!key) return null;
  const jobs = getJobs(key);
  const job = normalizeJob({
    id: makeId('job', `${key}-${type}`),
    workspace_id: key,
    type,
    status: 'queued',
    payload,
    assigned_to: '',
    assigned_at: '',
    completed_at: '',
    escalated_at: '',
    note: '',
    retry_count: 0,
    max_retries: 5,
    retry_delay_ms: 15000,
    next_retry_at: '',
    last_error: '',
    created_at: nowIso(),
    updated_at: nowIso()
  });
  jobs.unshift(job);
  persistState();
  publishWorkspaceEvent(key, {
    type: 'workspace.updated',
    mutationType: 'job.queued',
    detail: { job }
  });

  return cloneJob(job);
}

export function updateWorkspaceJob(workspaceId, jobId, patch = {}) {
  const key = String(workspaceId || '').trim();
  const targetJobId = String(jobId || '').trim();
  if (!key || !targetJobId) return null;
  const jobs = getJobs(key);
  const job = jobs.find((item) => item.id === targetJobId);
  if (!job) return null;

  const nextStatus = String(patch.status || job.status || 'queued').toLowerCase();
  const nextPayload = patch.payload && typeof patch.payload === 'object'
    ? { ...job.payload, ...patch.payload }
    : job.payload;
  const assignedTo = patch.assigned_to || patch.assignee || job.assigned_to || '';
  const note = patch.note || job.note || '';
  const shouldRetry = patch.retry === true || nextStatus === 'retrying';

  job.status = nextStatus;
  job.payload = nextPayload;
  job.assigned_to = String(assignedTo || '').trim();
  job.note = String(note || '').trim();

  if (job.assigned_to && !job.assigned_at) {
    job.assigned_at = nowIso();
  }
  if (nextStatus === 'assigned') {
    job.assigned_at = patch.assigned_at || job.assigned_at || nowIso();
  }
  if (nextStatus === 'completed') {
    job.completed_at = patch.completed_at || nowIso();
  }
  if (nextStatus === 'escalated') {
    job.escalated_at = patch.escalated_at || nowIso();
  }
  if (patch.completed_at) job.completed_at = patch.completed_at;
  if (patch.escalated_at) job.escalated_at = patch.escalated_at;
  if (patch.assigned_at) job.assigned_at = patch.assigned_at;
  if (shouldRetry) {
    const nextCount = Number(job.retry_count || 0) + 1;
    job.retry_count = nextCount;
    job.last_error = String(patch.last_error || patch.error || job.last_error || '').trim();
    job.next_retry_at = patch.next_retry_at || new Date(Date.now() + computeRetryDelay(job, nextCount)).toISOString();
  }
  if (nextStatus === 'queued') {
    job.next_retry_at = '';
    job.last_error = '';
  }
  job.updated_at = nowIso();

  persistState();
  const mutationType = nextStatus === 'completed'
    ? 'job.completed'
    : nextStatus === 'escalated'
      ? 'job.escalated'
      : nextStatus === 'assigned'
        ? 'job.assigned'
        : nextStatus === 'retrying'
          ? 'job.retrying'
        : 'job.updated';
  publishWorkspaceEvent(key, {
    type: 'workspace.updated',
    mutationType,
    detail: { job: cloneJob(job) }
  });

  return cloneJob(job);
}

export function scheduleWorkspaceJobRetry(workspaceId, jobId, error = '', patch = {}) {
  return updateWorkspaceJob(workspaceId, jobId, {
    ...patch,
    status: 'retrying',
    retry: true,
    error: String(error || '').trim(),
    last_error: String(error || '').trim()
  });
}

export function listWorkspaceJobs(workspaceId) {
  return getJobs(workspaceId).map((job) => cloneJob(job));
}

export function listWorkspaceJobWorkspaces() {
  ensureLoaded();
  startRetrySweep();
  return [...jobStore.keys()];
}
