import { createBackendService } from '../services/backend-service.js';
import { buildProviderSeedDescriptor, getProviderConnector, normalizeProviderKey } from '../integrations/provider-connectors.js';
import { buildAiWorkspaceContext } from '../integrations/ai-context.js';
import { buildAiRecommendationCard, renderAiRecommendationCard } from '../integrations/ai-recommendation.js';
import { createTwilioSoftphoneClient } from '../integrations/twilio-softphone.js';
import {
  escapeHtml,
  renderAiAnalyticsBrief,
  renderAiDeployBrief,
  renderAiFollowUpBrief,
  renderAiLeadBrief,
  renderAiOutreachGuide,
  renderReliabilityPanel,
  renderSyncJobsList,
  renderWorkflowQueueList,
  renderWorkspaceSearchResults
} from '../ui/preview-renderers.js';
import { canPerformWorkspaceAction, describeWorkspaceRole } from '../state/permissions.js';

  export function createPreviewActions({
  auth,
  providerReadiness,
  workspaceTitle,
  nodes = {},
  helpers = {},
  status = {},
  refreshWorkspaceData,
  saveAppState
}) {
  const {
    aiReplyOutput,
    replyTemplateModeInput,
    replyTemplateStatus,
    aiSummary,
    aiClassification,
    aiNextAction,
    aiRecommendation,
    replyStatus,
    softphoneStatus,
    softphoneStatusBadge,
    softphoneIdentity,
    softphoneSession,
    softphoneCallState,
    softphoneMoodBadge,
    softphoneTranscriptStatus,
    softphoneFollowupStatus,
    softphoneTranscriptWindow,
    softphoneTranscriptEmpty,
    softphoneTranscriptList,
    softphoneManualSummary,
    softphoneNote,
    nangoState,
    voiceProfileNameInput,
    voiceProfileLabelInput,
    voiceProfileSourceInput,
    voiceProfileStyleInput,
    voiceSessionContactSelect,
    voiceSessionProfileSelect,
    voiceSessionStatusInput,
    voiceSessionDisclosureInput,
    voiceNoteContactSelect,
    voiceNoteProfileSelect,
    voiceNoteSessionSelect,
    voiceNoteTitleInput,
    voiceNoteAudioUrlInput,
    voiceNoteBodyInput,
    businessKnowledgeList,
    businessKnowledgeStatus,
    businessKnowledgeIdInput,
    businessKnowledgeTopicInput,
    businessKnowledgeQuestionInput,
    businessKnowledgeAnswerInput,
    businessKnowledgeTagsInput,
    businessKnowledgePriorityInput,
    assignmentInput,
    contactMergeTargetSelect,
    mergeStatus,
    contactDetail,
    contactTagsList,
    contactTagInput,
    contactTagsStatus,
    contactHealthBackfillStatus,
    providerGrid,
    reliabilityPanel,
    reliabilityStatus,
    searchResults,
    searchStatus,
    searchInput,
    searchSection,
    syncJobsList,
    syncJobsStatus,
    workflowQueueList,
    workflowQueueStatus,
    workflowAssigneeInput,
    workflowNoteInput,
    aiFollowupBrief,
    aiFollowupStatus,
    aiOutreachGuide,
    aiOutreachStatus,
    aiLeadBrief,
    aiLeadStatus,
    aiAnalyticsBrief,
    aiAnalyticsStatus,
    aiDeployBrief,
    aiDeployStatus,
    sequenceIdInput,
    sequenceNameInput,
    sequenceStatusInput,
    sequenceTriggerInput,
    sequenceChannelInput,
    sequenceTemplateModeInput,
    sequenceGoalInput,
    sequenceOwnerInput,
    sequenceStepsInput,
    sequenceStepList,
    sequenceRepliesInput,
    sequenceDeliveriesInput,
    sequenceNextRunInput,
    sequenceNotesInput,
    sequenceEditorTitle,
    sequenceStatusNote,
    sequenceTemplateStatus,
    internalNoteInput,
    sendReplyButton,
    agentNameInput,
    agentToneInput,
    agentSourcesInput,
    agentStatusInput,
    agentInstructionsInput,
    agentStatusNote
  } = nodes;

  const {
    buildDemoIngestPayload,
    setStatus,
    setAiStatus,
    setReplyStatus,
    setAgentStatus,
    setIngestStatus,
    saveBusinessKnowledgeEntry,
    deleteBusinessKnowledgeEntry,
    toast
  } = helpers;

  function setSoftphoneUi({
    status = 'Idle',
    badge = 'Idle',
    identity = 'Not ready',
    session = 'None',
    callState = 'Idle',
    note = 'Call state will move from dialing to connected locally while AuraFlow keeps the voice session linked to Supabase.'
  } = {}) {
    if (softphoneStatus) softphoneStatus.textContent = status;
    if (softphoneStatusBadge) softphoneStatusBadge.textContent = badge;
    if (softphoneIdentity) softphoneIdentity.textContent = identity;
    if (softphoneSession) softphoneSession.textContent = session;
    if (softphoneCallState) softphoneCallState.textContent = callState;
    if (softphoneNote) softphoneNote.textContent = note;
  }

  function sentimentBadgeTone(mood = '') {
    const normalized = String(mood || '').trim().toLowerCase();
    if (normalized === 'positive') return 'success';
    if (normalized === 'negative') return 'danger';
    if (normalized === 'mixed') return 'warning';
    return 'neutral';
  }

  function renderSoftphoneTranscript(segments = []) {
    const rows = Array.isArray(segments) ? segments.filter((item) => String(item?.text || '').trim()) : [];
    if (softphoneTranscriptEmpty) {
      softphoneTranscriptEmpty.hidden = rows.length > 0;
    }
    if (!softphoneTranscriptList) return;
    softphoneTranscriptList.innerHTML = rows.length
      ? rows.slice(-12).map((item) => {
        const speaker = String(item?.speaker || 'Lead').trim() || 'Lead';
        const state = item?.final === false ? 'Live' : 'Final';
        const speakerClass = speaker.toLowerCase() === 'operator' ? 'operator' : 'lead';
        return `
          <div class="softphone-transcript-line ${speakerClass}">
            <span class="softphone-transcript-speaker">${escapeHtml(speaker)}</span>
            <div>
              <strong>${escapeHtml(String(item?.text || '').trim())}</strong>
              <span>${escapeHtml(state)}</span>
            </div>
          </div>
        `;
      }).join('')
      : '';
    if (softphoneTranscriptWindow) {
      softphoneTranscriptWindow.scrollTop = softphoneTranscriptWindow.scrollHeight;
    }
  }

  function getLiveTranscriptSegments() {
    const liveSegments = Array.isArray(auth.softphone?.transcriptSegments) ? auth.softphone.transcriptSegments : [];
    if (liveSegments.length) return liveSegments;
    const voiceSessions = Array.isArray(auth.snapshot?.voiceSessions) ? auth.snapshot.voiceSessions : [];
    const active = voiceSessions.find((item) => item.id === auth.softphone?.sessionId);
    return Array.isArray(active?.analysis_metadata?.live_transcript) ? active.analysis_metadata.live_transcript : [];
  }

  function syncSoftphoneTranscriptUi({ mood = '', transcriptStatus = '', followupStatus = '' } = {}) {
    const activeSegments = getLiveTranscriptSegments();
    renderSoftphoneTranscript(activeSegments);
    const resolvedMood = String(
      mood
      || auth.softphone?.liveMood
      || auth.snapshot?.voiceSessions?.find?.((item) => item.id === auth.softphone?.sessionId)?.analysis_metadata?.live_mood
      || 'neutral'
    ).trim().toLowerCase() || 'neutral';
    if (softphoneMoodBadge) {
      softphoneMoodBadge.textContent = resolvedMood.charAt(0).toUpperCase() + resolvedMood.slice(1);
      softphoneMoodBadge.className = `badge ${sentimentBadgeTone(resolvedMood)}`;
    }
    if (softphoneTranscriptStatus) {
      softphoneTranscriptStatus.textContent = transcriptStatus || (activeSegments.length ? `${activeSegments.length} live update${activeSegments.length === 1 ? '' : 's'}` : 'Waiting for live speech');
    }
    if (softphoneFollowupStatus) {
      softphoneFollowupStatus.textContent = followupStatus || (auth.softphone?.suggestedFollowup ? 'Suggested follow-up ready' : 'Will draft after the call');
    }
    if (softphoneManualSummary && !softphoneManualSummary.value && auth.softphone?.manualSummary) {
      softphoneManualSummary.value = auth.softphone.manualSummary;
    }
  }

  function applySuggestedFollowupToComposer(text = '') {
    const normalized = String(text || '').trim();
    if (!normalized || !aiReplyOutput) return;
    aiReplyOutput.value = normalized;
    if (replyStatus) {
      replyStatus.textContent = 'Suggested WhatsApp follow-up inserted from the latest voice session.';
    }
  }

  const softphoneClient = createTwilioSoftphoneClient({
    onStateChange: async (state, detail = {}) => {
      const identity = detail.identity || auth.softphone?.identity || 'softphone';
      const sessionId = auth.softphone?.sessionId || 'Pending';
      const base = {
        identity,
        session: sessionId,
        badge: state === 'registered'
          ? 'Ready'
          : state === 'dialing'
            ? 'Dialing'
            : state === 'connected'
              ? 'Connected'
              : state === 'completed'
                ? 'Ended'
                : state === 'error'
                  ? 'Error'
                  : state === 'registering'
                    ? 'Auth'
                    : 'Active',
        callState: state === 'registered'
          ? 'Ready'
          : state === 'connected'
            ? 'Connected'
            : state === 'completed'
              ? 'Completed'
              : state === 'error'
                ? 'Error'
                : state === 'dialing'
                  ? 'Dialing'
                  : state === 'registering'
                    ? 'Preparing'
                    : state
      };
      setSoftphoneUi({
        status: detail.message || `Softphone state: ${state}`,
        note: detail.message || 'Softphone state updated.',
        ...base
      });
      syncSoftphoneTranscriptUi();

      const sessionIdValue = String(auth.softphone?.sessionId || '').trim();
      if (sessionIdValue && ['connected', 'completed', 'error'].includes(state)) {
        const patch = state === 'connected'
          ? {
            status: 'in_progress',
            updated_at: new Date().toISOString(),
            analysis_metadata: {
              ...(auth.softphone?.sessionMetadata || {}),
              call_state: 'connected',
              connected_at: new Date().toISOString(),
              relay_url: auth.softphone?.relayUrl || null
            }
          }
          : state === 'completed'
            ? {
              status: 'completed',
              outcome: 'agent_ended',
              updated_at: new Date().toISOString(),
              analysis_metadata: {
                ...(auth.softphone?.sessionMetadata || {}),
                call_state: 'completed',
                ended_at: new Date().toISOString(),
                relay_url: auth.softphone?.relayUrl || null
              }
            }
            : {
              status: 'failed',
              outcome: 'softphone_error',
              updated_at: new Date().toISOString(),
              analysis_metadata: {
                ...(auth.softphone?.sessionMetadata || {}),
                call_state: 'error',
                error_message: detail.message || 'Softphone error',
                relay_url: auth.softphone?.relayUrl || null
              }
            };
        await backendService.updateVoiceSession(sessionIdValue, patch).catch(() => null);
        await refreshWorkspaceData().catch(() => null);
        syncSoftphoneTranscriptUi();
        if (state === 'connected') {
          startSoftphoneSnapshotPolling();
        } else if (state === 'completed') {
          stopSoftphoneSnapshotPolling();
          await finalizeSoftphoneCallArtifacts().catch((error) => {
            console.warn('Softphone post-call automation failed.', error);
          });
        } else if (state === 'error') {
          stopSoftphoneSnapshotPolling();
        }
      }
    }
  });
  const backendService = createBackendService();

  let softphoneSnapshotTimer = null;
  let softphoneFinalizing = false;

  function stopSoftphoneSnapshotPolling() {
    if (softphoneSnapshotTimer) {
      clearInterval(softphoneSnapshotTimer);
      softphoneSnapshotTimer = null;
    }
  }

  function syncSoftphoneSessionFromSnapshot() {
    const sessionId = String(auth.softphone?.sessionId || '').trim();
    if (!sessionId) {
      syncSoftphoneTranscriptUi();
      return null;
    }
    const voiceSessions = Array.isArray(auth.snapshot?.voiceSessions) ? auth.snapshot.voiceSessions : [];
    const activeSession = voiceSessions.find((item) => item.id === sessionId) || null;
    if (!activeSession) {
      syncSoftphoneTranscriptUi();
      return null;
    }
    auth.softphone = {
      ...(auth.softphone || {}),
      sessionMetadata: activeSession.analysis_metadata || auth.softphone?.sessionMetadata || {},
      transcriptSegments: Array.isArray(activeSession.analysis_metadata?.live_transcript)
        ? activeSession.analysis_metadata.live_transcript
        : (auth.softphone?.transcriptSegments || []),
      liveMood: String(activeSession.analysis_metadata?.live_mood || auth.softphone?.liveMood || 'neutral').trim().toLowerCase() || 'neutral',
      manualSummary: String(activeSession.analysis_metadata?.manual_summary || auth.softphone?.manualSummary || '').trim(),
      suggestedFollowup: String(activeSession.analysis_metadata?.suggested_follow_up || auth.softphone?.suggestedFollowup || '').trim()
    };
    if (activeSession.analysis_status === 'ready' && auth.softphone.suggestedFollowup) {
      applySuggestedFollowupToComposer(auth.softphone.suggestedFollowup);
    }
    syncSoftphoneTranscriptUi({
      mood: auth.softphone.liveMood,
      transcriptStatus: auth.softphone.transcriptSegments?.length
        ? `${auth.softphone.transcriptSegments.length} live update${auth.softphone.transcriptSegments.length === 1 ? '' : 's'}`
        : (auth.softphone.manualSummary ? 'Transcript unavailable - manual summary saved' : ''),
      followupStatus: activeSession.analysis_metadata?.suggested_follow_up
        ? 'Suggested follow-up ready'
        : (auth.softphone.manualSummary ? 'Manual summary saved' : undefined)
    });
    return activeSession;
  }

  function startSoftphoneSnapshotPolling() {
    stopSoftphoneSnapshotPolling();
    softphoneSnapshotTimer = setInterval(async () => {
      if (!auth.workspaceId || !auth.softphone?.sessionId) {
        stopSoftphoneSnapshotPolling();
        return;
      }
      try {
        await refreshWorkspaceData();
        syncSoftphoneSessionFromSnapshot();
      } catch (error) {
        console.warn('Softphone snapshot refresh failed.', error);
      }
    }, 3000);
  }

  function mergeSoftphoneTranscriptSegment(segment = {}) {
    const nextText = String(segment?.text || '').trim();
    if (!nextText) return;
    const nextSpeaker = String(segment?.speaker || 'Lead').trim() || 'Lead';
    const isFinal = segment?.final !== false;
    const startedAt = String(segment?.startedAt || segment?.ts || '').trim() || new Date().toISOString();
    const previous = Array.isArray(auth.softphone?.transcriptSegments) ? auth.softphone.transcriptSegments.slice() : [];
    const last = previous.at(-1);
    if (last && last.final === false && last.speaker === nextSpeaker) {
      last.text = nextText;
      last.final = isFinal;
      last.startedAt = startedAt;
    } else {
      previous.push({
        speaker: nextSpeaker,
        text: nextText,
        final: isFinal,
        startedAt
      });
    }
    auth.softphone = {
      ...(auth.softphone || {}),
      transcriptSegments: previous.slice(-24)
    };
    syncSoftphoneTranscriptUi({
      transcriptStatus: `${auth.softphone.transcriptSegments.length} live update${auth.softphone.transcriptSegments.length === 1 ? '' : 's'}`
    });
  }

  async function finalizeSoftphoneCallArtifacts({ manualSummary = '' } = {}) {
    if (softphoneFinalizing) return null;
    const sessionId = String(auth.softphone?.sessionId || '').trim();
    const conversationId = String(auth.softphone?.conversationId || auth.softphone?.sessionMetadata?.conversation_id || '').trim();
    if (!sessionId || !conversationId || !auth.workspaceId) return null;
    const transcriptSegments = getLiveTranscriptSegments().filter((item) => item?.final !== false);
    const transcript = transcriptSegments.map((item) => `${item.speaker || 'Lead'}: ${String(item.text || '').trim()}`).filter(Boolean).join('\n');
    const manualSummaryText = String(manualSummary || auth.softphone?.manualSummary || softphoneManualSummary?.value || '').trim();
    const hasTranscript = Boolean(transcript.trim());
    const fallbackSummary = manualSummaryText || 'Transcript unavailable. Operator summary still pending.';

    softphoneFinalizing = true;
    try {
      const voiceSessions = Array.isArray(auth.snapshot?.voiceSessions) ? auth.snapshot.voiceSessions : [];
      const activeSession = voiceSessions.find((item) => item.id === sessionId) || null;
      const selectedConversation = Array.isArray(auth.snapshot?.conversations)
        ? auth.snapshot.conversations.find((item) => item.id === conversationId)
        : null;
      const selectedMessages = getConversationMessages(conversationId).slice().reverse();
        const voiceCallMessage = {
          direction: 'inbound',
          sender_name: auth.softphone?.contactName || selectedConversation?.name || 'Lead',
          body: hasTranscript
            ? `Voice call transcript:\n${transcript}`
            : `Transcript unavailable.\nOperator summary:\n${fallbackSummary}`,
          channel: 'voice',
          created_at: new Date().toISOString()
        };
        const aiPayload = {
        workspaceName: workspaceTitle?.textContent || 'AuraFlow Workspace',
        conversation: {
          ...(selectedConversation || {}),
          source_provider: 'voice',
          channel: 'voice'
        },
        messages: [...selectedMessages, voiceCallMessage],
        workspaceSnapshot: auth.snapshot,
          voiceCall: {
            sessionId,
            transcript: hasTranscript ? transcript : '',
            transcriptUnavailable: !hasTranscript,
            manualSummary: manualSummaryText,
            sentiment: String(activeSession?.analysis_metadata?.live_mood || activeSession?.analysis_sentiment || auth.softphone?.liveMood || 'neutral'),
            summary: String(activeSession?.analysis_summary || fallbackSummary).trim()
          }
        };

        const aiResult = await backendService.requestAiBriefing(aiPayload).catch(() => null);
        const recap = String(
          aiResult?.summary
          || activeSession?.analysis_summary
          || fallbackSummary
        ).trim();
      const suggestedFollowUp = String(aiResult?.reply || activeSession?.analysis_metadata?.suggested_follow_up || '').trim();

      applySuggestedFollowupToComposer(suggestedFollowUp);

      auth.softphone = {
        ...(auth.softphone || {}),
        suggestedFollowup: suggestedFollowUp,
        manualSummary: manualSummaryText,
        finalized: true
      };

      syncSoftphoneTranscriptUi({
        followupStatus: suggestedFollowUp ? 'Suggested follow-up ready' : 'Call recap ready'
      });

      await backendService.updateVoiceSession(sessionId, {
        analysis_status: 'ready',
        analysis_summary: recap,
        analysis_sentiment: String(activeSession?.analysis_metadata?.live_mood || activeSession?.analysis_sentiment || auth.softphone?.liveMood || 'neutral'),
        analysis_metadata: {
          ...(activeSession?.analysis_metadata || auth.softphone?.sessionMetadata || {}),
          live_transcript: transcriptSegments,
          live_mood: String(activeSession?.analysis_metadata?.live_mood || auth.softphone?.liveMood || 'neutral'),
          transcript_unavailable: !hasTranscript,
          manual_summary: manualSummaryText || null,
          call_recap: recap,
          suggested_follow_up: suggestedFollowUp || null,
          final_transcript: hasTranscript ? transcript : null
        }
      }).catch(() => null);

      await backendService.createActivityEvent(auth.workspaceId, {
        entity_type: 'conversation',
        entity_id: conversationId,
        event_type: 'voice_call_recap_created',
          payload: {
            note: recap,
            suggested_follow_up: suggestedFollowUp || null,
            transcript_unavailable: !hasTranscript,
            manual_summary: manualSummaryText || null,
            voice_session_id: sessionId
          }
        }).catch(() => null);

      if (aiResult) {
        auth.aiBriefing = {
          summary: String(aiResult.summary || recap).trim(),
          classification: String(aiResult.classification || 'Voice follow-up').trim(),
          nextAction: String(aiResult.nextAction || 'Send the suggested WhatsApp follow-up.').trim(),
          reply: suggestedFollowUp,
          confidence: Number(aiResult.confidence || 0) || 0,
          model: String(aiResult.model || '').trim(),
          suggestedAssignee: String(aiResult.suggestedAssignee || '').trim(),
          followUpTiming: String(aiResult.followUpTiming || '').trim(),
          handoffReason: String(aiResult.handoffReason || '').trim()
        };
        persistAiBriefingState();
      }

      await refreshWorkspaceData().catch(() => null);
      return { recap, suggestedFollowUp };
    } finally {
      softphoneFinalizing = false;
    }
  }

  async function saveSoftphoneSummary() {
    const sessionId = String(auth.softphone?.sessionId || '').trim();
    const summary = String(softphoneManualSummary?.value || '').trim();
    if (!sessionId) {
      throw new Error('Start or select a completed call session first.');
    }
    if (!summary) {
      throw new Error('Add a manual summary before saving.');
    }
    auth.softphone = {
      ...(auth.softphone || {}),
      manualSummary: summary
    };
    await backendService.updateVoiceSession(sessionId, {
      analysis_status: 'in_progress',
      analysis_metadata: {
        ...(auth.softphone?.sessionMetadata || {}),
        transcript_unavailable: true,
        manual_summary: summary,
        call_state: String(auth.softphone?.callState || 'completed').toLowerCase() || 'completed'
      }
    }).catch(() => null);
    await finalizeSoftphoneCallArtifacts({ manualSummary: summary });
    toast('Manual call summary saved.');
  }

  function ingestSoftphoneRelayEvent(payload = {}) {
    const detail = payload?.detail || {};
    if (detail.mood) {
      auth.softphone = {
        ...(auth.softphone || {}),
        liveMood: String(detail.mood || 'neutral').trim().toLowerCase() || 'neutral'
      };
    }
    if (detail.transcript) {
      mergeSoftphoneTranscriptSegment({
        speaker: detail.speaker,
        text: detail.transcript,
        final: detail.isFinal !== false,
        startedAt: detail.startedAt || detail.ts
      });
    } else {
      syncSoftphoneTranscriptUi({
        mood: detail.mood
      });
    }
  }

  function buildAiPayload(mode = 'reply', context = null) {
    const latestContext = context || getLatestConversationContext();
    if (!latestContext) {
      throw new Error('No conversations available for AI assistance yet.');
    }

    const payload = {
      workspaceName: workspaceTitle?.textContent || 'AuraFlow Workspace',
      conversation: latestContext.conversation,
      messages: latestContext.messages,
      mode,
      workspaceSnapshot: auth.snapshot
    };
    payload.workspaceContext = buildAiWorkspaceContext({
      workspaceName: workspaceTitle?.textContent || 'AuraFlow Workspace',
      snapshot: auth.snapshot,
      conversation: latestContext.conversation,
      messages: latestContext.messages,
      mode
    });
    return { context: latestContext, payload };
  }

  function buildAiModelLabel(data = {}) {
    return String(data?.model || data?.providerModel || data?.provider_model || 'AI').trim() || 'AI';
  }

  function buildAiConfidence(data = {}) {
    const confidence = Number(data?.confidence ?? data?.intent_confidence ?? data?.intentConfidence ?? 0);
    return Number.isFinite(confidence) ? confidence : 0;
  }

  function syncAiRecommendation(recommendation) {
    auth.aiRecommendation = recommendation;
    if (aiRecommendation) {
      aiRecommendation.innerHTML = renderAiRecommendationCard(recommendation);
    }
  }

  function buildLeadScoreFromBriefing(briefing = {}) {
    const confidence = Number(briefing?.confidence || 0);
    const classification = String(briefing?.classification || '').toLowerCase();
    if (classification.includes('qualified') || classification.includes('high intent') || confidence >= 0.8) {
      return {
        label: 'Hot lead',
        reason: 'High intent signal and clear next action detected.'
      };
    }
    if (classification.includes('follow') || classification.includes('nurture') || confidence >= 0.55) {
      return {
        label: 'Warm lead',
        reason: 'Worth nurturing with a sequence instead of leaving the thread idle.'
      };
    }
    return {
      label: confidence > 0 ? 'Needs review' : 'Unscored',
      reason: 'The thread needs more context before AuraFlow can route it confidently.'
    };
  }

  function persistAiBriefingState() {
    if (typeof saveAppState === 'function') {
      saveAppState({ aiBriefing: auth.aiBriefing || null });
    }
  }

  function extractFailureReason(message = {}) {
    const raw = message?.raw_payload || message?.rawPayload || {};
    const providerResult = raw.provider_result || raw.providerResult || {};
    const receipts = Array.isArray(message?.delivery_receipts)
      ? message.delivery_receipts
      : Array.isArray(raw.delivery_receipts)
        ? raw.delivery_receipts
        : [];
    return [
      providerResult.error,
      providerResult.errorMessage,
      providerResult.message,
      raw.error,
      raw.error_message,
      ...receipts.map((receipt) => receipt?.error)
    ].map((value) => String(value || '').trim()).find(Boolean) || '';
  }

  function classifyFailureReason(reason = '') {
    const normalized = String(reason || '').trim().toLowerCase();
    if (!normalized) return { label: '', guidance: '' };
    if (
      normalized.includes('auth')
      || normalized.includes('unauthorized')
      || normalized.includes('forbidden')
      || normalized.includes('token')
      || normalized.includes('permission')
      || normalized.includes('access denied')
    ) {
      return { label: 'Auth or access', guidance: 'Reconnect the channel or refresh provider access before retrying.' };
    }
    if (
      normalized.includes('template')
      || normalized.includes('policy')
      || normalized.includes('content sid')
      || normalized.includes('not approved')
      || normalized.includes('outside the allowed window')
    ) {
      return { label: 'Template or policy', guidance: 'Review the WhatsApp template, policy window, or approval state before retrying.' };
    }
    if (
      normalized.includes('invalid number')
      || normalized.includes('not a valid')
      || normalized.includes('recipient')
      || normalized.includes('phone')
      || normalized.includes('user unavailable')
      || normalized.includes('device')
    ) {
      return { label: 'Recipient issue', guidance: 'Verify the contact phone number or ask the customer to re-engage on WhatsApp.' };
    }
    if (
      normalized.includes('rate')
      || normalized.includes('throttle')
      || normalized.includes('timeout')
      || normalized.includes('temporar')
      || normalized.includes('network')
      || normalized.includes('queue')
    ) {
      return { label: 'Transient delivery', guidance: 'Safe to retry after a short delay unless the provider keeps throttling.' };
    }
    return { label: 'Needs review', guidance: 'Check the provider response before retrying in bulk.' };
  }

  function getConversationMessages(conversationId = '') {
    return Array.isArray(auth.snapshot?.messages)
      ? auth.snapshot.messages
        .filter((item) => item.conversation_id === conversationId)
        .slice()
        .sort((left, right) => new Date(right.created_at || right.updated_at || 0).getTime() - new Date(left.created_at || left.updated_at || 0).getTime())
      : [];
  }

  function getLatestInboundMessage(messages = []) {
    return (Array.isArray(messages) ? messages : []).find((item) => String(item.direction || '').toLowerCase() === 'inbound') || null;
  }

  function getWhatsAppTemplateModeState(conversation = null, messages = [], briefing = {}) {
    const provider = String(conversation?.source_provider || conversation?.source || conversation?.channel || '').toLowerCase();
    if (provider !== 'whatsapp') {
      return {
        policyLimited: false,
        recommendedTemplate: '',
        status: 'Free-form is available on this channel.',
        sequenceStatus: 'Template mode only matters for WhatsApp sequence steps.'
      };
    }
    const latestInbound = getLatestInboundMessage(messages);
    const latestInboundAt = latestInbound?.created_at || latestInbound?.updated_at || '';
    const ageHours = latestInboundAt ? (Date.now() - new Date(latestInboundAt).getTime()) / 3600000 : Number.POSITIVE_INFINITY;
    const policyLimited = !latestInboundAt || ageHours > 24;
    const sequence = briefing?.sequenceSuggestion || {};
    const recommendedTemplate = policyLimited
      ? (String(sequence.goal || briefing?.nextAction || '').toLowerCase().includes('appoint') ? 'appointment_reminder' : 'lead_intro')
      : '';
    return {
      policyLimited,
      recommendedTemplate,
      status: policyLimited
        ? `The last inbound WhatsApp activity is older than about 24 hours, so a template-backed send is safer now.${recommendedTemplate === 'appointment_reminder' ? ' Appointment reminder is the strongest fit.' : ' Lead intro is the safest default template path.'}`
        : `The latest inbound WhatsApp message is still fresh enough for a free-form reply.${latestInboundAt ? ` Last inbound received ${new Date(latestInboundAt).toLocaleString()}.` : ''}`,
      sequenceStatus: policyLimited
        ? 'Sequence steps that continue on WhatsApp should stay template-backed until the customer re-engages.'
        : 'Sequence steps can stay free-form on WhatsApp while the thread remains active.'
    };
  }

  function getContactPhoneHealth(contact = {}) {
    const metadata = contact?.metadata || {};
    const lookup = metadata.phone_lookup || {};
    const health = metadata.phone_health || {};
    return {
      lineType: String(health.line_type || lookup.line_type || '').trim().toLowerCase(),
      carrierName: String(health.carrier_name || lookup.carrier_name || '').trim(),
      valid: health.valid === true || lookup.valid === true
    };
  }

  function syncTemplateControls(conversation = null, messages = []) {
    const templateState = getWhatsAppTemplateModeState(conversation, messages, auth.aiBriefing || {});
    if (replyTemplateStatus) {
      replyTemplateStatus.textContent = templateState.status;
    }
    if (replyTemplateModeInput) {
      const currentValue = String(replyTemplateModeInput.value || '').trim().toLowerCase();
      if (!currentValue || currentValue === 'auto') {
        replyTemplateModeInput.value = templateState.policyLimited
          ? (templateState.recommendedTemplate || 'auto')
          : 'freeform';
      }
    }
    if (sequenceTemplateStatus) {
      sequenceTemplateStatus.textContent = templateState.sequenceStatus;
    }
    if (sequenceTemplateModeInput) {
      const channelMix = String(sequenceChannelInput?.value || '').toLowerCase();
      const currentValue = String(sequenceTemplateModeInput.value || '').trim().toLowerCase();
      if ((!currentValue || currentValue === 'auto') && channelMix.includes('whatsapp')) {
        sequenceTemplateModeInput.value = templateState.policyLimited
          ? (templateState.recommendedTemplate || 'auto')
          : 'freeform';
      }
    }
    return templateState;
  }

  function buildRetryDiagnostics(messages = []) {
    const thread = Array.isArray(messages)
      ? messages
        .filter((item) => String(item.direction || '').toLowerCase() === 'outbound')
        .slice()
        .sort((left, right) => new Date(right.created_at || right.updated_at || 0).getTime() - new Date(left.created_at || left.updated_at || 0).getTime())
      : [];
    const latestFailure = thread.find((item) => ['failed', 'error', 'undelivered', 'retrying'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())) || null;
    if (!latestFailure) {
      return { hasFailure: false, retryCount: 0, lastRetryAt: '', nextRetryMode: '', failureReason: '' };
    }
    const failureTime = new Date(latestFailure.created_at || latestFailure.updated_at || 0).getTime();
    const retryAttempts = thread.filter((item) => new Date(item.created_at || item.updated_at || 0).getTime() > failureTime);
    const state = String(latestFailure.delivery_state || latestFailure.raw_payload?.delivery_state || '').toLowerCase();
    return {
      hasFailure: true,
      retryCount: retryAttempts.length,
      lastRetryAt: retryAttempts[0]?.created_at || retryAttempts[0]?.updated_at || '',
      nextRetryMode: state === 'retrying' ? 'Automatic retry queued' : 'Manual retry needed',
      failureReason: extractFailureReason(latestFailure)
    };
  }

  function primeCrossScreenAiState(recommendation = {}, briefing = {}) {
    if (assignmentInput && recommendation.recommendedAssignee) {
      assignmentInput.value = recommendation.recommendedAssignee;
    }
    if (workflowAssigneeInput && recommendation.recommendedAssignee) {
      workflowAssigneeInput.value = recommendation.recommendedAssignee;
    }
    if (workflowNoteInput) {
      const workflowNote = recommendation.handoffReason || recommendation.summary || '';
      if (workflowNote) {
        workflowNoteInput.value = workflowNote;
      }
    }

    const sequenceSuggestion = briefing.sequenceSuggestion || {};
    if (sequenceNameInput && !String(sequenceNameInput.value || '').trim() && sequenceSuggestion.name) {
      sequenceNameInput.value = sequenceSuggestion.name;
    }
    if (sequenceTriggerInput && !String(sequenceTriggerInput.value || '').trim() && sequenceSuggestion.trigger) {
      sequenceTriggerInput.value = sequenceSuggestion.trigger;
    }
    if (sequenceChannelInput && !String(sequenceChannelInput.value || '').trim() && sequenceSuggestion.channel) {
      sequenceChannelInput.value = sequenceSuggestion.channel;
    }
    if (sequenceGoalInput && !String(sequenceGoalInput.value || '').trim() && sequenceSuggestion.goal) {
      sequenceGoalInput.value = sequenceSuggestion.goal;
    }
    if (sequenceOwnerInput && !String(sequenceOwnerInput.value || '').trim() && recommendation.recommendedAssignee) {
      sequenceOwnerInput.value = recommendation.recommendedAssignee;
    }
    if (sequenceNotesInput) {
      const noteParts = [
        sequenceSuggestion.notes || '',
        recommendation.handoffReason || '',
        briefing.classification ? `Classification: ${briefing.classification}` : ''
      ].filter(Boolean);
      if (noteParts.length) {
        sequenceNotesInput.value = noteParts.join('\n');
      }
    }
  }

    function syncAiWorkspaceSurfaces() {
      const briefing = auth.aiBriefing || {};
      const conversations = Array.isArray(auth.snapshot?.conversations) ? auth.snapshot.conversations : [];
    const contacts = Array.isArray(auth.snapshot?.contacts) ? auth.snapshot.contacts : [];
    const messages = Array.isArray(auth.snapshot?.messages) ? auth.snapshot.messages : [];
    const voiceSessions = Array.isArray(auth.snapshot?.voiceSessions) ? auth.snapshot.voiceSessions : [];
    const voiceProfiles = Array.isArray(auth.snapshot?.voiceProfiles) ? auth.snapshot.voiceProfiles : [];
    const workflowJobs = Array.isArray(auth.workflowQueue) && auth.workflowQueue.length
      ? auth.workflowQueue
      : Array.isArray(auth.snapshot?.syncJobs)
        ? auth.snapshot.syncJobs
        : Array.isArray(auth.snapshot?.jobs)
          ? auth.snapshot.jobs
          : [];
    const readiness = Array.isArray(providerReadiness) ? providerReadiness : [];
    const unifiedProfiles = contacts.filter((item) => {
      const identities = Array.isArray(item?.metadata?.identities) ? item.metadata.identities : [];
      const providerCount = new Set(identities.map((identity) => String(identity.provider || '').toLowerCase()).filter(Boolean)).size;
      return providerCount >= 2;
    }).length;
    const analyzedVoiceFollowUps = voiceSessions.filter((item) => Boolean(item?.analysis_metadata?.follow_up_plan)).length;
      const pendingVoiceAnalysis = voiceSessions.filter((item) => ['queued', 'scheduled', 'in_progress'].includes(String(item?.status || '').toLowerCase())).length;
      const selectedConversation = conversations.find((item) => item.id === auth.selectedConversationId) || null;
      const selectedMessages = selectedConversation ? getConversationMessages(selectedConversation.id) : [];
      syncTemplateControls(selectedConversation, selectedMessages);
      const deliveryTrackedMessages = messages.filter((item) => {
      if (String(item.direction || '').toLowerCase() !== 'outbound') return false;
      const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
      return ['sent', 'queued', 'delivered', 'read', 'failed', 'undelivered'].includes(state);
    });
    const whatsappTrackedMessages = messages.filter((item) => {
      if (String(item.direction || '').toLowerCase() !== 'outbound') return false;
      const provider = String(item.source_provider || item.channel || item.raw_payload?.provider || '').toLowerCase();
      const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
      return provider === 'whatsapp' && ['sent', 'queued', 'delivered', 'read', 'failed', 'undelivered'].includes(state);
    });
    const successfulDeliveries = deliveryTrackedMessages.filter((item) => {
      const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
      return ['delivered', 'read'].includes(state);
    }).length;
    const whatsappDeliveredCount = whatsappTrackedMessages.filter((item) => ['delivered', 'read'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())).length;
    const whatsappReadCount = whatsappTrackedMessages.filter((item) => String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase() === 'read').length;
    const whatsappFailedCount = whatsappTrackedMessages.filter((item) => ['failed', 'undelivered'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())).length;
    const latestWhatsAppFailure = whatsappTrackedMessages.find((item) => ['failed', 'undelivered'].includes(String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase())) || null;
    const whatsappFailureReason = extractFailureReason(latestWhatsAppFailure);
    const whatsappFailureCategory = classifyFailureReason(whatsappFailureReason);
    const whatsappRetryDiagnostics = buildRetryDiagnostics(whatsappTrackedMessages);
    const deliverySuccessRate = deliveryTrackedMessages.length
      ? (successfulDeliveries / deliveryTrackedMessages.length) * 100
      : 0;
    const whatsappDeliveryRate = whatsappTrackedMessages.length
      ? (whatsappDeliveredCount / whatsappTrackedMessages.length) * 100
      : 0;

    if (aiFollowupBrief) {
      aiFollowupBrief.innerHTML = renderAiFollowUpBrief(briefing);
    }
    if (aiFollowupStatus) {
      aiFollowupStatus.textContent = briefing?.sequenceSuggestion?.name
        ? briefing.followUpTiming || 'Suggested'
        : 'Idle';
    }
    if (aiOutreachGuide) {
      aiOutreachGuide.innerHTML = renderAiOutreachGuide(briefing);
    }
    if (aiOutreachStatus) {
      aiOutreachStatus.textContent = briefing?.sequenceSuggestion?.name
        ? 'Ready'
        : briefing?.summary
          ? 'Drafted'
          : 'Idle';
    }
    if (aiLeadBrief) {
      aiLeadBrief.innerHTML = renderAiLeadBrief(briefing);
    }
    if (aiLeadStatus) {
      aiLeadStatus.textContent = briefing?.leadScoreLabel || (briefing?.classification ? 'Scored' : 'Idle');
    }
    if (aiAnalyticsBrief) {
        aiAnalyticsBrief.innerHTML = renderAiAnalyticsBrief(briefing, conversations, workflowJobs, readiness, {
          voiceFollowUps: analyzedVoiceFollowUps,
          unifiedProfiles,
          whatsappDeliveryRate,
          whatsappTracked: whatsappTrackedMessages.length,
          whatsappRead: whatsappReadCount,
          whatsappFailures: whatsappFailedCount,
          whatsappFailureReason,
          whatsappFailureCategory: whatsappFailureCategory.label,
          whatsappRetryMode: whatsappRetryDiagnostics.nextRetryMode,
          whatsappRetryCount: whatsappRetryDiagnostics.retryCount,
          whatsappLastRetryAt: whatsappRetryDiagnostics.lastRetryAt
        });
      }
    if (aiAnalyticsStatus) {
      aiAnalyticsStatus.textContent = briefing?.classification
        ? (briefing.confidence ? `${Math.round(Number(briefing.confidence) * 100)}% confidence` : 'Active')
        : 'Idle';
    }
    if (aiDeployBrief) {
      aiDeployBrief.innerHTML = renderAiDeployBrief(briefing, readiness, {
        voiceProfiles: voiceProfiles.length,
        pendingVoiceAnalysis,
        deliverySuccessRate,
        deliveryVolume: deliveryTrackedMessages.length
      });
    }
    if (aiDeployStatus) {
      const blockedProviders = readiness.filter((item) => !(item.outboundReady || item.inboundReady)).length;
      aiDeployStatus.textContent = blockedProviders
        ? `${blockedProviders} blocked`
        : readiness.length
          ? 'Live'
          : 'Idle';
    }
  }

  async function maybeEscalateLowConfidence(confidence, mode, conversationId) {
    const shouldEscalateForConfidence = Number.isFinite(confidence) && confidence > 0 && confidence < 0.45 && conversationId;
    if (!shouldEscalateForConfidence) {
      return false;
    }

    await backendService.updateConversation(conversationId, {
      status: 'escalated',
      updated_at: new Date().toISOString()
    }).catch(() => null);
    await backendService.createActivityEvent(auth.workspaceId, {
      entity_type: 'conversation',
      entity_id: conversationId,
      event_type: 'ai_low_confidence_escalation',
      payload: {
        confidence,
        threshold: 0.45,
        mode
      }
    }).catch(() => null);
    return true;
  }

  function describeReplyOutcome(result = {}, mode = 'sent') {
      const raw = result?.raw_payload || result?.rawPayload || {};
      const providerResult = raw.provider_result || raw.providerResult || {};
      const provider = String(
        providerResult.providerLabel
        || providerResult.provider
        || result?.source_provider
        || 'manual'
      ).trim();
      const deliveryState = String(
        providerResult.providerDeliveryStatus
        || result?.delivery_state
        || raw.delivery_state
        || mode
      ).trim();
      const target = String(
        result?.recipient_email
        || result?.recipient_phone
        || result?.recipient_id
        || ''
      ).trim();
      const providerMessageId = String(
        providerResult.providerMessageId
        || result?.external_message_id
        || ''
      ).trim();
      const transport = String(providerResult.transport || providerResult.providerTransport || '').trim();
      const modeLabel = mode === 'queued' ? 'Queued' : 'Sent';
      const base = `${modeLabel} via ${provider || 'provider'}: ${deliveryState || mode}.`;
      const parts = [
        target ? `Target ${target}` : '',
        providerMessageId ? `ID ${providerMessageId.slice(0, 18)}` : '',
        transport ? transport : ''
      ].filter(Boolean);
      return parts.length ? `${base} ${parts.join(' | ')}` : base;
    }

  function assertPermission(capability, fallbackMessage = '') {
    const role = auth.role || 'viewer';
    const permissions = auth.permissions || {};
    const allowed = typeof permissions[capability] === 'boolean'
      ? permissions[capability]
      : canPerformWorkspaceAction(role, capability);
    if (!allowed) {
      throw new Error(fallbackMessage || `Your ${describeWorkspaceRole(role)} role cannot perform this action.`);
    }
  }

  function getLatestConversationContext() {
    const conversations = Array.isArray(auth.snapshot?.conversations) ? auth.snapshot.conversations.slice() : [];
    const contactsById = new Map((auth.snapshot?.contacts || []).map((item) => [item.id, item]));
    const messages = Array.isArray(auth.snapshot?.messages) ? auth.snapshot.messages : [];
    const latest = auth.selectedConversationId
      ? conversations.find((item) => item.id === auth.selectedConversationId)
      : conversations.sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())[0];
    if (!latest) return null;

    const relatedMessages = messages
      .filter((item) => item.conversation_id === latest.id)
      .sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime())
      .slice(-8);

    const contact = latest.contact_id ? contactsById.get(latest.contact_id) : null;
    return {
      conversation: {
        ...latest,
        name: contact?.name || latest.subject || 'Customer',
        channel: latest.source || 'Direct',
        lastMessage: latest.summary || latest.subject || 'No summary yet.'
      },
      messages: relatedMessages
    };
  }

  function buildRelaySetupPayload(providerKey, extra = {}) {
    const key = String(providerKey || '').trim().toLowerCase();
    const provider = getProviderConnector(key);
    const callbackUrl = key === 'whatsapp'
      ? `${window.location.origin.replace(/\/$/, '')}/.netlify/functions/whatsapp-webhook`
      : `${window.location.origin.replace(/\/$/, '')}/api/webhook/${encodeURIComponent(provider.key)}?workspace_id=${encodeURIComponent(auth.workspaceId || '')}`;
    const baseRequirements = key === 'gmail'
      ? [
          'GOOGLE_CLIENT_ID',
          'GOOGLE_CLIENT_SECRET',
          'GMAIL_INBOX_ADDRESS',
          'Google Cloud Pub/Sub topic',
          'Pub/Sub push subscription'
        ]
      : key === 'whatsapp'
        ? [
            'TWILIO_ACCOUNT_SID',
            'TWILIO_AUTH_TOKEN',
            'TWILIO_CONVERSATIONS_SERVICE_SID',
            'TWILIO_WHATSAPP_SENDER',
            'Netlify WhatsApp webhook URL'
          ]
        : [
            'TWILIO_ACCOUNT_SID',
            'TWILIO_AUTH_TOKEN',
            'TWILIO_CONVERSATIONS_SERVICE_SID',
            'Supabase Edge Function webhook URL'
          ];

    return {
      relay_setup: {
        provider: provider.key,
        provider_config_key: provider.key,
        callback_url: callbackUrl,
        rollout_priority: provider.rolloutPriority || null,
        rollout_note: provider.rolloutNote || '',
        setup_requirements: baseRequirements,
        configured_at: new Date().toISOString(),
        ...extra
      }
    };
  }

  async function persistProviderRelaySetup(providerKey, extra = {}) {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    const provider = getProviderConnector(providerKey);
    const existingChannel = Array.isArray(auth.snapshot?.channels)
      ? auth.snapshot.channels.find((item) => String(item.provider || '').toLowerCase() === provider.key)
      : null;
    const payload = {
      workspace_id: auth.workspaceId,
      provider: provider.key,
      channel_type: provider.channelType,
      display_name: existingChannel?.display_name || provider.label,
      status: existingChannel?.status || (provider.key === 'gmail' ? 'live' : 'configured'),
      provider_account_id: existingChannel?.provider_account_id || '',
      connection_state: existingChannel?.connection_state || 'connecting',
      webhook_state: existingChannel?.webhook_state || 'unknown',
      token_health: {
        ...(existingChannel?.token_health || {}),
        provider: provider.key,
        status: 'unknown'
      },
      last_sync_at: existingChannel?.last_sync_at || null,
      external_metadata: {
        ...(existingChannel?.external_metadata || {}),
        ...buildRelaySetupPayload(provider.key, extra)
      }
    };

    if (existingChannel?.id) {
      await backendService.updateChannel(existingChannel.id, payload);
    } else {
      await backendService.createChannel(auth.workspaceId, payload);
    }
  }

  async function resetProviderRelaySetup(providerKey) {
    assertPermission('connectChannels', 'Your role cannot reset provider relay setup.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    const provider = getProviderConnector(providerKey);
    const existingChannel = Array.isArray(auth.snapshot?.channels)
      ? auth.snapshot.channels.find((item) => String(item.provider || '').toLowerCase() === provider.key)
      : null;
    const resetMetadata = {
      ...(existingChannel?.external_metadata || {}),
      relay_setup: {
        ...(existingChannel?.external_metadata?.relay_setup || {}),
        provider: provider.key,
        relay_status: 'needs_review',
        reset_at: new Date().toISOString(),
        last_webhook_test_at: '',
        last_webhook_event: '',
        note: 'Relay state reset from the Deploy panel.'
      }
    };
    const payload = {
      workspace_id: auth.workspaceId,
      provider: provider.key,
      channel_type: provider.channelType,
      display_name: existingChannel?.display_name || provider.label,
      status: existingChannel?.status || (provider.key === 'gmail' ? 'live' : 'configured'),
      provider_account_id: existingChannel?.provider_account_id || '',
      connection_state: 'needs_review',
      webhook_state: 'stale',
      token_health: {
        ...(existingChannel?.token_health || {}),
        provider: provider.key,
        status: 'needs_review'
      },
      external_metadata: resetMetadata
    };

    if (existingChannel?.id) {
      await backendService.updateChannel(existingChannel.id, payload);
    } else {
      await backendService.createChannel(auth.workspaceId, payload);
    }

    await refreshWorkspaceData();
    toast(`${provider.label} relay reset to needs review.`);
  }

  async function generateAiAssist(mode = 'reply') {
    const { context, payload } = buildAiPayload(mode);
    setAiStatus(`Generating AI ${mode.replace('_', ' ')}...`);
    const data = mode === 'summary'
      ? await backendService.requestAiSummary(payload)
      : mode === 'classify'
        ? await backendService.requestAiClassification(payload)
        : mode === 'next_action'
          ? await backendService.requestAiNextAction(payload)
          : await backendService.requestAiReply(payload);
    const confidence = buildAiConfidence(data);
    if (mode === 'reply' && aiReplyOutput) {
      aiReplyOutput.value = data.output || '';
    }
    if (mode === 'summary' && aiSummary) {
      aiSummary.textContent = data.output || 'No summary returned.';
    }
    if (mode === 'classify' && aiClassification) {
      aiClassification.textContent = data.output || 'No classification returned.';
    }
    if (mode === 'next_action' && aiNextAction) {
      aiNextAction.textContent = data.output || 'No recommendation returned.';
    }
    const recommendation = buildAiRecommendationCard({
      mode,
      output: data.output || '',
      conversation: context.conversation,
      workspaceName: workspaceTitle?.textContent || 'AuraFlow Workspace',
      confidence
    });
    syncAiRecommendation(recommendation);
    primeCrossScreenAiState(recommendation);
    const shouldEscalateForConfidence = await maybeEscalateLowConfidence(confidence, mode, auth.selectedConversationId);
    try {
      await backendService.createActivityEvent(auth.workspaceId, {
        entity_type: 'conversation',
        entity_id: auth.selectedConversationId || context.conversation.id,
        event_type: `ai_${mode}_generated`,
        payload: {
          mode,
          output: data.output || '',
          model: buildAiModelLabel(data),
          confidence
        }
      });
      if (mode === 'summary' && auth.selectedConversationId) {
        await backendService.updateConversation(auth.selectedConversationId, {
          summary: data.output || '',
          updated_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn('Backend AI activity write failed.', error);
    }
    setAiStatus(`${mode.replace('_', ' ')} generated with ${buildAiModelLabel(data)}.`);
    toast(`AI ${mode.replace('_', ' ')} generated.`);
    if (shouldEscalateForConfidence) {
      setReplyStatus('AI confidence is low, so this thread was escalated for human review.');
      await refreshWorkspaceData();
    }
  }

  async function generateAiBriefing() {
    const { context, payload } = buildAiPayload('briefing');
    setAiStatus('Running full AI briefing...');
    const data = await backendService.requestAiBriefing(payload);
    const confidence = buildAiConfidence(data);
    const summaryText = String(data.summary || data.output || '').trim();
    const classificationText = String(data.classification || '').trim();
    const nextActionText = String(data.nextAction || data.output || '').trim();
    const replyDraftText = String(data.reply || data.replyDraft || '').trim();
    const leadScore = {
      ...buildLeadScoreFromBriefing({
        classification: classificationText,
        confidence
      }),
      label: String(data.leadScoreLabel || '').trim() || buildLeadScoreFromBriefing({
        classification: classificationText,
        confidence
      }).label,
      reason: String(data.leadScoreReason || '').trim() || buildLeadScoreFromBriefing({
        classification: classificationText,
        confidence
      }).reason
    };

    if (aiSummary) {
      aiSummary.textContent = summaryText || 'No summary returned.';
    }
    if (aiClassification) {
      aiClassification.textContent = classificationText || 'No classification returned.';
    }
    if (aiNextAction) {
      aiNextAction.textContent = nextActionText || 'No recommendation returned.';
    }
    if (aiReplyOutput) {
      aiReplyOutput.value = replyDraftText || '';
    }

    const recommendation = buildAiRecommendationCard({
      mode: 'briefing',
      output: nextActionText || summaryText || replyDraftText,
      conversation: context.conversation,
      workspaceName: workspaceTitle?.textContent || 'AuraFlow Workspace',
      classification: classificationText,
      suggestedAssignee: data.suggestedAssignee,
      followUpTiming: data.followUpTiming,
      handoffReason: data.handoffReason,
      actionLabel: 'Run full assist',
      confidence
    });
    syncAiRecommendation(recommendation);
      auth.aiBriefing = {
        summary: summaryText,
        classification: classificationText,
        nextAction: nextActionText,
        reply: replyDraftText,
      confidence,
      model: buildAiModelLabel(data),
      suggestedAssignee: recommendation.recommendedAssignee,
      followUpTiming: recommendation.followUpTiming,
        handoffReason: recommendation.handoffReason,
        sequenceSuggestion: data.sequenceSuggestion || {},
        templateRecommendation: String((data.sequenceSuggestion?.channel || '').toLowerCase()).includes('whatsapp')
          ? (String(data.sequenceSuggestion?.goal || nextActionText || '').toLowerCase().includes('appoint') ? 'appointment_reminder' : 'lead_intro')
          : 'freeform',
        leadScoreLabel: leadScore.label,
        leadScoreReason: leadScore.reason
      };
    persistAiBriefingState();
    primeCrossScreenAiState(recommendation, data);
    syncAiWorkspaceSurfaces();

    const shouldEscalate = Boolean(data.shouldEscalate) || await maybeEscalateLowConfidence(confidence, 'briefing', auth.selectedConversationId);
    if (shouldEscalate && auth.selectedConversationId) {
      await backendService.updateConversation(auth.selectedConversationId, {
        status: 'escalated',
        updated_at: new Date().toISOString()
      }).catch(() => null);
    }

    try {
      await backendService.createActivityEvent(auth.workspaceId, {
        entity_type: 'conversation',
        entity_id: auth.selectedConversationId || context.conversation.id,
        event_type: 'ai_briefing_generated',
        payload: {
          summary: summaryText,
          classification: classificationText,
          nextAction: nextActionText,
          reply: replyDraftText,
          confidence,
          model: buildAiModelLabel(data),
          suggestedAssignee: recommendation.recommendedAssignee,
          followUpTiming: recommendation.followUpTiming,
          handoffReason: recommendation.handoffReason,
          sequenceSuggestion: data.sequenceSuggestion || {},
          leadScoreLabel: leadScore.label,
          leadScoreReason: leadScore.reason
        }
      });
      if (summaryText && auth.selectedConversationId) {
        await backendService.updateConversation(auth.selectedConversationId, {
          summary: summaryText,
          updated_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn('Backend AI briefing activity write failed.', error);
    }

    setAiStatus(`AI briefing ready with ${buildAiModelLabel(data)}.`);
    toast('AI briefing generated.');
    if (shouldEscalate) {
      setReplyStatus('AI flagged this thread for human review, so the conversation was escalated.');
      await refreshWorkspaceData();
    }
  }

  async function generateAiReplyDraft() {
    await generateAiAssist('reply');
  }

  async function createAiWorkflowJob(choice = 'auto') {
    assertPermission('manageWorkflows', 'Your role cannot create workflow jobs from AI recommendations.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    const recommendation = auth.aiRecommendation || buildAiRecommendationCard({
      mode: aiNextAction?.textContent ? 'next_action' : aiClassification?.textContent ? 'classify' : aiSummary?.textContent ? 'summary' : 'reply',
      output: (aiNextAction?.textContent || aiClassification?.textContent || aiSummary?.textContent || aiReplyOutput?.value || '').trim(),
      conversation: getLatestConversationContext()?.conversation || {}
    });
    const sourceText = recommendation.summary || '';
    if (!sourceText || /no (summary|classification|recommendation)/i.test(sourceText)) {
      throw new Error('Generate an AI summary, classification, or next action first.');
    }

    const normalizedChoice = String(choice || 'auto').toLowerCase();
    const lower = `${sourceText} ${recommendation.handoffReason || ''}`.toLowerCase();
    const choiceLabel = normalizedChoice === 'handoff'
      ? 'Hand off'
      : normalizedChoice === 'follow_up'
        ? 'Follow up'
        : normalizedChoice === 'assign'
          ? 'Assign'
          : 'Auto';
    const jobType = normalizedChoice === 'handoff'
      ? 'workflow.handoff_review'
      : normalizedChoice === 'follow_up'
        ? 'workflow.follow_up_suggestion'
        : normalizedChoice === 'assign'
          ? 'workflow.auto_assign'
          : lower.includes('handoff') || lower.includes('escalat') || lower.includes('refund') || lower.includes('billing')
            ? 'workflow.handoff_review'
            : lower.includes('assign') || lower.includes('sales') || lower.includes('pricing') || lower.includes('demo') || lower.includes('trial')
              ? 'workflow.auto_assign'
              : lower.includes('follow-up') || lower.includes('follow up') || lower.includes('nurture')
                ? 'workflow.follow_up_suggestion'
                : 'workflow.ai_recommendation';

    const job = await backendService.createSyncJob(auth.workspaceId, {
      type: jobType,
      payload: {
        conversationId: auth.selectedConversationId || '',
        mode: recommendation.mode,
        choice: normalizedChoice,
        choiceLabel,
        recommendation: recommendation.summary,
        suggestedAssignee: recommendation.recommendedAssignee,
        followUpTiming: recommendation.followUpTiming,
        handoffReason: recommendation.handoffReason,
        createdFrom: 'ai-panel',
        escalationReason: jobType === 'workflow.handoff_review' ? recommendation.handoffReason : ''
      }
    });

    await backendService.createActivityEvent(auth.workspaceId, {
      entity_type: 'conversation',
      entity_id: auth.selectedConversationId || getLatestConversationContext()?.conversation?.id || '',
      event_type: 'ai_recommendation.action_created',
      payload: {
        jobType,
        choice: normalizedChoice,
        choiceLabel,
        recommendedAssignee: recommendation.recommendedAssignee,
        followUpTiming: recommendation.followUpTiming,
        handoffReason: recommendation.handoffReason
      }
    }).catch((error) => {
      console.warn('Failed to log AI recommendation action.', error);
    });

    await refreshWorkflowQueue();
    setAiStatus(`Created ${choiceLabel.toLowerCase()} job from the AI panel.`);
    toast('AI recommendation queued.');
    return job;
  }

  async function saveOutboundReply(mode = 'sent', options = {}) {
    assertPermission('sendReplies', 'Your role cannot send replies from this workspace.');
    const targetConversationId = String(options?.conversationId || auth.selectedConversationId || '').trim();
    if (!auth.workspaceId || !targetConversationId) {
      throw new Error('Select a conversation first.');
    }

    const body = String(options?.bodyOverride ?? aiReplyOutput?.value ?? '').trim();
    if (!body) {
      throw new Error('Generate or write a reply before sending it.');
    }

    const selectedConversation = Array.isArray(auth.snapshot?.conversations)
      ? auth.snapshot.conversations.find((item) => item.id === targetConversationId)
      : null;
      const selectedContact = selectedConversation?.contact_id && Array.isArray(auth.snapshot?.contacts)
        ? auth.snapshot.contacts.find((item) => item.id === selectedConversation.contact_id)
        : null;
      const providerKey = String(selectedConversation?.source_provider || selectedConversation?.source || 'manual').toLowerCase();
      const conversationMessages = getConversationMessages(targetConversationId);
      const templateState = getWhatsAppTemplateModeState(selectedConversation, conversationMessages, auth.aiBriefing || {});
      const requestedTemplateMode = String(options?.templateModeOverride || replyTemplateModeInput?.value || 'auto').trim().toLowerCase();
      const resolvedTemplateMode = providerKey === 'whatsapp'
        ? (requestedTemplateMode === 'auto'
          ? (templateState.policyLimited ? (templateState.recommendedTemplate || 'lead_intro') : 'freeform')
          : requestedTemplateMode)
        : 'freeform';
      const replyTargetStatus = String(selectedConversation?.reply_target_status || '').toLowerCase();
      if (['instagram', 'messenger'].includes(providerKey) && ['missing', 'placeholder'].includes(replyTargetStatus)) {
        throw new Error(selectedConversation?.reply_target_note || 'A real inbound Twilio Conversations thread is required before live replies can be sent.');
      }
      if (providerKey === 'whatsapp' && templateState.policyLimited && resolvedTemplateMode === 'freeform') {
        throw new Error('This WhatsApp thread likely needs a template-backed send now. Switch the send mode away from free-form before retrying.');
      }
      const phoneHealth = getContactPhoneHealth(selectedContact || {});
      if (providerKey === 'sms' && phoneHealth.lineType === 'landline') {
        const message = 'SMS disabled: Recipient is a landline. Please use WhatsApp or Gmail.';
        if (sendReplyButton) sendReplyButton.title = message;
        throw new Error(message);
      }

      const senderName = workspaceTitle?.textContent || 'AuraFlow';
      const replyPayload = {
      workspace_id: auth.workspaceId,
      source_provider: providerKey,
      direction: 'outbound',
      sender_name: senderName,
      body,
      recipient_id: selectedConversation?.recipient_id || selectedConversation?.recipientId || '',
      recipient_email: selectedConversation?.recipient_email || selectedConversation?.recipientEmail || selectedContact?.email || '',
      recipient_phone: selectedConversation?.recipient_phone || selectedConversation?.recipientPhone || selectedContact?.phone || '',
        raw_payload: {
          source: 'manual_reply',
          delivery_state: mode,
          channel: selectedConversation?.source || selectedConversation?.channel || 'Direct',
          send_mode: resolvedTemplateMode,
          template_name: resolvedTemplateMode === 'lead_intro'
            ? 'Lead intro template'
            : resolvedTemplateMode === 'appointment_reminder'
              ? 'Appointment reminder'
              : '',
          template_variables: resolvedTemplateMode !== 'freeform'
            ? {
              contact_name: selectedContact?.name || selectedConversation?.name || 'Customer',
              business_name: workspaceTitle?.textContent || 'Neway Marketing',
              lead_interest: auth.aiBriefing?.classification || auth.aiBriefing?.nextAction || selectedConversation?.summary || 'Business inquiry'
            }
            : null
        },
        patchConversation: true,
        status: selectedConversation?.status || 'open',
        last_message_at: new Date().toISOString()
      };

      let replyRecord;
      try {
        replyRecord = await backendService.replyToConversation(targetConversationId, replyPayload);
        await backendService.updateConversation(targetConversationId, {
          status: selectedConversation?.status || 'open',
          updated_at: new Date().toISOString(),
          last_message_at: new Date().toISOString()
        });
        await backendService.createActivityEvent(auth.workspaceId, {
            entity_type: 'conversation',
            entity_id: targetConversationId,
            event_type: mode === 'queued' ? 'outbound_reply_queued' : 'outbound_reply_sent',
            payload: {
              body,
            mode,
            sender_name: senderName,
            delivery_state: replyRecord?.delivery_state || mode,
            external_message_id: replyRecord?.external_message_id || '',
            provider_result: replyRecord?.raw_payload?.provider_result || replyRecord?.rawPayload?.provider_result || null
          }
        });
      } catch (error) {
        console.warn('Backend reply write failed.', error);
        setReplyStatus(`Send blocked: ${error?.message || 'Reply failed.'}`);
        throw error;
      }

    await refreshWorkspaceData();
    const statusMessage = describeReplyOutcome(replyRecord, mode);
    if (!options?.skipReplyStatus && targetConversationId === auth.selectedConversationId) {
      setReplyStatus(statusMessage);
    }
    if (!options?.silentToast) {
      toast(statusMessage);
    }
    return { replyRecord, statusMessage, conversationId: targetConversationId };
  }

    async function sendReplyRecord() {
      await saveOutboundReply('sent');
    }

    async function queueReplyRecord() {
      await saveOutboundReply('queued');
    }

  function getFailedConversationPlan(conversationId = '') {
    const normalizedConversationId = String(conversationId || '').trim();
    const conversation = Array.isArray(auth.snapshot?.conversations)
      ? auth.snapshot.conversations.find((item) => item.id === normalizedConversationId)
      : null;
    if (!conversation) {
      return { safe: false, reason: 'Conversation could not be found.' };
    }
    const provider = String(conversation.source_provider || conversation.source || conversation.channel || '').toLowerCase();
    if (provider !== 'whatsapp') {
      return { safe: false, reason: 'Only WhatsApp retries can be bulk-run from this action.' };
    }
    const threadMessages = Array.isArray(auth.snapshot?.messages)
      ? auth.snapshot.messages
        .filter((item) => item.conversation_id === normalizedConversationId)
        .sort((left, right) => new Date(right.created_at || right.updated_at || 0).getTime() - new Date(left.created_at || left.updated_at || 0).getTime())
      : [];
    const failedMessage = threadMessages.find((item) => {
      if (String(item.direction || '').toLowerCase() !== 'outbound') return false;
      const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
      return ['failed', 'error', 'undelivered', 'retrying'].includes(state);
    });
    if (!failedMessage) {
      return { safe: false, reason: 'No failed outbound WhatsApp reply is available.' };
    }
    const retryDiagnostics = buildRetryDiagnostics(threadMessages);
    const failureCategory = classifyFailureReason(retryDiagnostics.failureReason);
    if (retryDiagnostics.nextRetryMode === 'Automatic retry queued') {
      return {
        safe: false,
        reason: retryDiagnostics.retryCount
          ? `Automatic retry already queued after ${retryDiagnostics.retryCount} prior ${retryDiagnostics.retryCount === 1 ? 'attempt' : 'attempts'}.`
          : 'Automatic retry is already queued.'
      };
    }
    if (['Auth or access', 'Template or policy', 'Recipient issue', 'Needs review'].includes(failureCategory.label)) {
      return {
        safe: false,
        reason: failureCategory.guidance || `${failureCategory.label} failures should be handled manually before retrying.`,
        failureCategory: failureCategory.label
      };
    }
    const body = String(failedMessage.body || '').trim();
    if (!body) {
      return { safe: false, reason: 'The failed message has no body to reuse for a retry.' };
    }
    return {
      safe: true,
      conversationId: normalizedConversationId,
      body,
      conversation,
      failureReason: retryDiagnostics.failureReason,
      failureCategory: failureCategory.label,
      retryDiagnostics
    };
  }

  async function retryLastReply() {
    const selectedConversation = Array.isArray(auth.snapshot?.conversations)
      ? auth.snapshot.conversations.find((item) => item.id === auth.selectedConversationId)
      : null;
    if (!selectedConversation) {
      throw new Error('Select a conversation first.');
    }

    const threadMessages = Array.isArray(auth.snapshot?.messages)
      ? auth.snapshot.messages
          .filter((item) => item.conversation_id === auth.selectedConversationId)
          .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
      : [];
    const failedMessage = threadMessages.find((item) => {
      if (String(item.direction || '').toLowerCase() !== 'outbound') return false;
      const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
      return ['failed', 'error', 'retrying'].includes(state);
    });

    if (failedMessage && aiReplyOutput && !(aiReplyOutput.value || '').trim()) {
      aiReplyOutput.value = String(failedMessage.body || '').trim();
    }

    if (!(aiReplyOutput?.value || '').trim()) {
      throw new Error('No failed outbound reply is available to retry.');
    }

    await saveOutboundReply('sent');
  }

  async function retryFailedWhatsAppQueue({ limit = 5 } = {}) {
    const normalizedLimit = Math.max(1, Math.min(10, Number(limit) || 5));
    const failedConversations = Array.isArray(auth.snapshot?.conversations)
      ? auth.snapshot.conversations
        .filter((item) => {
          const provider = String(item.source_provider || item.source || item.channel || '').toLowerCase();
          const state = String(item.latestDeliveryState || '').toLowerCase();
          return provider === 'whatsapp' && ['failed', 'error', 'undelivered', 'retrying'].includes(state);
        })
        .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())
      : [];

    if (!failedConversations.length) {
      throw new Error('No failed WhatsApp sends are available to retry right now.');
    }

    const plans = failedConversations.map((item) => getFailedConversationPlan(item.id));
    const safePlans = plans.filter((item) => item.safe).slice(0, normalizedLimit);
    const blockedPlans = plans.filter((item) => !item.safe);

    if (!safePlans.length) {
      const blocker = blockedPlans[0]?.reason || 'No safe WhatsApp retries are available right now.';
      throw new Error(blocker);
    }

    const results = [];
    for (const plan of safePlans) {
      const result = await saveOutboundReply('sent', {
        conversationId: plan.conversationId,
        bodyOverride: plan.body,
        silentToast: true,
        skipReplyStatus: true
      });
      results.push({
        conversationId: plan.conversationId,
        name: plan.conversation?.name || plan.conversation?.subject || 'Customer',
        statusMessage: result.statusMessage
      });
    }

    const blockedCount = Math.max(0, blockedPlans.length);
    const remainingCount = Math.max(0, failedConversations.length - safePlans.length - blockedCount);
    const summary = `Retried ${results.length} failed WhatsApp send${results.length === 1 ? '' : 's'}${blockedCount ? `, skipped ${blockedCount} auto-queued or unsafe thread${blockedCount === 1 ? '' : 's'}` : ''}${remainingCount ? `, and left ${remainingCount} additional thread${remainingCount === 1 ? '' : 's'} for a later batch` : ''}.`;
    toast(summary);
    if (results.length && auth.selectedConversationId === results[0].conversationId) {
      setReplyStatus(results[0].statusMessage);
    }
    return {
      retried: results.length,
      skipped: blockedCount,
      remaining: remainingCount,
      results,
      blockedPlans
    };
  }

  async function openProviderConnect(providerKey) {
    assertPermission('connectChannels', 'Your role cannot connect or reconnect channels.');
    const provider = getProviderConnector(providerKey);
    if (!provider?.key) {
      throw new Error('Choose a provider to connect.');
    }

    const providerLabel = provider.label;
    const usesWorkspaceOAuth = ['gmail', 'facebook', 'whatsapp', 'instagram', 'messenger'].includes(provider.key);

    if (usesWorkspaceOAuth) {
      setStatus(nangoState, `Preparing ${providerLabel} workspace connection...`);
      let session;
      try {
        session = await backendService.startProviderOAuth(auth.workspaceId, provider.key, {
          workspaceId: auth.workspaceId,
          provider: provider.key,
          displayName: workspaceTitle?.textContent || 'AuraFlow Workspace'
        });
      } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (
          message.includes('app review')
          || message.includes('not approved')
          || message.includes('advanced access')
          || message.includes('pending approval')
        ) {
          setStatus(nangoState, `${providerLabel} is pending Meta approval. This connection will be available as soon as App Review clears.`);
          toast(`${providerLabel} is pending approval.`);
          return;
        }
        throw error;
      }

      if (session?.redirectUrl || session?.authUrl) {
        const redirectTarget = session.redirectUrl || session.authUrl;
        setStatus(nangoState, `Redirecting to ${providerLabel}...`);
        window.location.assign(redirectTarget);
        return;
      }

      setStatus(nangoState, `${providerLabel} connect flow is ready. Continue from the provider redirect.`);
      toast(`${providerLabel} connection flow started.`);
      return;
    }

    setStatus(nangoState, `Preparing ${providerLabel} for Twilio Conversations...`);
    await persistProviderRelaySetup(provider.key, {
      relay_status: 'manual_setup',
      connection_requested_at: new Date().toISOString(),
      manual_setup_required: true,
      oauth_provider: 'twilio',
      setup_owner: 'twilio-console'
    });
    setStatus(
      nangoState,
      `${providerLabel} is now marked for manual Twilio setup. Add the channel in the Twilio Console, point its webhook to the Supabase Edge Function, and then run a callback test here.`
    );
    toast(`${providerLabel} marked for Twilio Console setup.`);
  }

  async function seedProviderThread(provider = 'gmail') {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    const descriptor = buildProviderSeedDescriptor(normalizeProviderKey(provider));
    const providerLabel = descriptor.label;
    setIngestStatus(`Sending ${providerLabel} thread into the ingestion endpoint...`);
    const payload = buildDemoIngestPayload(descriptor.provider, auth.workspaceId);
    await backendService.ingestWebhookPayload(descriptor.provider, payload);

    await refreshWorkspaceData();
    setIngestStatus(`${providerLabel} thread ingested into the workspace.`);
    toast(`${providerLabel} thread ingested.`);
  }

  async function testGmailWebhookRelay() {
    assertPermission('connectChannels', 'Your role cannot run Gmail callback tests.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    setIngestStatus('Sending a Gmail webhook test through the canonical ingest path...');
    await backendService.testWebhookRelay('gmail', {
      workspaceId: auth.workspaceId
    });
    await persistProviderRelaySetup('gmail', {
      relay_status: 'verified',
      last_webhook_test_at: new Date().toISOString(),
      last_webhook_event: 'gmail.message.received'
    });
    await refreshWorkspaceData();
    setIngestStatus('Gmail webhook relay test completed and the inbox was refreshed.');
    toast('Gmail webhook test completed.');
  }

  async function testWhatsAppWebhookRelay() {
    assertPermission('connectChannels', 'Your role cannot run WhatsApp callback tests.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    setIngestStatus('Sending a WhatsApp webhook test through the canonical ingest path...');
    await backendService.testWebhookRelay('whatsapp', {
      workspaceId: auth.workspaceId
    });
    await persistProviderRelaySetup('whatsapp', {
      relay_status: 'verified',
      last_webhook_test_at: new Date().toISOString(),
      last_webhook_event: 'twilio.whatsapp.message.received'
    });
    await refreshWorkspaceData();
    setIngestStatus('WhatsApp webhook relay test completed and the inbox was refreshed.');
    toast('WhatsApp webhook test completed.');
  }

  async function createVoiceProfileRecord() {
    const name = voiceProfileNameInput?.value?.trim();
    const label = voiceProfileLabelInput?.value?.trim();
    if (!auth.workspaceId || !name || !label) {
      throw new Error('Voice profile name and label are required.');
    }

    try {
      await backendService.createVoiceProfile(auth.workspaceId, {
        name,
        label,
        voice_source: voiceProfileSourceInput?.value?.trim() || 'original',
        prompt_style: voiceProfileStyleInput?.value?.trim() || ''
      });
    } catch (error) {
      console.warn('Backend voice profile write failed.', error);
      throw error;
    }
    voiceProfileNameInput.value = '';
    voiceProfileLabelInput.value = '';
    voiceProfileSourceInput.value = '';
    voiceProfileStyleInput.value = '';
    await refreshWorkspaceData();
    toast('Voice profile saved.');
  }

  async function queueVoiceCallRecord() {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }
    try {
      await backendService.createVoiceSession(auth.workspaceId, {
        contact_id: voiceSessionContactSelect?.value || null,
        voice_profile_id: voiceSessionProfileSelect?.value || null,
        status: voiceSessionStatusInput?.value?.trim() || 'queued',
        disclosure_text: voiceSessionDisclosureInput?.value?.trim() || '',
        session_type: 'call'
      });
    } catch (error) {
      console.warn('Backend voice session write failed.', error);
      throw error;
    }
    await refreshWorkspaceData();
    toast('Voice call queued.');
  }

  async function saveVoiceNoteRecord() {
    const title = voiceNoteTitleInput?.value?.trim();
    const body = voiceNoteBodyInput?.value?.trim();
    if (!auth.workspaceId || !title || !body) {
      throw new Error('Voice note title and body are required.');
    }

    try {
      await backendService.createVoiceNote(auth.workspaceId, {
        contact_id: voiceNoteContactSelect?.value || null,
        voice_profile_id: voiceNoteProfileSelect?.value || null,
        voice_session_id: voiceNoteSessionSelect?.value || null,
        title,
        body,
        status: 'draft'
      });
    } catch (error) {
      console.warn('Backend voice note write failed.', error);
      throw error;
    }
    voiceNoteTitleInput.value = '';
    if (voiceNoteSessionSelect) voiceNoteSessionSelect.value = '';
    if (voiceNoteAudioUrlInput) voiceNoteAudioUrlInput.value = '';
    voiceNoteBodyInput.value = '';
    await refreshWorkspaceData();
    toast('Voice note saved.');
  }

  async function analyzeVoiceNoteRecord() {
    const title = voiceNoteTitleInput?.value?.trim();
    const body = voiceNoteBodyInput?.value?.trim();
    const audioUrl = voiceNoteAudioUrlInput?.value?.trim();
    if (!auth.workspaceId || (!body && !audioUrl)) {
      throw new Error('Add a transcript or recording URL before running Deepgram analysis.');
    }

    try {
      await backendService.analyzeVoiceNote(auth.workspaceId, {
        contact_id: voiceNoteContactSelect?.value || null,
        voice_profile_id: voiceNoteProfileSelect?.value || null,
        voice_session_id: voiceNoteSessionSelect?.value || null,
        title: title || 'Voice note analysis',
        body: body || '',
        audio_url: audioUrl || '',
        status: 'analyzed'
      });
    } catch (error) {
      console.warn('Backend voice analysis failed.', error);
      throw error;
    }
    if (voiceNoteTitleInput) voiceNoteTitleInput.value = '';
    if (voiceNoteSessionSelect) voiceNoteSessionSelect.value = '';
    if (voiceNoteAudioUrlInput) voiceNoteAudioUrlInput.value = '';
    if (voiceNoteBodyInput) voiceNoteBodyInput.value = '';
    await refreshWorkspaceData();
    toast('Deepgram analysis saved.');
  }

  async function assignConversationRecord({ status } = {}) {
    assertPermission('manageWorkflows', 'Your role cannot reassign or escalate conversations.');
    if (!auth.workspaceId || !auth.selectedConversationId) {
      throw new Error('Select a conversation first.');
    }
    const assignedTo = assignmentInput?.value?.trim() || 'Unassigned';
    const patch = {
      assigned_to: assignedTo,
      updated_at: new Date().toISOString()
    };
    if (status) {
      patch.status = status;
    }
    try {
      await backendService.updateConversation(auth.selectedConversationId, patch);
      await backendService.createActivityEvent(auth.workspaceId, {
        entity_type: 'conversation',
        entity_id: auth.selectedConversationId,
        event_type: status ? 'conversation_escalated' : 'conversation_assigned',
        payload: {
          assigned_to: assignedTo,
          status: status || null
        }
      });
    } catch (error) {
      console.warn('Backend conversation write failed.', error);
      throw error;
    }
    await refreshWorkspaceData();
    toast(status ? 'Conversation escalated.' : 'Conversation reassigned.');
  }

  async function saveInternalNoteRecord() {
    assertPermission('saveNotes', 'Your role cannot add internal notes.');
    const note = internalNoteInput?.value?.trim();
    if (!auth.workspaceId || !auth.selectedConversationId || !note) {
      throw new Error('Select a conversation and enter a note.');
    }
    try {
      await backendService.createActivityEvent(auth.workspaceId, {
        entity_type: 'conversation',
        entity_id: auth.selectedConversationId,
        event_type: 'internal_note_added',
        payload: { note }
      });
    } catch (error) {
      console.warn('Backend activity write failed.', error);
      throw error;
    }
    internalNoteInput.value = '';
    await refreshWorkspaceData();
    toast('Internal note saved.');
  }

  async function mergeContactRecord() {
    assertPermission('editContacts', 'Your role cannot merge contacts.');
    if (!auth.workspaceId || !auth.selectedConversationId) {
      throw new Error('Select a conversation first.');
    }

    const selectedConversation = Array.isArray(auth.snapshot?.conversations)
      ? auth.snapshot.conversations.find((item) => item.id === auth.selectedConversationId)
      : null;
    const sourceContactId = selectedConversation?.contact_id || '';
    const targetContactId = contactMergeTargetSelect?.value?.trim() || '';

    if (!sourceContactId) {
      throw new Error('The selected conversation does not have a contact to merge.');
    }
    if (!targetContactId) {
      throw new Error('Choose a target contact to merge into.');
    }
    if (sourceContactId === targetContactId) {
      throw new Error('Choose a different contact to merge into.');
    }

    setStatus(mergeStatus, 'Merging contact records...');
    try {
      await backendService.mergeContacts(sourceContactId, {
        merged_into_contact_id: targetContactId,
        merged_at: new Date().toISOString()
      });
      await backendService.createActivityEvent(auth.workspaceId, {
        entity_type: 'contact',
        entity_id: sourceContactId,
        event_type: 'contact_merged',
        payload: {
          merged_into_contact_id: targetContactId,
          merged_from_contact_id: sourceContactId
        }
      });
    } catch (error) {
      console.warn('Backend contact merge failed.', error);
      throw error;
    }

    contactMergeTargetSelect.value = '';
    await refreshWorkspaceData();
    setStatus(mergeStatus, 'Contact merge saved.');
    toast('Contacts merged.');
  }

  async function saveContactTagsRecord() {
    assertPermission('editContacts', 'Your role cannot edit contact tags.');
    if (!auth.workspaceId || !auth.selectedConversationId) {
      throw new Error('Select a conversation first.');
    }

    const selectedConversation = Array.isArray(auth.snapshot?.conversations)
      ? auth.snapshot.conversations.find((item) => item.id === auth.selectedConversationId)
      : null;
    const contactId = selectedConversation?.contact_id || '';
    const tagsContainer = contactDetail?.querySelector('[data-contact-tags-list]');
    const tagsFromChips = Array.from(tagsContainer?.querySelectorAll('[data-contact-tag-value]') || [])
      .map((node) => String(node.dataset.contactTagValue || '').trim())
      .filter(Boolean);
    const pendingTag = String(contactDetail?.querySelector('[data-contact-tag-input]')?.value || '').trim();
    const tags = Array.from(new Set([...tagsFromChips, pendingTag].filter(Boolean)));

    if (!contactId) {
      throw new Error('The selected conversation does not have a contact to update.');
    }

    try {
      await backendService.updateContact(contactId, {
        tags,
        updated_at: new Date().toISOString()
      });
      await backendService.createActivityEvent(auth.workspaceId, {
        entity_type: 'contact',
        entity_id: contactId,
        event_type: 'contact_tags_updated',
        payload: { tags }
      });
    } catch (error) {
      console.warn('Backend contact tag update failed.', error);
      throw error;
    }

    const liveTagsStatus = contactDetail?.querySelector('[data-contact-tags-status]') || contactTagsStatus;
    if (liveTagsStatus) {
      setStatus(liveTagsStatus, 'Contact tags saved.');
    }
    const contactTagInputNode = contactDetail?.querySelector('[data-contact-tag-input]');
    if (contactTagInputNode) {
      contactTagInputNode.value = '';
    }
    await refreshWorkspaceData();
    toast('Contact tags saved.');
  }

  async function saveFollowUpSequenceRecord() {
    assertPermission('manageWorkflows', 'Your role cannot save follow-up sequences.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    const sequenceId = String(sequenceIdInput?.value || auth.selectedSequenceId || '').trim();
    const stepValues = Array.from(sequenceStepList?.querySelectorAll('[data-sequence-step-value]') || [])
      .map((node) => String(node.value || '').trim())
      .filter(Boolean);
    const payload = {
      name: sequenceNameInput?.value?.trim() || 'Follow-up sequence',
      status: sequenceStatusInput?.value?.trim() || 'draft',
      trigger: sequenceTriggerInput?.value?.trim() || '',
      channel: sequenceChannelInput?.value?.trim() || '',
      template_mode: sequenceTemplateModeInput?.value?.trim() || 'auto',
      goal: sequenceGoalInput?.value?.trim() || '',
      owner: sequenceOwnerInput?.value?.trim() || '',
      steps: stepValues.length || Number(sequenceStepsInput?.value || 0) || 0,
      replies: sequenceRepliesInput?.value?.trim() || '0%',
      deliveries: sequenceDeliveriesInput?.value?.trim() || '0%',
      next_run: sequenceNextRunInput?.value?.trim() || '',
      notes: sequenceNotesInput?.value?.trim() || '',
      steps_detail: stepValues
    };

    try {
      if (sequenceId) {
        await backendService.updateFollowUpSequence(sequenceId, payload);
        auth.selectedSequenceId = sequenceId;
      } else {
        const created = await backendService.createFollowUpSequence(auth.workspaceId, payload);
        const createdId = String(created?.id || created?.sequence?.id || '').trim();
        if (createdId) {
          auth.selectedSequenceId = createdId;
          if (sequenceIdInput) {
            sequenceIdInput.value = createdId;
          }
        }
      }
    } catch (error) {
      console.warn('Backend follow-up save failed.', error);
      throw error;
    }

    await refreshWorkspaceData();
    if (sequenceStatusNote) {
      sequenceStatusNote.textContent = sequenceId ? 'Sequence updated.' : 'Sequence created.';
    }
    if (sequenceTemplateStatus) {
      const templateMode = String(sequenceTemplateModeInput?.value || 'auto').trim().toLowerCase();
      sequenceTemplateStatus.textContent = templateMode === 'freeform'
        ? 'Sequence is currently set to free-form WhatsApp sends when the thread is still active.'
        : templateMode === 'auto'
          ? 'Sequence will choose between free-form and template-backed WhatsApp steps based on thread freshness.'
          : 'Sequence is set to a template-backed WhatsApp posture.';
    }
    if (sequenceEditorTitle) {
      sequenceEditorTitle.textContent = sequenceNameInput?.value?.trim() || 'Follow-up sequence';
    }
    toast(sequenceId ? 'Sequence updated.' : 'Sequence saved.');
  }

  function renderSequenceStepEditorRows(steps = []) {
    const values = Array.isArray(steps) ? steps.filter(Boolean).slice(0, 6) : [];
    const rows = values.length ? values : ['Review the thread and send the first touch.'];
    if (!sequenceStepList) return;
    sequenceStepList.innerHTML = rows.map((step, index) => `
      <div class="sequence-step-row" data-sequence-step-row data-step-index="${index}" draggable="true">
        <button class="ghost-button compact" type="button" data-action="drag-sequence-step" data-step-index="${index}" aria-label="Drag to reorder">Drag</button>
        <span class="badge neutral">${index + 1}</span>
        <input type="text" data-sequence-step-value value="${escapeHtml(String(step))}" placeholder="Step copy or timing" />
        <button class="ghost-button compact" type="button" data-action="move-sequence-step" data-direction="up" data-step-index="${index}">Up</button>
        <button class="ghost-button compact" type="button" data-action="move-sequence-step" data-direction="down" data-step-index="${index}">Down</button>
        <button class="ghost-button compact" type="button" data-action="remove-sequence-step" data-step-index="${index}">Remove</button>
      </div>
    `).join('');
  }

  async function applyAiSequenceSuggestion(variant = 'default') {
    const briefing = auth.aiBriefing || {};
    const sequence = briefing.sequenceSuggestion || {};
    if (!briefing.summary && !sequence.name && !briefing.nextAction) {
      throw new Error('Run AI brief from Inbox first so AuraFlow has a live outreach plan to apply.');
    }

    const normalizedVariant = String(variant || 'default').trim().toLowerCase();
    const channelMap = {
      email: 'Email',
      whatsapp: 'WhatsApp',
      default: sequence.channel || 'Email + WhatsApp'
    };
    const goalSuffix = normalizedVariant === 'email'
      ? 'with a fuller written recap and CTA.'
      : normalizedVariant === 'whatsapp'
        ? 'with a shorter conversational check-in.'
        : 'through the recommended channel mix.';

    if (sequenceNameInput) {
      sequenceNameInput.value = sequence.name
        || `${normalizedVariant === 'email' ? 'Email' : normalizedVariant === 'whatsapp' ? 'WhatsApp' : 'Follow-up'} recovery plan`;
    }
    if (sequenceStatusInput && !String(sequenceStatusInput.value || '').trim()) {
      sequenceStatusInput.value = 'draft';
    }
    if (sequenceTriggerInput) {
      sequenceTriggerInput.value = sequence.trigger || 'No reply after the current thread cools';
    }
    if (sequenceChannelInput) {
      sequenceChannelInput.value = channelMap[normalizedVariant] || channelMap.default;
    }
    if (sequenceTemplateModeInput) {
      sequenceTemplateModeInput.value = normalizedVariant === 'whatsapp'
        ? 'lead_intro'
        : normalizedVariant === 'email'
          ? 'freeform'
          : 'auto';
    }
    if (sequenceGoalInput) {
      const baseGoal = sequence.goal || briefing.nextAction || briefing.summary || 'Re-engage the lead';
      sequenceGoalInput.value = `${baseGoal} ${goalSuffix}`.trim();
    }
    if (sequenceOwnerInput) {
      sequenceOwnerInput.value = briefing.suggestedAssignee || sequence.owner || 'Workspace operator';
    }

    const aiSteps = Array.isArray(sequence.steps) && sequence.steps.length
      ? sequence.steps
      : [
          'Acknowledge the thread and reflect the customer goal.',
          normalizedVariant === 'whatsapp'
            ? 'Send a short follow-up with one clear CTA.'
            : 'Send a fuller recap with the strongest value point and CTA.',
          'Escalate or assign the thread if there is no reply in the planned follow-up window.'
        ];
    renderSequenceStepEditorRows(aiSteps);

    if (sequenceStepsInput) {
      sequenceStepsInput.value = String(aiSteps.length);
    }
    if (sequenceNotesInput) {
      const noteParts = [
        briefing.summary || '',
        briefing.handoffReason || '',
        briefing.leadScoreReason || ''
      ].filter(Boolean);
      sequenceNotesInput.value = noteParts.join('\n\n');
    }
    if (sequenceRepliesInput && !String(sequenceRepliesInput.value || '').trim()) {
      sequenceRepliesInput.value = normalizedVariant === 'whatsapp' ? '18%' : '12%';
    }
    if (sequenceDeliveriesInput && !String(sequenceDeliveriesInput.value || '').trim()) {
      sequenceDeliveriesInput.value = normalizedVariant === 'email' ? '96%' : '99%';
    }
    if (sequenceNextRunInput && !String(sequenceNextRunInput.value || '').trim()) {
      sequenceNextRunInput.value = briefing.followUpTiming || 'Today, 4:00 PM';
    }
    if (sequenceTemplateStatus) {
      sequenceTemplateStatus.textContent = normalizedVariant === 'whatsapp'
        ? 'WhatsApp-first variants should stay template-backed once the live thread cools down.'
        : normalizedVariant === 'email'
          ? 'Email-first variants can stay free-form while WhatsApp remains optional.'
          : 'Auto mode will keep the WhatsApp path flexible until the policy window closes.';
    }
    if (sequenceEditorTitle) {
      sequenceEditorTitle.textContent = sequenceNameInput?.value?.trim() || 'AI follow-up sequence';
    }
    if (sequenceStatusNote) {
      sequenceStatusNote.textContent = `AI loaded a ${normalizedVariant === 'default' ? 'multi-channel' : normalizedVariant} follow-up plan into the sequence editor.`;
    }

    toast(`AI ${normalizedVariant === 'default' ? 'sequence' : normalizedVariant} plan loaded.`);
  }

  async function saveChannelReadiness(providerKey = '') {
    assertPermission('connectChannels', 'Your role cannot update channel readiness.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    const key = String(providerKey || '').trim().toLowerCase();
    if (!key) {
      throw new Error('Choose a provider first.');
    }

    const card = providerGrid?.querySelector(`[data-channel-status="${key}"]`)?.closest('.integration-card');
    const statusNode = card?.querySelector(`[data-channel-status="${key}"]`);
    const noteNode = card?.querySelector(`[data-channel-note="${key}"]`);
    const status = statusNode?.value?.trim() || 'configured';
    const note = noteNode?.value?.trim() || '';
    const existingChannel = Array.isArray(auth.snapshot?.channels)
      ? auth.snapshot.channels.find((item) => String(item.provider || '').toLowerCase() === key)
      : null;

    const payload = {
      workspace_id: auth.workspaceId,
      provider: key,
      channel_type: existingChannel?.channel_type || (key === 'gmail' ? 'email' : key),
      display_name: existingChannel?.display_name || key.toUpperCase(),
      status,
      provider_account_id: existingChannel?.provider_account_id || '',
      connection_state: status === 'live' ? 'verified' : status === 'paused' ? 'stale' : status === 'needs_review' ? 'needs_review' : 'connecting',
      webhook_state: status === 'live' ? 'connected' : status === 'paused' ? 'stale' : 'unknown',
      token_health: {
        ...(existingChannel?.token_health || {}),
        provider: key,
        status: status === 'live' ? 'healthy' : status === 'paused' ? 'stale' : 'unknown'
      },
      external_metadata: {
        ...(existingChannel?.external_metadata || {}),
        readiness_note: note,
        saved_at: new Date().toISOString()
      }
    };

    try {
      if (existingChannel?.id) {
        await backendService.updateChannel(existingChannel.id, payload);
      } else {
        await backendService.createChannel(auth.workspaceId, payload);
      }
    } catch (error) {
      console.warn('Backend channel readiness save failed.', error);
      throw error;
    }

    await refreshWorkspaceData();
    toast(`${key.toUpperCase()} readiness saved.`);
  }

  async function setConversationState(state) {
    if (!auth.workspaceId || !auth.selectedConversationId) {
      throw new Error('Select a conversation first.');
    }

    const normalized = String(state || '').toLowerCase();
    if (!['closed', 'open'].includes(normalized)) {
      throw new Error('Invalid conversation state.');
    }

    try {
      await backendService.updateConversation(auth.selectedConversationId, {
        status: normalized,
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
      });
      await backendService.createActivityEvent(auth.workspaceId, {
        entity_type: 'conversation',
        entity_id: auth.selectedConversationId,
        event_type: normalized === 'closed' ? 'conversation_closed' : 'conversation_reopened',
        payload: {
          status: normalized
        }
      });
    } catch (error) {
      console.warn('Backend conversation state update failed.', error);
      throw error;
    }

    await refreshWorkspaceData();
    setStatus(mergeStatus, normalized === 'closed' ? 'Conversation marked resolved.' : 'Conversation reopened.');
    toast(normalized === 'closed' ? 'Conversation resolved.' : 'Conversation reopened.');
  }

  async function syncConfiguredChannels() {
    assertPermission('connectChannels', 'Your role cannot sync configured channels.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }
    if (!providerReadiness.length) {
      throw new Error('Provider readiness has not loaded yet.');
    }

    const configuredProviders = providerReadiness
      .filter((provider) => provider.configured)
      .map((provider) => ({
        provider: provider.provider,
        channelType: provider.channelType,
        label: provider.label,
        externalAccountId: provider.externalAccountId || '',
        connectionId:
          provider.connectionId ||
          provider.connection_id ||
          provider.externalMetadata?.relay_setup?.connection_id ||
          provider.externalMetadata?.connection_id ||
          '',
        missing: provider.missing || [],
        rolloutPriority: provider.rolloutPriority || null
      }));

    try {
      await backendService.syncChannels(auth.workspaceId, {
        providers: configuredProviders,
        workspaceId: auth.workspaceId,
        source: 'deploy-panel'
      });
    } catch (error) {
      console.warn('Backend channel sync failed.', error);
      throw error;
    }

    await refreshWorkspaceData();
    toast('Configured channels synced into workspace.');
  }

  async function saveAgentConfig() {
    assertPermission('manageAgents', 'Your role cannot edit the agent configuration.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }
    const name = agentNameInput?.value?.trim() || 'Northstar Support Agent';
    const tone = agentToneInput?.value?.trim() || 'balanced';
    const statusValue = agentStatusInput?.value?.trim() || 'active';
    const instructions = agentInstructionsInput?.value?.trim() || '';
    const knowledgeSources = (agentSourcesInput?.value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const existingAgent = (auth.snapshot?.agents || [])[0];
    const channelProviders = providerReadiness.filter((item) => item.configured).map((item) => item.provider);

    if (existingAgent?.id) {
      try {
        await backendService.updateAgent(existingAgent.id, {
          name,
          tone,
          status: statusValue,
          instructions,
          knowledge_sources: knowledgeSources,
          channel_config: { providers: channelProviders }
        });
      } catch (error) {
        console.warn('Backend agent update failed.', error);
        throw error;
      }
    } else {
      try {
        await backendService.createAgent(auth.workspaceId, {
          name,
          tone,
          status: statusValue,
          instructions,
          knowledge_sources: knowledgeSources,
          channel_config: { providers: channelProviders }
        });
      } catch (error) {
        console.warn('Backend agent create failed.', error);
        throw error;
      }
    }

    await refreshWorkspaceData();
    setAgentStatus('Agent config saved to the workspace backend.');
    toast('Agent configuration saved.');
  }

  async function searchWorkspace(query = '') {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    const normalizedQuery = String(query || searchInput?.value || '').trim();
    if (!normalizedQuery) {
      throw new Error('Enter a search query first.');
    }

    if (searchStatus) {
      searchStatus.textContent = `Searching workspace for "${normalizedQuery}"...`;
    }

    let data = null;
    try {
      data = await backendService.searchWorkspace(auth.workspaceId, normalizedQuery);
    } catch (error) {
      console.warn('Backend search failed, falling back to local workspace search.', error);
      data = {
        results: buildLocalWorkspaceSearchResults(normalizedQuery)
      };
    }
    auth.searchQuery = normalizedQuery;
    auth.searchResults = data?.results || {};
    if (typeof saveAppState === 'function') {
      saveAppState({ searchQuery: normalizedQuery });
    }

    if (searchInput) {
      searchInput.value = normalizedQuery;
    }
    if (searchResults) {
      searchResults.innerHTML = renderWorkspaceSearchResults(auth.searchResults, normalizedQuery);
    }
    if (searchSection) {
      searchSection.hidden = false;
    }
    if (searchStatus) {
      const counts = auth.searchResults
        ? [
            `Contacts: ${Array.isArray(auth.searchResults.contacts) ? auth.searchResults.contacts.length : 0}`,
            `Conversations: ${Array.isArray(auth.searchResults.conversations) ? auth.searchResults.conversations.length : 0}`,
            `Messages: ${Array.isArray(auth.searchResults.messages) ? auth.searchResults.messages.length : 0}`,
            `Activity: ${Array.isArray(auth.searchResults.activityEvents) ? auth.searchResults.activityEvents.length : 0}`
          ].join(' • ')
        : 'No results returned.';
      searchStatus.textContent = counts;
    }

    toast(`Search completed for "${normalizedQuery}".`);
  }

  function clearWorkspaceSearch() {
    auth.searchQuery = '';
    auth.searchResults = null;
    if (typeof saveAppState === 'function') {
      saveAppState({ searchQuery: '' });
    }
    if (searchInput) {
      searchInput.value = '';
    }
    if (searchResults) {
      searchResults.innerHTML = '<div class="mini-status muted">Enter a query above to search the workspace.</div>';
    }
    if (searchStatus) {
      searchStatus.textContent = 'Search the workspace to surface contacts, conversations, messages, and activity.';
    }
    if (searchSection) {
      searchSection.hidden = true;
    }
    toast('Search cleared.');
  }

  function buildLocalWorkspaceSearchResults(query = '') {
    const normalized = String(query || '').trim().toLowerCase();
    const snapshot = auth.snapshot || {};
    const includes = (value) => String(value || '').toLowerCase().includes(normalized);
    const contactIds = new Set();

    const contacts = (Array.isArray(snapshot.contacts) ? snapshot.contacts : []).filter((item) => {
      const match = includes(item.name) || includes(item.email) || includes(item.phone) || includes(item.company)
        || (Array.isArray(item.tags) && item.tags.some((tag) => includes(tag)));
      if (match && item.id) contactIds.add(item.id);
      return match;
    });

    const conversations = (Array.isArray(snapshot.conversations) ? snapshot.conversations : []).filter((item) => {
      const match = includes(item.subject) || includes(item.summary) || includes(item.status) || includes(item.source)
        || includes(item.priority) || includes(item.assigned_to) || (item.contact_id && contactIds.has(item.contact_id));
      return match;
    });

    const conversationIds = new Set(conversations.map((item) => item.id).filter(Boolean));

    const messages = (Array.isArray(snapshot.messages) ? snapshot.messages : []).filter((item) => {
      const raw = item.raw_payload || item.rawPayload || {};
      return includes(item.body) || includes(item.sender_name) || includes(item.direction)
        || includes(raw.body) || includes(raw.text?.body) || includes(raw.message)
        || (item.conversation_id && conversationIds.has(item.conversation_id));
    });

    const activityEvents = (Array.isArray(snapshot.activityEvents) ? snapshot.activityEvents : []).filter((item) => {
      return includes(item.event_type) || includes(item.payload?.note) || includes(item.payload?.status)
        || includes(item.payload?.assigned_to) || includes(item.payload?.choiceLabel);
    });

    return { contacts, conversations, messages, activityEvents };
  }

  async function refreshSyncJobs() {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    if (syncJobsStatus) {
      syncJobsStatus.textContent = 'Loading sync jobs...';
    }

    const jobs = await backendService.listSyncJobs(auth.workspaceId);
    const list = Array.isArray(jobs) ? jobs : Array.isArray(jobs?.jobs) ? jobs.jobs : Array.isArray(jobs?.data) ? jobs.data : [];
    auth.syncJobs = list;

    if (syncJobsList) {
      syncJobsList.innerHTML = renderSyncJobsList(list);
    }
    if (syncJobsStatus) {
      const counts = list.reduce((acc, item) => {
        const status = String(item.status || 'queued').toLowerCase();
        acc[status] = Number(acc[status] || 0) + 1;
        return acc;
      }, {});
      syncJobsStatus.textContent = list.length
        ? `${list.length} sync jobs loaded: ${Number(counts.queued || 0)} queued, ${Number(counts.retrying || 0)} retrying, ${Number(counts.failed || 0)} failed.`
        : 'No sync jobs returned from the backend.';
    }

    toast('Sync jobs refreshed.');
  }

  async function refreshWorkflowQueue() {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    if (workflowQueueStatus) {
      workflowQueueStatus.textContent = 'Loading workflow queue...';
    }

    const jobs = await backendService.listSyncJobs(auth.workspaceId);
    const list = Array.isArray(jobs) ? jobs : Array.isArray(jobs?.jobs) ? jobs.jobs : Array.isArray(jobs?.data) ? jobs.data : [];
    const workflowJobs = list.filter((item) => String(item.type || '').startsWith('workflow.'));
    auth.workflowQueue = workflowJobs;

    if (workflowQueueList) {
      workflowQueueList.innerHTML = renderWorkflowQueueList(workflowJobs);
    }
    if (workflowQueueStatus) {
      const counts = workflowJobs.reduce((acc, item) => {
        const status = String(item.status || 'queued').toLowerCase();
        acc[status] = Number(acc[status] || 0) + 1;
        return acc;
      }, {});
      workflowQueueStatus.textContent = workflowJobs.length
        ? `${workflowJobs.length} workflow jobs ready: ${Number(counts.queued || 0)} queued, ${Number(counts.assigned || 0)} assigned, ${Number(counts.escalated || 0)} escalated.`
        : 'No workflow jobs returned from the backend.';
    }

    return workflowJobs;
  }

  async function refreshReliabilityPanel() {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    if (reliabilityStatus) {
      reliabilityStatus.textContent = 'Loading reliability diagnostics...';
    }

    let data;
    try {
      data = await backendService.getWorkspaceReliability(auth.workspaceId);
    } catch (error) {
      const jobs = Array.isArray(auth.syncJobs) ? auth.syncJobs : [];
      const jobCounts = jobs.reduce((acc, job) => {
        const status = String(job.status || 'queued').toLowerCase();
        acc.total += 1;
        if (status === 'queued') acc.queued += 1;
        else if (status === 'retrying') acc.retrying += 1;
        else if (status === 'failed') acc.failed += 1;
        else if (status === 'completed') acc.completed += 1;
        else if (status === 'escalated') acc.escalated += 1;
        else if (status === 'assigned') acc.assigned += 1;
        return acc;
      }, { total: 0, queued: 0, retrying: 0, failed: 0, completed: 0, escalated: 0, assigned: 0 });
      data = {
        summary: {
          jobCounts,
          replayCounts: {
            accepted: 0,
            suppressed: 0,
            total: 0,
            latest_at: ''
          },
          hasRetryingJobs: jobCounts.retrying > 0,
          hasFailedJobs: jobCounts.failed > 0
        },
        recentFailures: jobs.filter((item) => ['retrying', 'failed'].includes(String(item.status || '').toLowerCase())).slice(0, 8),
        recentReplays: [],
        fallback: true,
        error: error?.message || 'Failed to load reliability diagnostics.'
      };
    }
    auth.reliability = data;

    if (reliabilityPanel) {
      reliabilityPanel.innerHTML = renderReliabilityPanel(data);
    }
    if (reliabilityStatus) {
      const retryingJobs = Number(data?.summary?.jobCounts?.retrying || 0);
      const queuedJobs = Number(data?.summary?.jobCounts?.queued || 0);
      const suppressed = Number(data?.summary?.replayCounts?.suppressed || 0);
      reliabilityStatus.textContent = data?.fallback
        ? `${queuedJobs} queued jobs and ${retryingJobs} retrying jobs are visible from local state. Reliability endpoint fallback loaded.`
        : `${queuedJobs} queued jobs, ${retryingJobs} retrying jobs, and ${suppressed} suppressed duplicates are being tracked.`;
    }

    toast('Reliability diagnostics refreshed.');
    return data;
  }

  async function retryWebhookReplay(replayKey = '') {
    assertPermission('retryReliability', 'Your role cannot retry webhook replay items.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    const normalizedReplayKey = String(replayKey || '').trim();
    if (!normalizedReplayKey) {
      throw new Error('Choose a replay entry first.');
    }

    if (reliabilityStatus) {
      reliabilityStatus.textContent = 'Retrying webhook replay...';
    }

    await backendService.retryWebhookReplay(auth.workspaceId, normalizedReplayKey);
    await refreshWorkspaceData();
    await refreshReliabilityPanel().catch((error) => {
      console.warn('Reliability panel refresh after replay retry failed.', error);
    });
    toast('Webhook replay retried.');
  }

  async function updateWorkflowJobRecord({ jobId = '', status = 'assigned', assignee = '', note = '' } = {}) {
    assertPermission('manageWorkflows', 'Your role cannot update workflow jobs.');
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }

    const normalizedJobId = String(jobId || '').trim();
    if (!normalizedJobId) {
      throw new Error('Select a workflow job first.');
    }

    if (workflowQueueStatus) {
      workflowQueueStatus.textContent = 'Updating workflow job...';
    }

    const job = await backendService.updateSyncJob(auth.workspaceId, normalizedJobId, {
      status,
      assigned_to: assignee,
      note,
      retry: status === 'retrying'
    });

    await refreshWorkflowQueue();
    toast(`Workflow job ${String(status || 'updated').toLowerCase()}.`);
    return job;
  }

  function resetBusinessKnowledgeForm() {
    if (businessKnowledgeIdInput) businessKnowledgeIdInput.value = '';
    if (businessKnowledgeTopicInput) businessKnowledgeTopicInput.value = '';
    if (businessKnowledgeQuestionInput) businessKnowledgeQuestionInput.value = '';
    if (businessKnowledgeAnswerInput) businessKnowledgeAnswerInput.value = '';
    if (businessKnowledgeTagsInput) businessKnowledgeTagsInput.value = '';
    if (businessKnowledgePriorityInput) businessKnowledgePriorityInput.value = '50';
    if (businessKnowledgeStatus) {
      businessKnowledgeStatus.textContent = 'Ready to add a new business knowledge entry.';
    }
  }

  function findBusinessKnowledgeEntry(entryId = '') {
    const entries = Array.isArray(auth.snapshot?.businessKnowledge) ? auth.snapshot.businessKnowledge : [];
    return entries.find((item) => String(item.id || '') === String(entryId || '').trim());
  }

  async function loadBusinessKnowledgeRecord(entryId = '') {
    const entry = findBusinessKnowledgeEntry(entryId);
    if (!entry) {
      throw new Error('Business knowledge entry not found.');
    }
    if (businessKnowledgeIdInput) businessKnowledgeIdInput.value = entry.id || '';
    if (businessKnowledgeTopicInput) businessKnowledgeTopicInput.value = entry.topic || '';
    if (businessKnowledgeQuestionInput) businessKnowledgeQuestionInput.value = entry.question || '';
    if (businessKnowledgeAnswerInput) businessKnowledgeAnswerInput.value = entry.answer || '';
    if (businessKnowledgeTagsInput) businessKnowledgeTagsInput.value = Array.isArray(entry.tags) ? entry.tags.join(', ') : '';
    if (businessKnowledgePriorityInput) businessKnowledgePriorityInput.value = String(entry.priority ?? 50);
    if (businessKnowledgeStatus) {
      businessKnowledgeStatus.textContent = `Loaded "${entry.topic || entry.question || 'entry'}" for editing.`;
    }
  }

  async function saveBusinessKnowledgeRecord() {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }
    const topic = String(businessKnowledgeTopicInput?.value || '').trim();
    const question = String(businessKnowledgeQuestionInput?.value || '').trim();
    const answer = String(businessKnowledgeAnswerInput?.value || '').trim();
    if (!topic || !question || !answer) {
      throw new Error('Topic, question pattern, and answer are required.');
    }

    const tags = String(businessKnowledgeTagsInput?.value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const priority = Number(businessKnowledgePriorityInput?.value || 50);
    const id = String(businessKnowledgeIdInput?.value || '').trim();

    await saveBusinessKnowledgeEntry({
      workspaceId: auth.workspaceId,
      id,
      topic,
      question,
      answer,
      tags,
      priority,
      isActive: true
    });

    await refreshWorkspaceData();
    resetBusinessKnowledgeForm();
    toast(id ? 'Business knowledge updated.' : 'Business knowledge saved.');
  }

  async function deleteBusinessKnowledgeRecord(entryId = '') {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }
    const id = String(entryId || businessKnowledgeIdInput?.value || '').trim();
    if (!id) {
      throw new Error('Choose an entry to delete first.');
    }
    await deleteBusinessKnowledgeEntry({
      workspaceId: auth.workspaceId,
      id
    });
    await refreshWorkspaceData();
    resetBusinessKnowledgeForm();
    toast('Business knowledge deleted.');
  }

  async function backfillContactPhoneHealth() {
    if (!auth.workspaceId) {
      throw new Error('Load a workspace first.');
    }
    setStatus(contactHealthBackfillStatus, 'Running Twilio Lookup across existing contacts...');
    const summary = await backendService.backfillContactPhoneHealth(auth.workspaceId);
    await refreshWorkspaceData();
    const enriched = Number(summary?.enriched || 0);
    const unchanged = Number(summary?.unchanged || 0);
    const skipped = Number(summary?.skippedMissingPhone || 0);
    const failed = Number(summary?.failed || 0);
    setStatus(
      contactHealthBackfillStatus,
      `Backfill finished: ${enriched} enriched, ${unchanged} already current, ${skipped} without phone, ${failed} failed.`
    );
    toast(`Contact health updated for ${enriched} contact${enriched === 1 ? '' : 's'}.`);
    return summary;
  }

  async function startSoftphoneCall() {
    assertPermission('sendReplies', 'Your role cannot place calls from this workspace.');
    const selectedConversation = Array.isArray(auth.snapshot?.conversations)
      ? auth.snapshot.conversations.find((item) => item.id === auth.selectedConversationId)
      : null;
    if (!auth.workspaceId || !selectedConversation) {
      throw new Error('Select a conversation first.');
    }

    const selectedContact = selectedConversation?.contact_id && Array.isArray(auth.snapshot?.contacts)
      ? auth.snapshot.contacts.find((item) => item.id === selectedConversation.contact_id)
      : null;
    const destinationPhone = String(
      selectedConversation?.recipient_phone
      || selectedConversation?.recipientPhone
      || selectedContact?.phone
      || ''
    ).trim();
    if (!destinationPhone) {
      throw new Error('This thread does not have a phone number yet.');
    }

    setSoftphoneUi({
      status: 'Authorizing softphone...',
      badge: 'Auth',
      identity: 'Requesting token',
      session: 'Pending',
      callState: 'Preparing',
      note: 'AuraFlow is minting a Twilio Voice access token for this browser session.'
    });

    const tokenResult = await backendService.createTwilioVoiceToken({
      workspaceId: auth.workspaceId,
      user: auth.user || {},
      role: auth.workspaceRole || ''
    });

    auth.softphone = {
      ...(auth.softphone || {}),
      token: tokenResult?.token || '',
      identity: tokenResult?.identity || 'softphone',
      expiresAt: tokenResult?.expiresAt || '',
      liveMood: 'neutral',
      transcriptSegments: [],
      suggestedFollowup: ''
    };

    setSoftphoneUi({
      status: 'Softphone token created. Registering Twilio device...',
      badge: 'Auth',
      identity: auth.softphone.identity,
      session: 'Creating',
      callState: 'Preparing',
      note: tokenResult?.expiresAt
        ? `Voice token ready until ${tokenResult.expiresAt}. Browser microphone permission will be requested before the call starts.`
        : 'Voice token ready. Browser microphone permission will be requested before the call starts.'
    });

    await softphoneClient.register(tokenResult?.token || '', auth.softphone.identity);

    const callResult = await backendService.startSoftphoneCall({
      workspaceId: auth.workspaceId,
      conversationId: selectedConversation.id,
      contactId: selectedContact?.id || null,
      contactName: selectedContact?.name || selectedConversation?.subject || 'Lead',
      to: destinationPhone,
      identity: auth.softphone.identity,
      simulateLocalProgress: false
    });

    const voiceSession = callResult?.session || null;
    auth.softphone = {
      ...(auth.softphone || {}),
      sessionId: voiceSession?.id || '',
      conversationId: selectedConversation.id,
      contactName: selectedContact?.name || selectedConversation?.subject || 'Lead',
      callState: 'dialing',
      relayUrl: callResult?.relayUrl || '',
      sessionMetadata: voiceSession?.analysis_metadata || {},
      finalized: false
    };

    setSoftphoneUi({
      status: 'Dialing lead from the Twilio browser device...',
      badge: 'Dialing',
      identity: auth.softphone.identity,
      session: voiceSession?.id || 'Pending',
      callState: 'Dialing',
      note: `${selectedContact?.name || 'Lead'} is being dialed from the browser softphone. AuraFlow already linked the session to Supabase voice_sessions.${auth.softphone.relayUrl ? ' Media relay URL is ready for Deepgram streaming.' : ''}`
    });

    await refreshWorkspaceData().catch(() => null);
    syncSoftphoneSessionFromSnapshot();
    startSoftphoneSnapshotPolling();
    await softphoneClient.startCall({
      To: destinationPhone,
      workspaceId: auth.workspaceId,
      conversationId: selectedConversation.id,
      contactId: selectedContact?.id || '',
      voiceSessionId: voiceSession?.id || ''
    });

    toast('Softphone call bootstrap started.');
    return callResult;
  }

  async function endSoftphoneCall() {
    const sessionId = String(auth.softphone?.sessionId || '').trim();
    if (!sessionId) {
      throw new Error('No live softphone session is active right now.');
    }

    stopSoftphoneSnapshotPolling();
    await softphoneClient.hangup().catch(() => null);
    await backendService.updateVoiceSession(sessionId, {
      status: 'completed',
      outcome: 'agent_ended',
      updated_at: new Date().toISOString(),
      analysis_metadata: {
        ...(auth.softphone?.sessionMetadata || {}),
        call_state: 'completed',
        ended_at: new Date().toISOString(),
        softphone_identity: auth.softphone?.identity || null,
        source: 'softphone_bootstrap',
        transport: 'twilio_voice_sdk_browser',
        relay_url: auth.softphone?.relayUrl || null
      }
    });

    auth.softphone = {
      ...(auth.softphone || {}),
      callState: 'completed'
    };

    setSoftphoneUi({
      status: 'Call ended.',
      badge: 'Ended',
      identity: auth.softphone?.identity || 'softphone',
      session: sessionId,
      callState: 'Completed',
      note: 'The voice session has been closed locally and remains linked in Supabase for the next Deepgram phase.'
    });
    await refreshWorkspaceData().catch(() => null);
    syncSoftphoneSessionFromSnapshot();
    await finalizeSoftphoneCallArtifacts().catch((error) => {
      console.warn('Softphone finalization failed.', error);
    });
    toast('Softphone call ended.');
  }

  return {
    generateAiBriefing,
    generateAiAssist,
    generateAiReplyDraft,
    applyAiSequenceSuggestion,
    saveOutboundReply,
    sendReplyRecord,
    queueReplyRecord,
    retryLastReply,
    retryFailedWhatsAppQueue,
    openProviderConnect,
    seedProviderThread,
    testGmailWebhookRelay,
    testWhatsAppWebhookRelay,
    createVoiceProfileRecord,
    queueVoiceCallRecord,
    saveVoiceNoteRecord,
    analyzeVoiceNoteRecord,
    assignConversationRecord,
    saveInternalNoteRecord,
    mergeContactRecord,
    saveContactTagsRecord,
      backfillContactPhoneHealth,
      startSoftphoneCall,
      endSoftphoneCall,
      saveSoftphoneSummary,
      ingestSoftphoneRelayEvent,
      setConversationState,
    saveFollowUpSequenceRecord,
    saveChannelReadiness,
    syncConfiguredChannels,
    saveAgentConfig,
    searchWorkspace,
    clearWorkspaceSearch,
    refreshSyncJobs,
    refreshWorkflowQueue,
    refreshReliabilityPanel,
    retryWebhookReplay,
    resetProviderRelaySetup,
    updateWorkflowJobRecord,
    createAiWorkflowJob,
    saveBusinessKnowledgeRecord,
    loadBusinessKnowledgeRecord,
    deleteBusinessKnowledgeRecord,
    resetBusinessKnowledgeForm
  };
}
