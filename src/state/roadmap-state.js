const ROADMAP_KEY = 'auraflow.roadmap-state';

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(ROADMAP_KEY);
    if (!raw) return { statuses: {}, changelog: [] };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? {
          statuses: parsed.statuses && typeof parsed.statuses === 'object' ? parsed.statuses : {},
          changelog: Array.isArray(parsed.changelog) ? parsed.changelog : []
        }
      : { statuses: {}, changelog: [] };
  } catch {
    return { statuses: {}, changelog: [] };
  }
}

function writeStoredState(nextState) {
  try {
    window.localStorage.setItem(ROADMAP_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore local storage failures in restricted environments.
  }
}

export function loadRoadmapState() {
  return readStoredState();
}

export function getRoadmapStatusMap() {
  return loadRoadmapState().statuses || {};
}

export function getRoadmapChangelog() {
  return loadRoadmapState().changelog || [];
}

export function updateRoadmapItemStatus(itemId, status, note = '') {
  const current = loadRoadmapState();
  const nextStatus = String(status || 'planned').toLowerCase();
  const key = String(itemId || '').trim();
  if (!key) return current;

  const entry = {
    id: key,
    status: nextStatus,
    note: String(note || '').trim(),
    updated_at: new Date().toISOString()
  };

  const nextState = {
    statuses: {
      ...current.statuses,
      [key]: entry
    },
    changelog: [
      {
        id: `${key}:${nextStatus}:${Date.now()}`,
        itemId: key,
        status: nextStatus,
        note: String(note || '').trim(),
        created_at: new Date().toISOString()
      },
      ...current.changelog
    ].slice(0, 40)
  };

  writeStoredState(nextState);
  return nextState;
}

export function bootstrapRoadmapState(items = []) {
  const current = loadRoadmapState();
  const nextStatuses = { ...current.statuses };
  let changed = false;

  for (const item of items) {
    const key = String(item?.id || '').trim();
    if (!key) continue;
    if (!nextStatuses[key]) {
      nextStatuses[key] = {
        id: key,
        status: String(item.status || 'planned').toLowerCase(),
        note: String(item.note || '').trim(),
        updated_at: new Date().toISOString()
      };
      changed = true;
    }
  }

  if (!changed) return current;

  const nextState = {
    statuses: nextStatuses,
    changelog: current.changelog || []
  };
  writeStoredState(nextState);
  return nextState;
}
