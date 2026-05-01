export function bindPreviewEvents({
  nodes = {},
  state = {},
  authFlow,
  setScreen,
  openSequenceModal,
  closeSequenceModal,
  refreshWorkspaceData,
  actionHandlers = {},
  toast,
  setAuthStatus,
  setAiStatus,
  setIngestStatus,
  handleConversationSelect,
  handleProviderConnect,
  handleWorkspaceSelect,
  syncScreenFromRoute
}) {
  const {
    menu,
    nav,
    closeNavButtons = [],
    navItems = [],
    actionButtons = [],
    closeModalButtons = [],
    backdrop,
    authForm,
    signupButton,
    createWorkspaceButton,
    workspaceList,
    searchForm,
    searchInput,
    dashboardConversations,
    providerGrid,
    connectionsList,
    appShell,
    authOverlay
  } = nodes;

  const actionErrors = new Set([
    'generate-ai-reply',
    'generate-ai-summary',
    'generate-ai-classification',
    'generate-ai-next-action'
  ]);
  const ingestErrors = new Set(['seed-gmail-thread', 'seed-whatsapp-thread']);

  function setAuthBusy(isBusy) {
    const disabled = Boolean(isBusy);
    authForm?.querySelectorAll('button, input').forEach((node) => {
      node.disabled = disabled;
    });
    signupButton && (signupButton.disabled = disabled);
    createWorkspaceButton && (createWorkspaceButton.disabled = disabled);
    authForm?.setAttribute('data-auth-busy', disabled ? 'true' : 'false');
  }

  menu?.addEventListener('click', () => nav?.classList.add('open'));
  closeNavButtons.forEach((button) => button.addEventListener('click', () => nav?.classList.remove('open')));
  navItems.forEach((button) => button.addEventListener('click', () => {
    setScreen(button.dataset.screen);
    nav?.classList.remove('open');
  }));

  const handleActionClick = async (button) => {
    const action = button.dataset.action;
    try {
      if (action === 'refresh-runtime') {
        await refreshWorkspaceData();
        return;
      }
      if (action === 'open-sequence-modal') {
        openSequenceModal();
        return;
      }
      const handler = actionHandlers[action];
      if (typeof handler === 'function') {
        await handler(button.dataset);
      }
    } catch (error) {
      if (actionErrors.has(action)) {
        setAiStatus(error?.message || 'AI draft failed.');
      }
      if (ingestErrors.has(action)) {
        setIngestStatus(error?.message || 'Inbound sync failed.');
      }
      toast(error?.message || 'Action failed.');
      console.warn(error);
    }
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    void handleActionClick(button);
  });

  closeModalButtons.forEach((button) => button.addEventListener('click', () => closeSequenceModal()));
  backdrop?.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeSequenceModal();
    }
  });

  authForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.querySelector('#auth-email')?.value?.trim();
    const password = document.querySelector('#auth-password')?.value || '';
    if (!email || !password) {
      setAuthStatus('Enter both email and password.');
      return;
    }

    try {
      setAuthBusy(true);
      setAuthStatus('Signing in...');
      await authFlow.signIn(email, password);
    } catch (error) {
      if (String(error?.message || '').includes('invalid_credentials')) {
        setAuthStatus('No user found for that email. Use Create account to bootstrap the workspace owner once.');
        return;
      }
      setAuthStatus(error?.message || 'Sign-in failed.');
      console.warn(error);
    } finally {
      setAuthBusy(false);
    }
  });

  signupButton?.addEventListener('click', async () => {
    const email = document.querySelector('#auth-email')?.value?.trim();
    const password = document.querySelector('#auth-password')?.value || '';
    if (!email || !password) {
      setAuthStatus('Enter both email and password.');
      return;
    }

    try {
      setAuthBusy(true);
      setAuthStatus('Creating account...');
      await authFlow.createAccount(email, password);
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('over_email_send_rate_limit')) {
        setAuthStatus('Supabase hit its email rate limit. Wait a few minutes or use a different email for the first bootstrap.');
      } else if (message.includes('User already registered')) {
        setAuthStatus('That email already exists. Use Sign in with the correct password.');
      } else {
        setAuthStatus(message || 'Account creation failed.');
      }
      console.warn(error);
    } finally {
      setAuthBusy(false);
    }
  });

  createWorkspaceButton?.addEventListener('click', async () => {
    const email = document.querySelector('#auth-email')?.value?.trim();
    const password = document.querySelector('#auth-password')?.value || '';
    if (!email || !password) {
      setAuthStatus('Enter your email and password first so AuraFlow can load or bootstrap the workspace.');
      return;
    }

    try {
      setAuthBusy(true);
      setAuthStatus('Signing in and checking workspace access...');
      await authFlow.signIn(email, password);
    } catch (error) {
      setAuthStatus(error?.message || 'Workspace bootstrap failed.');
      console.warn(error);
    } finally {
      setAuthBusy(false);
    }
  });

  workspaceList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-workspace-id]');
    if (!button) return;
    try {
      setAuthStatus(`Loading workspace ${button.dataset.workspaceId}...`);
      await handleWorkspaceSelect(button.dataset.workspaceId);
    } catch (error) {
      setAuthStatus(error?.message || 'Workspace load failed.');
      console.warn(error);
    }
  });

  searchForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const action = actionHandlers['search-workspace'];
    if (typeof action !== 'function') return;
    try {
      if (!String(searchInput?.value || '').trim()) {
        throw new Error('Enter a search query first.');
      }
      await action({ query: searchInput?.value || '' });
    } catch (error) {
      toast(error?.message || 'Search failed.');
      console.warn(error);
    }
  });

  dashboardConversations?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-conversation-id]');
    if (!button) return;
    await handleConversationSelect(button.dataset.conversationId);
  });

  providerGrid?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-provider-connect]');
    if (!button) return;
    try {
      await handleProviderConnect(button.dataset.providerConnect);
    } catch (error) {
      setIngestStatus(error?.message || 'Provider connect failed.');
      toast(error?.message || 'Provider connect failed.');
      console.warn(error);
    }
  });

  connectionsList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-provider-connect]');
    if (!button) return;
    try {
      await handleProviderConnect(button.dataset.providerConnect);
    } catch (error) {
      setIngestStatus(error?.message || 'Provider connect failed.');
      toast(error?.message || 'Provider connect failed.');
      console.warn(error);
    }
  });

  window.addEventListener('popstate', syncScreenFromRoute);

  return {
    teardown() {
      // The preview uses a single-page lifetime; teardown is reserved for later reuse.
      void appShell;
      void authOverlay;
    }
  };
}
