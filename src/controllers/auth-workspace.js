import { describeWorkspaceRole, deriveWorkspaceRole, getWorkspacePermissions } from '../state/permissions.js';

export function createAuthWorkspaceController({
  auth,
  supabaseClient,
  backendService = null,
  saveAccessToken,
  saveRefreshToken,
  saveWorkspaceContext,
  clearWorkspaceContext,
  saveAppState,
  updateWorkspacePicker,
  setWorkspaceSummary,
  updateRuntimeView,
  setShellVisible,
  setAuthStatus,
  toast,
  statusNodes = {}
  }) {
  const { supabaseState = null, runtimeBadge = null, workspaceRole = null } = statusNodes;
  const demoWorkspaceUserId = 'demo-user';

  function setStatus(node, value) {
    if (node) node.textContent = value;
  }

  function showMaintenanceMode(message = 'Supabase is temporarily unreachable. Please refresh in a minute.') {
    clearWorkspaceContext();
    auth.workspaceId = '';
    auth.snapshot = null;
    setAuthStatus(`Maintenance mode: ${message}`);
    setStatus(supabaseState, 'Database unreachable. Refresh to try again.');
    setStatus(runtimeBadge, 'Maintenance mode');
    setStatus(workspaceRole, 'Role: unavailable');
    setShellVisible(false);
  }

  function showWorkspaceLoadIssue(message = 'Signed in, but the workspace is still loading. Please refresh.') {
    setAuthStatus(message);
    setStatus(supabaseState, 'Workspace session is active. Snapshot load needs another try.');
    setStatus(runtimeBadge, 'Workspace loading');
    setStatus(workspaceRole, 'Role: pending workspace data');
    setShellVisible(false);
  }

  function getSignupCooldownKey(email) {
    return `auraflow:last-signup:${String(email || '').trim().toLowerCase()}`;
  }

  function isSignupOnCooldown(email, cooldownMs = 10 * 60 * 1000) {
    const stamp = Number(window.localStorage.getItem(getSignupCooldownKey(email)) || 0);
    return stamp && Date.now() - stamp < cooldownMs;
  }

  function markSignupAttempt(email) {
    window.localStorage.setItem(getSignupCooldownKey(email), String(Date.now()));
  }

  function buildWorkspaceSlug(baseSlug, seed = '') {
    const normalizedSeed = String(seed || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 18);
    return normalizedSeed ? `${baseSlug}-${normalizedSeed}` : baseSlug;
  }

  async function loadWorkspaceSnapshot(workspaceId) {
    let backendError = null;
    if (backendService?.loadWorkspaceSnapshot) {
      try {
        const backendSnapshot = await backendService.loadWorkspaceSnapshot(workspaceId);
        if (backendSnapshot) return backendSnapshot;
      } catch (error) {
        backendError = error;
        console.warn('Backend snapshot load failed.', error);
      }
    }

    if (supabaseClient) {
      try {
        const browserSnapshot = await supabaseClient.loadWorkspaceSnapshot(workspaceId);
        if (browserSnapshot) return browserSnapshot;
      } catch (error) {
        console.warn('Browser snapshot load failed.', error);
        if (backendError) {
          throw new Error(`${backendError.message || 'Backend snapshot failed'}; ${error.message || 'Browser snapshot failed'}`);
        }
        throw error;
      }
    }

    if (backendError) {
      throw backendError;
    }
    return null;
  }

  async function listWorkspaces(userId) {
    if (backendService?.listWorkspaces) {
      try {
        return await backendService.listWorkspaces(userId);
      } catch (error) {
        console.warn('Backend workspace list failed.', error);
      }
    }
    return supabaseClient ? supabaseClient.listWorkspaces(userId) : [];
  }

  async function createWorkspace(name, slug, plan = 'starter') {
    if (backendService?.createWorkspace) {
      try {
        return await backendService.createWorkspace({ name, slug, plan });
      } catch (error) {
        console.warn('Backend workspace create failed.', error);
      }
    }
    return supabaseClient ? supabaseClient.createWorkspace({ name, slug, plan }) : null;
  }

  async function createWorkspaceMember(workspaceId, userId) {
    if (backendService?.createWorkspaceMember) {
      try {
        return await backendService.createWorkspaceMember(workspaceId, {
          user_id: userId,
          role: 'owner'
        });
      } catch (error) {
        console.warn('Backend workspace member create failed.', error);
      }
    }

    return supabaseClient
      ? supabaseClient.createWorkspaceMember({
        workspaceId,
        userId,
        role: 'owner'
      })
      : null;
  }

  async function selectWorkspace(workspaceId) {
    if (!workspaceId) return;

    saveWorkspaceContext({ workspaceId });
    saveAppState({ workspaceId });
    auth.workspaceId = workspaceId;

    try {
      const workspace = auth.workspaces.find((item) => item.id === workspaceId);
      const snapshot = await loadWorkspaceSnapshot(workspaceId);
      if (!snapshot) {
        showWorkspaceLoadIssue('Signed in, but workspace data is still loading. Please refresh and try again.');
        return false;
      }
      auth.snapshot = snapshot;
      auth.role = deriveWorkspaceRole(snapshot.members, auth.user?.id || demoWorkspaceUserId, 'owner');
      auth.permissions = getWorkspacePermissions(auth.role);
      setWorkspaceSummary(workspace);
      try {
        updateRuntimeView(snapshot);
      } catch (renderError) {
        console.warn('Workspace render failed after snapshot load.', renderError);
        showWorkspaceLoadIssue('Signed in, but the workspace UI needs a refresh before it can finish loading.');
        return false;
      }
      setShellVisible(true);
      setAuthStatus(`Workspace loaded: ${workspaceId}.`);
      setStatus(supabaseState, `Supabase live: ${snapshot.conversations?.length || 0} conversations synced.`);
      setStatus(runtimeBadge, 'Live data');
      setStatus(workspaceRole, `Role: ${describeWorkspaceRole(auth.role)}`);
      toast(supabaseClient ? 'Workspace loaded from Supabase.' : 'Demo workspace loaded.');
      return true;
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('rls') || message.includes('access denied') || message.includes('workspace data is unavailable')) {
        showWorkspaceLoadIssue('Signed in, but workspace access is temporarily restricted. Please refresh and try again.');
      } else if (message.includes('timed out') || message.includes('timeout') || message.includes('network') || message.includes('fetch')) {
        showWorkspaceLoadIssue('Signed in, but the workspace snapshot is still loading from Supabase. Please refresh in a moment.');
      } else {
        showWorkspaceLoadIssue('Signed in, but workspace data could not finish loading. Please refresh.');
      }
      console.warn('Workspace selection failed.', error);
      return false;
    }
  }

  async function listWorkspacesForUser(userId) {
    return listWorkspaces(userId);
  }

  async function createWorkspaceBootstrap(userId) {
    const fallbackName = 'Northstar Commerce';
    const fallbackSlug = fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const workspaceSlug = buildWorkspaceSlug(fallbackSlug, userId || demoWorkspaceUserId);

    try {
      const created = await createWorkspace(fallbackName, workspaceSlug, 'starter');
      const workspace = Array.isArray(created) ? created[0] : created;
      if (workspace?.id) {
        await createWorkspaceMember(workspace.id, userId);
      }
      return workspace;
    } catch (error) {
      console.warn('Workspace bootstrap create failed.', error);
      const existing = await listWorkspacesForUser(userId).catch(() => []);
      if (Array.isArray(existing) && existing.length) {
        return existing[0];
      }
      return null;
    }
  }

  async function finishAuthSession(email, session) {
    if (!supabaseClient) {
      if (await loadDemoWorkspace()) {
        return;
      }
      throw new Error('Supabase is not configured.');
    }

    const accessToken = session?.access_token || session?.session?.access_token;
    const refreshToken = session?.refresh_token || session?.session?.refresh_token || '';
    if (!accessToken) {
      if (session?.user && !session?.session) {
        saveWorkspaceContext({ sessionEmail: email });
        auth.sessionEmail = email;
        setAuthStatus(`Account created for ${email}. Check your inbox for the Supabase confirmation email, open the link, then sign in here.`);
        setStatus(supabaseState, 'Awaiting email confirmation.');
        setStatus(runtimeBadge, 'Signup pending');
        setStatus(workspaceRole, 'Role: pending confirmation');
        setShellVisible(false);
        toast('Account created. Supabase sent a confirmation email.');
        return { pendingConfirmation: true };
      }
      throw new Error('Supabase did not return a session.');
    }

    saveAccessToken(accessToken);
    if (refreshToken) saveRefreshToken(refreshToken);
    supabaseClient.setAccessToken(accessToken);
    const user = await supabaseClient.getUser(accessToken);
    saveWorkspaceContext({ sessionEmail: email });

    auth.user = user;
    auth.accessToken = accessToken;
    auth.refreshToken = refreshToken || auth.refreshToken || '';
    auth.sessionEmail = email;
    setAuthStatus(`Signed in as ${email}. Loading workspace...`);

    const workspaces = await listWorkspacesForUser(user.id);
    auth.workspaces = Array.isArray(workspaces) ? workspaces : [];

    if (!auth.workspaces.length) {
      const workspace = await createWorkspaceBootstrap(user.id);
      if (workspace?.id) auth.workspaces = [workspace];
    }

    updateWorkspacePicker(auth.workspaces);
    if (auth.workspaces[0]) {
      await selectWorkspace(auth.workspaces[0].id);
    } else {
      setAuthStatus('Signed in, but no workspace is available yet.');
    }
  }

  async function signIn(email, password) {
    if (!supabaseClient) {
      throw new Error('Supabase is not configured.');
    }

    const session = await supabaseClient.signInWithPassword(email, password);
    await finishAuthSession(email, session);
  }

  async function createAccount(email, password) {
    if (!supabaseClient) {
      throw new Error('Supabase is not configured.');
    }

    if (isSignupOnCooldown(email)) {
      throw new Error('We already tried creating this account recently. Wait a few minutes, then try again or use a different email.');
    }

    markSignupAttempt(email);
    const session = await supabaseClient.signUpWithPassword(email, password);
    await finishAuthSession(email, session);
  }

  async function restoreSession() {
    if (!supabaseClient) {
      if (await loadDemoWorkspace()) {
        return;
      }
      setAuthStatus('Supabase not configured yet. Add env vars to continue.');
      updateWorkspacePicker([]);
      setShellVisible(false);
      return;
    }

    if (!auth.accessToken && !auth.refreshToken) {
      if (await loadDemoWorkspace()) {
        return;
      }
      setAuthStatus('Sign in to load your workspace.');
      updateWorkspacePicker([]);
      setShellVisible(false);
      return;
    }

    try {
      let accessToken = auth.accessToken || '';
      let refreshToken = auth.refreshToken || '';

      if (!accessToken && refreshToken) {
        const refreshed = await supabaseClient.refreshSession(refreshToken);
        accessToken = refreshed?.access_token || refreshed?.session?.access_token || '';
        refreshToken = refreshed?.refresh_token || refreshed?.session?.refresh_token || refreshToken;
      }

      let user;
      try {
        user = await supabaseClient.getUser(accessToken);
      } catch (error) {
        if (!refreshToken) throw error;
        const refreshed = await supabaseClient.refreshSession(refreshToken);
        accessToken = refreshed?.access_token || refreshed?.session?.access_token || '';
        refreshToken = refreshed?.refresh_token || refreshed?.session?.refresh_token || refreshToken;
        user = await supabaseClient.getUser(accessToken);
      }

      saveAccessToken(accessToken);
      if (refreshToken) saveRefreshToken(refreshToken);
      supabaseClient.setAccessToken(accessToken);
      auth.user = user;
      auth.accessToken = accessToken;
      auth.refreshToken = refreshToken;
      const workspaces = await listWorkspacesForUser(user.id);
      auth.workspaces = Array.isArray(workspaces) ? workspaces : [];
      updateWorkspacePicker(auth.workspaces);
      if (auth.workspaces.length) {
        const selected = auth.workspaceId && auth.workspaces.find((item) => item.id === auth.workspaceId)
          ? auth.workspaceId
          : auth.workspaces[0].id;
        await selectWorkspace(selected);
        return;
      }

      setAuthStatus('Signed in, but no workspace was found. Create one to continue.');
      setShellVisible(false);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (
        message.includes('workspace data is unavailable')
        || message.includes('failed to load workspace')
        || message.includes('fetch')
        || message.includes('network')
        || message.includes('supabase')
        || message.includes('rls')
      ) {
        showMaintenanceMode('Supabase is temporarily unreachable. Please refresh in a minute.');
      } else {
        clearWorkspaceContext();
        auth.accessToken = '';
        auth.refreshToken = '';
        auth.workspaceId = '';
        auth.user = null;
        setAuthStatus('Session expired. Please sign in again.');
        setShellVisible(false);
      }
      console.warn(error);
    }
  }

  async function loadDemoWorkspace() {
    if (!backendService?.listWorkspaces || !backendService?.loadWorkspaceSnapshot) {
      return false;
    }

    const workspaces = await backendService.listWorkspaces(demoWorkspaceUserId).catch(() => []);
    auth.workspaces = Array.isArray(workspaces) ? workspaces : [];

    if (!auth.workspaces.length) {
      try {
        const created = await createWorkspace(
          'Northstar Commerce',
          buildWorkspaceSlug('northstar-commerce', demoWorkspaceUserId),
          'growth-suite'
        );
        const workspace = Array.isArray(created) ? created[0] : created;
        if (workspace?.id) {
          auth.workspaces = [workspace];
        }
      } catch (error) {
        console.warn('Demo workspace create failed.', error);
        const refreshed = await backendService.listWorkspaces(demoWorkspaceUserId).catch(() => []);
        auth.workspaces = Array.isArray(refreshed) ? refreshed : [];
      }
    }

    updateWorkspacePicker(auth.workspaces);
    if (!auth.workspaces.length) {
      return false;
    }

    const selectedWorkspace = auth.workspaces[0];
    const snapshot = await loadWorkspaceSnapshot(selectedWorkspace.id).catch((error) => {
      console.warn('Demo workspace snapshot load failed.', error);
      return null;
    });
    if (!snapshot) {
      showMaintenanceMode('The demo workspace is temporarily unavailable. Please refresh.');
      return false;
    }
    auth.workspaceId = selectedWorkspace.id;
    auth.snapshot = snapshot;
    auth.role = deriveWorkspaceRole(snapshot.members, demoWorkspaceUserId, 'owner');
    auth.permissions = getWorkspacePermissions(auth.role);
    auth.user = { id: demoWorkspaceUserId, email: 'demo@auraflow.local' };
    auth.accessToken = '';
    auth.sessionEmail = 'demo@auraflow.local';
    saveWorkspaceContext({ workspaceId: selectedWorkspace.id, sessionEmail: auth.sessionEmail });
    saveAppState({ workspaceId: selectedWorkspace.id });
    setWorkspaceSummary(selectedWorkspace);
    updateRuntimeView(snapshot);
    setShellVisible(true);
    setAuthStatus(`Demo workspace loaded: ${selectedWorkspace.id}.`);
    setStatus(supabaseState, `Demo data: ${snapshot.conversations?.length || 0} conversations synced.`);
    setStatus(runtimeBadge, 'Demo data');
    setStatus(workspaceRole, `Role: ${describeWorkspaceRole(auth.role)}`);
    toast('Demo workspace loaded.');
    return true;
  }

  return {
    createAccount,
    finishAuthSession,
    isSignupOnCooldown,
    markSignupAttempt,
    restoreSession,
    selectWorkspace,
    signIn
  };
}
