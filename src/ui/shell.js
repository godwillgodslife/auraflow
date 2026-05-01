import { escapeHtml } from './formatters.js';

export function setShellVisible({ appShell, authOverlay }, visible) {
  if (appShell) appShell.hidden = !visible;
  if (authOverlay) authOverlay.hidden = visible;
}

export function updateWorkspacePicker(workspaceList, workspaces = []) {
  if (!workspaceList) return;
  if (!workspaces.length) {
    workspaceList.innerHTML = '<div class="mini-status muted">No workspace found yet. Sign in first and AuraFlow can load or bootstrap one for you.</div>';
    return;
  }

  workspaceList.innerHTML = workspaces
    .map(
      (workspace) => `
        <button class="workspace-switcher" type="button" data-workspace-id="${escapeHtml(workspace.id)}">
          <div>
            <div class="workspace-label">Workspace</div>
            <strong>${escapeHtml(workspace.name)}</strong>
          </div>
          <span class="workspace-pill">${escapeHtml(workspace.plan || 'starter')}</span>
        </button>
      `
    )
    .join('');
}
