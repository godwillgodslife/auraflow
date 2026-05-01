let supabaseModulePromise = null;

async function loadSupabaseModule() {
  if (!supabaseModulePromise) {
    supabaseModulePromise = import('https://esm.sh/@supabase/supabase-js@2');
  }
  return supabaseModulePromise;
}

export function createSupabaseClient() {
  const config = window.__AURAFLOW_CONFIG__ || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;

  const baseUrl = config.supabaseUrl.replace(/\/$/, '');
  let accessToken = '';
  const headers = {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
    'Content-Type': 'application/json',
    'Accept-Profile': config.supabaseSchema || 'public',
    'Content-Profile': config.supabaseSchema || 'public'
  };
  const authHeaders = () => ({
    ...headers,
    Authorization: `Bearer ${accessToken || config.supabaseAnonKey}`
  });
  const buildRealtimeClient = async (token = '') => {
    const { createClient } = await loadSupabaseModule();
    const client = createClient(baseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    if (token) {
      client.realtime.setAuth(token);
    }
    return client;
  };

  return {
    setAccessToken(token) {
      accessToken = token || '';
    },
    async createRealtimeClient(token = '') {
      return buildRealtimeClient(token || accessToken || config.supabaseAnonKey);
    },
    async subscribeToWorkspaceChanges({ workspaceId, token = '', tables = ['messages', 'conversations', 'activity_events', 'channels'], onEvent, onStatus } = {}) {
      if (!workspaceId || !config.supabaseUrl || !config.supabaseAnonKey) return null;
      let client = null;
      try {
        client = await buildRealtimeClient(token || accessToken || config.supabaseAnonKey);
      } catch (error) {
        if (typeof onStatus === 'function') {
          onStatus('CHANNEL_ERROR');
        }
        return {
          client: null,
          channel: null,
          error,
          unsubscribe() {
            return Promise.resolve();
          }
        };
      }
      const channel = client.channel(`workspace:${workspaceId}`);

      tables.forEach((table) => {
        channel.on('postgres_changes', {
          event: '*',
          schema: config.supabaseSchema || 'public',
          table,
          filter: `workspace_id=eq.${workspaceId}`
        }, (payload) => {
          if (typeof onEvent === 'function') {
            onEvent({
              table,
              workspaceId,
              payload
            });
          }
        });
      });

      channel.subscribe((status) => {
        if (typeof onStatus === 'function') {
          onStatus(status);
        }
      });

      return {
        client,
        channel,
        unsubscribe() {
          return client.removeChannel(channel);
        }
      };
    },
    async subscribeToMessagesTable({ workspaceId, token = '', onEvent, onStatus } = {}) {
      return this.subscribeToWorkspaceChanges({
        workspaceId,
        token,
        tables: ['messages'],
        onEvent,
        onStatus
      });
    },
    async signInWithPassword(email, password) {
      const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password })
      });
      return readJson(response);
    },
    async signUpWithPassword(email, password) {
      const response = await fetch(`${baseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password })
      });
      return readJson(response);
    },
    async refreshSession(refreshToken) {
      const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      return readJson(response);
    },
    async getUser(accessToken) {
      const response = await fetch(`${baseUrl}/auth/v1/user`, {
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`
        }
      });
      return readJson(response);
    },
    async listWorkspaces(userId) {
      const response = await fetch(`${baseUrl}/rest/v1/workspace_members?user_id=eq.${encodeURIComponent(userId)}&select=workspace:workspaces(*)`, {
        headers: authHeaders()
      });
      const rows = await readJson(response);
      return Array.isArray(rows) ? rows.map((row) => row.workspace).filter(Boolean) : [];
    },
    async createWorkspace({ name, slug, plan = 'starter' }) {
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await fetch(`${baseUrl}/rest/v1/workspaces`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          Prefer: 'return=minimal'
        },
        body: JSON.stringify([{ id, name, slug, plan }])
      });
      await readJson(response);
      return { id, name, slug, plan };
    },
    async createWorkspaceMember({ workspaceId, userId, role = 'owner' }) {
      const response = await fetch(`${baseUrl}/rest/v1/workspace_members`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify([{ workspace_id: workspaceId, user_id: userId, role }])
      });
      return readJson(response);
    },
    async createVoiceProfile({ workspaceId, name, label, voiceSource = 'original', promptStyle = '', consentStatus = 'approved', isDefault = false }) {
      const response = await fetch(`${baseUrl}/rest/v1/voice_profiles`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify([{
          workspace_id: workspaceId,
          name,
          label,
          voice_source: voiceSource,
          prompt_style: promptStyle,
          consent_status: consentStatus,
          is_default: isDefault
        }])
      });
      return readJson(response);
    },
    async createVoiceSession({ workspaceId, contactId, voiceProfileId, status = 'queued', disclosureText = '', sessionType = 'call', outcome = '', analysisStatus = '', analysisSummary = '', analysisSentiment = '', analysisMetadata = {} }) {
      const response = await fetch(`${baseUrl}/rest/v1/voice_sessions`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify([{
          workspace_id: workspaceId,
          contact_id: contactId || null,
          voice_profile_id: voiceProfileId || null,
          status,
          disclosure_text: disclosureText,
          session_type: sessionType,
          outcome,
          analysis_status: analysisStatus,
          analysis_summary: analysisSummary,
          analysis_sentiment: analysisSentiment,
          analysis_metadata: analysisMetadata
        }])
      });
      return readJson(response);
    },
    async createVoiceNote({ workspaceId, contactId, voiceProfileId, voiceSessionId = null, title, body, transcript = '', summary = '', sentiment = '', sentimentScore = null, sourceProvider = '', audioSourceUrl = '', metadata = {}, status = 'draft' }) {
      const response = await fetch(`${baseUrl}/rest/v1/voice_notes`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify([{
          workspace_id: workspaceId,
          contact_id: contactId || null,
          voice_profile_id: voiceProfileId || null,
          voice_session_id: voiceSessionId || null,
          title,
          body,
          transcript,
          summary,
          sentiment,
          sentiment_score: sentimentScore,
          source_provider: sourceProvider,
          audio_source_url: audioSourceUrl || null,
          metadata,
          status
        }])
      });
      return readJson(response);
    },
    async updateConversation({ conversationId, patch }) {
      const response = await fetch(`${baseUrl}/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify(patch)
      });
      return readJson(response);
    },
    async createMessage({ workspaceId, conversationId, direction, senderName = '', body, rawPayload = {} }) {
      const response = await fetch(`${baseUrl}/rest/v1/messages`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify([{
          workspace_id: workspaceId,
          conversation_id: conversationId,
          direction,
          sender_name: senderName,
          body,
          delivery_state: String(direction || '').toLowerCase() === 'outbound' ? 'sent' : 'received',
          delivery_receipts: [],
          raw_payload: rawPayload
        }])
      });
      return readJson(response);
    },
    async createChannel({ workspaceId, provider, channelType, displayName, status = 'configured', providerAccountId = '', externalMetadata = {} }) {
      const response = await fetch(`${baseUrl}/rest/v1/channels`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify([{
          workspace_id: workspaceId,
          provider,
          channel_type: channelType,
          display_name: displayName,
          status,
          provider_account_id: providerAccountId,
          external_metadata: externalMetadata
        }])
      });
      return readJson(response);
    },
    async updateChannel({ channelId, patch }) {
      const response = await fetch(`${baseUrl}/rest/v1/channels?id=eq.${encodeURIComponent(channelId)}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify(patch)
      });
      return readJson(response);
    },
    async createAgent({ workspaceId, name, tone = 'balanced', instructions = '', knowledgeSources = [], status = 'active', channelConfig = {} }) {
      const response = await fetch(`${baseUrl}/rest/v1/agents`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify([{
          workspace_id: workspaceId,
          name,
          tone,
          instructions,
          knowledge_sources: knowledgeSources,
          status,
          channel_config: channelConfig
        }])
      });
      return readJson(response);
    },
    async updateAgent({ agentId, patch }) {
      const response = await fetch(`${baseUrl}/rest/v1/agents?id=eq.${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          ...patch,
          updated_at: new Date().toISOString()
        })
      });
      return readJson(response);
    },
    async createActivityEvent({ workspaceId, entityType, entityId, eventType, payload = {} }) {
      const response = await fetch(`${baseUrl}/rest/v1/activity_events`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify([{
          workspace_id: workspaceId,
          entity_type: entityType,
          entity_id: entityId || null,
          event_type: eventType,
          payload
        }])
      });
      return readJson(response);
    },
    async listBusinessKnowledge(workspaceId) {
      const response = await fetch(`${baseUrl}/rest/v1/business_knowledge?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=*&order=priority.desc,updated_at.desc`, {
        headers: authHeaders()
      });
      return readJson(response);
    },
    async upsertBusinessKnowledge({ workspaceId, id = '', topic = '', question = '', answer = '', tags = [], priority = 50, isActive = true }) {
      const row = {
        workspace_id: workspaceId,
        topic,
        question,
        answer,
        tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
        priority: Number.isFinite(Number(priority)) ? Number(priority) : 50,
        is_active: Boolean(isActive)
      };
      const method = id ? 'PATCH' : 'POST';
      const endpoint = id
        ? `${baseUrl}/rest/v1/business_knowledge?id=eq.${encodeURIComponent(id)}&workspace_id=eq.${encodeURIComponent(workspaceId)}`
        : `${baseUrl}/rest/v1/business_knowledge`;
      const response = await fetch(endpoint, {
        method,
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        },
        body: JSON.stringify(id ? row : [row])
      });
      return readJson(response);
    },
    async deleteBusinessKnowledge({ workspaceId, id }) {
      const response = await fetch(`${baseUrl}/rest/v1/business_knowledge?id=eq.${encodeURIComponent(id)}&workspace_id=eq.${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation'
        }
      });
      return readJson(response);
    },
    async loadWorkspaceSnapshot(workspaceId) {
      const query = (table, suffix = '') =>
        fetch(`${baseUrl}/rest/v1/${table}?workspace_id=eq.${workspaceId}&select=*`, {
          headers: authHeaders()
        }).then(readJson);
      const optionalQuery = (table) =>
        query(table).catch(() => []);

      const [channels, conversations, contacts, contactIdentities, leads, trainingSources, workspaceKnowledge, businessKnowledge, agents, sequences, automations, integrations, voiceProfiles, messages, voiceSessions, voiceNotes, activityEvents, reliabilityEvents, members, messageTemplates] =
        await Promise.all([
          query('channels'),
          query('conversations'),
          query('contacts'),
          optionalQuery('contact_identities'),
          optionalQuery('leads'),
          query('training_sources'),
          optionalQuery('workspace_knowledge'),
          optionalQuery('business_knowledge'),
          query('agents'),
          query('follow_up_sequences'),
          optionalQuery('automation_rules'),
          optionalQuery('integrations'),
          query('voice_profiles'),
          query('messages'),
          query('voice_sessions'),
          query('voice_notes'),
          query('activity_events'),
          query('reliability_events'),
          query('workspace_members'),
          optionalQuery('message_templates')
        ]);

      return {
        channels,
        conversations,
        contacts,
        contactIdentities,
        leads,
        trainingSources,
        workspaceKnowledge,
        businessKnowledge,
        agents,
        sequences,
        automations,
        integrations,
        voiceProfiles,
        messages,
        voiceSessions,
        voiceNotes,
        activityEvents,
        reliabilityEvents,
        members,
        messageTemplates
      };
    }
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}
