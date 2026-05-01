import { BACKEND_CONTRACT } from '../contracts/auraflow-contract.js';

function buildFunctionUrl(name) {
  return `/.netlify/functions/${name}`;
}

function buildRouteUrl(pathname, params = {}) {
  return String(pathname || '').replace(/:([a-z0-9_]+)/gi, (_, key) => {
    const value = params[key];
    return encodeURIComponent(value == null ? '' : String(value));
  });
}

async function requestJson(url, { method = 'GET', body = null, timeoutMs = 4500 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Backend request timed out for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (!response.ok) {
    try {
      const parsed = text ? JSON.parse(text) : {};
      throw new Error(parsed?.error || text || `Request failed with ${response.status}`);
    } catch {
      throw new Error(text || `Request failed with ${response.status}`);
    }
  }

  return text ? JSON.parse(text) : {};
}

export function createBackendService() {
  const endpoints = BACKEND_CONTRACT.endpoints;

function requestContract(section, key, { params = {}, body = null, method = 'GET', query = '', timeoutMs } = {}) {
    const route = endpoints?.[section]?.[key];
    if (!route) {
      throw new Error(`Unknown backend contract route: ${section}.${key}`);
    }

    const [routeMethod = method, routePath = ''] = String(route).split(/\s+/, 2);
    const finalMethod = routeMethod || method;
    const resolvedPath = buildRouteUrl(routePath, params);
    const urlPath = resolvedPath.replace(/^\//, '');
    const url = `${buildFunctionUrl(urlPath)}${query ? `?${query}` : ''}`;
    return requestJson(url, { method: finalMethod, body, timeoutMs });
  }

  return {
    contract: BACKEND_CONTRACT,
    request(method, functionName, body = null) {
      return requestJson(buildFunctionUrl(functionName), { method, body });
    },
    requestJson,
    requestContract,
    signIn(payload) {
      return requestContract('auth', 'signIn', { method: 'POST', body: payload });
    },
    signUp(payload) {
      return requestContract('auth', 'signUp', { method: 'POST', body: payload });
    },
    loadSession() {
      return requestContract('auth', 'session');
    },
    signOut(payload) {
      return requestContract('auth', 'signOut', { method: 'POST', body: payload });
    },
    listWorkspaces(userId = '') {
      const query = userId ? `user_id=${encodeURIComponent(userId)}` : '';
      return requestContract('workspaces', 'list', { method: 'GET', query });
    },
    createWorkspace(payload) {
      return requestContract('workspaces', 'create', { method: 'POST', body: payload });
    },
    selectWorkspace(workspaceId, payload = {}) {
      return requestContract('workspaces', 'select', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    listWorkspaceMembers(workspaceId) {
      return requestContract('workspaces', 'members', { params: { id: workspaceId } });
    },
    createWorkspaceMember(workspaceId, payload) {
      return requestContract('workspaces', 'createMember', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    loadWorkspaceSnapshot(workspaceId) {
      return requestContract('inbox', 'snapshot', {
        params: { id: workspaceId },
        timeoutMs: 45000
      });
    },
    listWorkspaceConversations(workspaceId) {
      return requestContract('inbox', 'conversations', { params: { id: workspaceId } });
    },
    listConversationMessages(conversationId) {
      return requestContract('inbox', 'messages', { params: { id: conversationId } });
    },
    replyToConversation(conversationId, payload) {
      return requestContract('inbox', 'reply', { params: { id: conversationId }, method: 'POST', body: payload });
    },
    queueConversationReply(conversationId, payload) {
      return requestContract('inbox', 'queueReply', { params: { id: conversationId }, method: 'POST', body: payload });
    },
    updateConversation(conversationId, payload) {
      return requestContract('inbox', 'updateConversation', { params: { id: conversationId }, method: 'PATCH', body: payload });
    },
    updateMessageState(providerMessageId, payload) {
      return requestContract('messages', 'updateState', { params: { providerMessageId }, method: 'PATCH', body: payload });
    },
    listContacts(workspaceId) {
      return requestContract('contacts', 'list', { params: { id: workspaceId } });
    },
    upsertContact(workspaceId, payload) {
      return requestContract('contacts', 'upsert', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    backfillContactPhoneHealth(workspaceId) {
      return requestJson(buildFunctionUrl(`workspaces/${encodeURIComponent(workspaceId)}/contacts/backfill-phone-health`), {
        method: 'POST',
        timeoutMs: 120000
      });
    },
    updateContact(contactId, payload) {
      return requestContract('contacts', 'update', { params: { id: contactId }, method: 'PATCH', body: payload });
    },
    mergeContacts(contactId, payload) {
      return requestContract('contacts', 'merge', { params: { id: contactId }, method: 'POST', body: payload });
    },
    listChannels(workspaceId) {
      return requestContract('channels', 'list', { params: { id: workspaceId } });
    },
    createChannel(workspaceId, payload) {
      return requestContract('channels', 'create', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    updateChannel(channelId, payload) {
      return requestContract('channels', 'update', { params: { id: channelId }, method: 'PATCH', body: payload });
    },
    createConnectSession(payload) {
      const workspaceId = payload?.workspaceId || payload?.workspace_id || '';
      return requestContract('channels', 'connectSession', {
        params: { id: workspaceId },
        method: 'POST',
        body: payload
      });
    },
    listWorkspaceConnections(workspaceId) {
      return requestContract('connections', 'list', { params: { id: workspaceId } });
    },
    createWorkspaceConnection(workspaceId, payload) {
      return requestContract('connections', 'create', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    updateWorkspaceConnection(connectionId, payload) {
      return requestContract('connections', 'update', { params: { id: connectionId }, method: 'PATCH', body: payload });
    },
    startProviderOAuth(workspaceId, provider, payload = {}) {
      return requestContract('connections', 'start', {
        params: { id: workspaceId, provider },
        method: 'POST',
        body: payload
      });
    },
    syncChannels(workspaceId, payload) {
      return requestContract('channels', 'sync', {
        method: 'POST',
        body: {
          workspaceId,
          ...payload
        }
      });
    },
    listAgents(workspaceId) {
      return requestContract('agents', 'list', { params: { id: workspaceId } });
    },
    createAgent(workspaceId, payload) {
      return requestContract('agents', 'create', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    updateAgent(agentId, payload) {
      return requestContract('agents', 'update', { params: { id: agentId }, method: 'PATCH', body: payload });
    },
    createAiAssist(agentId, payload) {
      return requestContract('agents', 'draft', { params: { id: agentId }, method: 'POST', body: payload });
    },
    listFollowUpSequences(workspaceId) {
      return requestContract('followUps', 'list', { params: { id: workspaceId } });
    },
    createFollowUpSequence(workspaceId, payload) {
      return requestContract('followUps', 'create', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    updateFollowUpSequence(sequenceId, payload) {
      return requestContract('followUps', 'update', { params: { id: sequenceId }, method: 'PATCH', body: payload });
    },
    listVoiceProfiles(workspaceId) {
      return requestContract('voice', 'profiles', { params: { id: workspaceId } });
    },
    listVoiceRecords(workspaceId) {
      return requestContract('voice', 'list', { params: { id: workspaceId } });
    },
    listVoiceSessions(workspaceId) {
      return requestContract('voice', 'sessions', { params: { id: workspaceId } });
    },
    listVoiceNotes(workspaceId) {
      return requestContract('voice', 'notes', { params: { id: workspaceId } });
    },
    analyzeVoiceNote(workspaceId, payload) {
      return requestContract('voice', 'analyze', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    createTwilioVoiceToken(payload) {
      return requestJson(buildFunctionUrl('twilio-voice-token'), { method: 'POST', body: payload, timeoutMs: 20000 });
    },
    startSoftphoneCall(payload) {
      return requestJson(buildFunctionUrl('twilio-voice-call-start'), { method: 'POST', body: payload, timeoutMs: 20000 });
    },
    createVoiceProfile(workspaceId, payload) {
      return requestContract('voice', 'createProfile', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    createVoiceSession(workspaceId, payload) {
      return requestContract('voice', 'queue', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    updateVoiceSession(sessionId, payload) {
      return requestJson(`/api/voice-sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        body: payload,
        timeoutMs: 20000
      });
    },
    createVoiceNote(workspaceId, payload) {
      return requestContract('voice', 'note', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    listActivityEvents(workspaceId) {
      return requestContract('activity', 'list', { params: { id: workspaceId } });
    },
    createActivityEvent(workspaceId, payload) {
      return requestContract('activity', 'create', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    searchWorkspace(workspaceId, query) {
      return requestContract('search', 'query', { params: { id: workspaceId, query: query || '' } });
    },
    listSyncJobs(workspaceId) {
      return requestContract('jobs', 'list', { params: { id: workspaceId } });
    },
    createSyncJob(workspaceId, payload) {
      return requestContract('jobs', 'create', { params: { id: workspaceId }, method: 'POST', body: payload });
    },
    updateSyncJob(workspaceId, jobId, payload) {
      return requestContract('jobs', 'update', { params: { id: workspaceId, jobId }, method: 'PATCH', body: payload });
    },
    getWorkspaceReliability(workspaceId) {
      return requestContract('reliability', 'read', { params: { id: workspaceId } });
    },
    retryWebhookReplay(workspaceId, replayKey) {
      return requestContract('reliability', 'retryReplay', { params: { id: workspaceId, replayKey }, method: 'POST' });
    },
    requestAiReply(payload) {
      return requestContract('ai', 'reply', { method: 'POST', body: payload });
    },
    requestAiSummary(payload) {
      return requestContract('ai', 'summary', { method: 'POST', body: { ...payload, mode: 'summary' } });
    },
    requestAiClassification(payload) {
      return requestContract('ai', 'classify', { method: 'POST', body: { ...payload, mode: 'classify' } });
    },
    requestAiNextAction(payload) {
      return requestContract('ai', 'nextAction', { method: 'POST', body: { ...payload, mode: 'next_action' } });
    },
    requestAiBriefing(payload) {
      return requestContract('ai', 'briefing', { method: 'POST', body: { ...payload, mode: 'briefing' } });
    },
    requestVoiceAgentTurn(payload) {
      return requestContract('ai', 'voiceTurn', { method: 'POST', body: payload });
    },
    ingestProviderThread(payload) {
      return requestJson(buildFunctionUrl('provider-ingest'), { method: 'POST', body: payload });
    },
    ingestWebhookPayload(provider, payload) {
      return requestContract('webhooks', 'ingest', {
        params: { provider },
        method: 'POST',
        body: {
          provider,
          ...payload
        }
      });
    },
    testWebhookRelay(provider, payload) {
      return requestContract('webhooks', 'testRelay', {
        params: { provider },
        method: 'POST',
        body: {
          provider,
          ...payload
        }
      });
    },
    requestProviderReadiness(workspaceId = '') {
      const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
      return requestJson(`${buildFunctionUrl('provider-readiness')}${query}`);
    }
  };
}
