import { createSupabaseClient } from '../integrations/supabase-browser.js';
import { clearWorkspaceContext, getAuthState, saveAccessToken, saveRefreshToken, saveWorkspaceContext } from '../integrations/auth.js';
      import { loadAppState, normalizeThemePreference, saveAppState, setRouteScreen, readRouteScreen } from '../state/app-state.js';
      import { escapeHtml, initials, formatCurrency, formatRelativeDate, formatDurationFromMinutes, toneFromPriority } from '../ui/formatters.js';
import { createAuthWorkspaceController } from '../controllers/auth-workspace.js';
import * as ui from '../ui/preview-renderers.js';
import { setShellVisible as setShellVisibleUi, updateWorkspacePicker as updateWorkspacePickerUi } from '../ui/shell.js';
import { SCREEN_META, DEFAULT_SCREEN, isValidScreen } from '../routing/screens.js';
import { createRuntimeView } from '../ui/runtime-view.js';
import { buildDemoIngestPayload } from '../integrations/provider-seeds.js';
import { bindPreviewEvents } from '../controllers/preview-events.js';
import { createPreviewActions } from '../controllers/preview-actions.js';
import { createBackendService } from '../services/backend-service.js';
import { renderPreviewLayout } from '../ui/preview-layout.js';
import { describeWorkspaceRole, getWorkspacePermissions } from '../state/permissions.js';

      document.body.innerHTML = renderPreviewLayout();

      const authOverlay = document.querySelector('[data-auth-overlay]');
      const authForm = document.querySelector('[data-auth-form]');
      const authStatus = document.querySelector('[data-auth-status]');
      const workspaceList = document.querySelector('[data-workspace-list]');
      const createWorkspaceButton = document.querySelector('[data-create-workspace]');
      const appShell = document.querySelector('.app-shell');
      const nav = document.querySelector('.sidebar');
      const backdrop = document.querySelector('[data-modal]');
      const toastStack = document.querySelector('.toast-stack');
      const title = document.querySelector('h1');
      const lead = document.querySelector('.lead');
      const runtimeBadge = document.querySelector('[data-runtime-badge]');
      const supabaseState = document.querySelector('[data-supabase-state]');
      const nangoState = document.querySelector('[data-nango-state]');
      const workspaceTitle = document.querySelector('.sidebar .workspace-switcher strong');
      const workspacePill = document.querySelector('[data-runtime-badge]');
      const menu = document.querySelector('[data-open-nav]');
      const closeNavButtons = document.querySelectorAll('[data-close-nav]');
      const actionButtons = document.querySelectorAll('[data-action]');
      const closeModalButtons = document.querySelectorAll('[data-close-modal]');
      const navItems = document.querySelectorAll('[data-screen]');
      const sections = new Map(
        [...document.querySelectorAll('[data-section]')].map((node) => [node.dataset.section, node])
      );
      const metrics = new Map(
        [...document.querySelectorAll('[data-metric]')].map((node) => [node.dataset.metric, node])
      );
      const metricLabels = new Map(
        [...document.querySelectorAll('[data-metric-label]')].map((node) => [node.dataset.metricLabel, node])
      );
      const metricDetails = new Map(
        [...document.querySelectorAll('[data-metric-detail]')].map((node) => [node.dataset.metricDetail, node])
      );
      const liveOps = new Map(
        [...document.querySelectorAll('[data-live-ops]')].map((node) => [node.dataset.liveOps, node])
      );
      const liveOpsDetails = new Map(
        [...document.querySelectorAll('[data-live-ops-detail]')].map((node) => [node.dataset.liveOpsDetail, node])
      );
      const voiceMetrics = new Map(
        [...document.querySelectorAll('[data-voice-metric]')].map((node) => [node.dataset.voiceMetric, node])
      );
      const searchForm = document.querySelector('[data-search-form]');
      const searchInput = document.querySelector('[data-search-input]');
      const searchResults = document.querySelector('[data-search-results]');
      const searchStatus = document.querySelector('[data-search-status]');
      const searchSection = document.querySelector('[data-search-section]');
      const homeLeadsWeek = document.querySelector('[data-home-leads-week]');
      const homeLeadsDetail = document.querySelector('[data-home-leads-detail]');
      const homeAiSent = document.querySelector('[data-home-ai-sent]');
      const homeAiDetail = document.querySelector('[data-home-ai-detail]');
      const homeChannelHealth = document.querySelector('[data-home-channel-health]');
      const homeChannelDetail = document.querySelector('[data-home-channel-detail]');
      const homeSummaryCopy = document.querySelector('[data-home-summary-copy]');
      const homeNextStep = document.querySelector('[data-home-next-step]');
      const homeHealthBadge = document.querySelector('[data-home-health-badge]');
      const homeHighlights = document.querySelector('[data-home-highlights]');
      const inboxFilters = document.querySelector('[data-inbox-filters]');
      const inboxListStatus = document.querySelector('[data-inbox-list-status]');
      const voiceProfilesList = document.querySelector('[data-voice-profiles-list]');
      const voiceSessionsList = document.querySelector('[data-voice-sessions-list]');
      const voiceNotesList = document.querySelector('[data-voice-notes-list]');
      const voiceAnalyticsBrief = document.querySelector('[data-voice-analytics-brief]');
      const voiceAnalyticsStatus = document.querySelector('[data-voice-analytics-status]');
      const voiceProfileNameInput = document.querySelector('[data-voice-profile-name]');
      const voiceProfileLabelInput = document.querySelector('[data-voice-profile-label]');
      const voiceProfileSourceInput = document.querySelector('[data-voice-profile-source]');
      const voiceProfileStyleInput = document.querySelector('[data-voice-profile-style]');
      const voiceSessionContactSelect = document.querySelector('[data-voice-session-contact]');
      const voiceSessionProfileSelect = document.querySelector('[data-voice-session-profile]');
      const voiceSessionStatusInput = document.querySelector('[data-voice-session-status]');
      const voiceSessionDisclosureInput = document.querySelector('[data-voice-session-disclosure]');
      const voiceNoteContactSelect = document.querySelector('[data-voice-note-contact]');
      const voiceNoteProfileSelect = document.querySelector('[data-voice-note-profile]');
      const voiceNoteSessionSelect = document.querySelector('[data-voice-note-session]');
      const voiceNoteTitleInput = document.querySelector('[data-voice-note-title]');
      const voiceNoteAudioUrlInput = document.querySelector('[data-voice-note-audio-url]');
      const voiceNoteBodyInput = document.querySelector('[data-voice-note-body]');
      const businessKnowledgeList = document.querySelector('[data-business-knowledge-list]');
      const businessKnowledgeStatus = document.querySelector('[data-business-knowledge-status]');
      const businessKnowledgeIdInput = document.querySelector('[data-business-knowledge-id]');
      const businessKnowledgeTopicInput = document.querySelector('[data-business-knowledge-topic]');
      const businessKnowledgeQuestionInput = document.querySelector('[data-business-knowledge-question]');
      const businessKnowledgeAnswerInput = document.querySelector('[data-business-knowledge-answer]');
      const businessKnowledgeTagsInput = document.querySelector('[data-business-knowledge-tags]');
      const businessKnowledgePriorityInput = document.querySelector('[data-business-knowledge-priority]');
      const sequenceIdInput = document.querySelector('[data-sequence-id]');
      const sequenceNameInput = document.querySelector('[data-sequence-name]');
      const sequenceStatusInput = document.querySelector('[data-sequence-status]');
      const sequenceTriggerInput = document.querySelector('[data-sequence-trigger]');
      const sequenceChannelInput = document.querySelector('[data-sequence-channel]');
      const sequenceTemplateModeInput = document.querySelector('[data-sequence-template-mode]');
      const sequenceGoalInput = document.querySelector('[data-sequence-goal]');
      const sequenceOwnerInput = document.querySelector('[data-sequence-owner]');
      const sequenceStepsInput = document.querySelector('[data-sequence-steps]');
      const sequenceRepliesInput = document.querySelector('[data-sequence-replies]');
      const sequenceDeliveriesInput = document.querySelector('[data-sequence-deliveries]');
      const sequenceNextRunInput = document.querySelector('[data-sequence-next-run]');
      const sequenceStepList = document.querySelector('[data-sequence-step-list]');
      const sequenceNotesInput = document.querySelector('[data-sequence-notes]');
      const sequenceEditorTitle = document.querySelector('[data-sequence-editor-title]');
      let sequenceDragIndex = -1;
      const sequenceStatusNote = document.querySelector('[data-sequence-status-note]');
      const sequenceTemplateStatus = document.querySelector('[data-sequence-template-status]');
      const aiStatus = document.querySelector('[data-ai-status]');
      const aiReplyOutput = document.querySelector('[data-ai-reply-output]');
      const replyTemplateModeInput = document.querySelector('[data-reply-template-mode]');
      const replyTemplateStatus = document.querySelector('[data-reply-template-status]');
      const sendReplyButton = document.querySelector('[data-action="send-reply"]');
      const softphoneStatus = document.querySelector('[data-softphone-status]');
      const softphoneStatusBadge = document.querySelector('[data-softphone-status-badge]');
      const softphoneIdentity = document.querySelector('[data-softphone-identity]');
      const softphoneSession = document.querySelector('[data-softphone-session]');
      const softphoneCallState = document.querySelector('[data-softphone-call-state]');
      const softphoneMoodBadge = document.querySelector('[data-softphone-mood-badge]');
      const softphoneTranscriptStatus = document.querySelector('[data-softphone-transcript-status]');
      const softphoneFollowupStatus = document.querySelector('[data-softphone-followup-status]');
      const softphoneTranscriptWindow = document.querySelector('[data-softphone-transcript-window]');
      const softphoneTranscriptEmpty = document.querySelector('[data-softphone-transcript-empty]');
      const softphoneTranscriptList = document.querySelector('[data-softphone-transcript-list]');
      const softphoneManualSummary = document.querySelector('[data-softphone-manual-summary]');
      const softphoneNote = document.querySelector('[data-softphone-note]');
      const aiSummary = document.querySelector('[data-ai-summary]');
      const aiClassification = document.querySelector('[data-ai-classification]');
      const aiNextAction = document.querySelector('[data-ai-next-action]');
      const aiRecommendation = document.querySelector('[data-ai-recommendation]');
      const aiOperatorLane = document.querySelector('[data-ai-operator-lane]');
      const replyTarget = document.querySelector('[data-reply-target]');
      const threadWorkflow = document.querySelector('[data-thread-workflow]');
      const replyStatus = document.querySelector('[data-reply-status]');
      const inboxCount = document.querySelector('[data-inbox-count]');
      const providerGrid = document.querySelector('[data-provider-grid]');
      const workspaceRole = document.querySelector('[data-workspace-role]');
      const permissionsPanel = document.querySelector('[data-permissions-panel]');
      const permissionsStatus = document.querySelector('[data-permissions-status]');
      const reliabilityPanel = document.querySelector('[data-reliability-panel]');
      const reliabilityStatus = document.querySelector('[data-reliability-status]');
      const webhookSetup = document.querySelector('[data-webhook-setup]');
      const workflowQueueList = document.querySelector('[data-workflow-queue-list]');
      const workflowQueueStatus = document.querySelector('[data-workflow-queue-status]');
      const workflowAssigneeInput = document.querySelector('[data-workflow-assignee]');
      const workflowNoteInput = document.querySelector('[data-workflow-note]');
      const syncJobsList = document.querySelector('[data-sync-jobs-list]');
      const syncJobsStatus = document.querySelector('[data-sync-jobs-status]');
      const ingestStatus = document.querySelector('[data-ingest-status]');
      const agentNameInput = document.querySelector('[data-agent-name]');
      const agentToneInput = document.querySelector('[data-agent-tone]');
      const agentSourcesInput = document.querySelector('[data-agent-sources]');
      const agentStatusInput = document.querySelector('[data-agent-status]');
      const agentInstructionsInput = document.querySelector('[data-agent-instructions]');
      const agentStatusNote = document.querySelector('[data-agent-status-note]');
      const agentSourceList = document.querySelector('[data-agent-source-list]');
      const agentGuardrails = document.querySelector('[data-agent-guardrails]');
      const selectedConversationTitle = document.querySelector('[data-selected-conversation-title]');
        const selectedConversationChannel = document.querySelector('[data-selected-conversation-channel]');
        const selectedConversationStatus = document.querySelector('[data-selected-conversation-status]');
        const selectedConversationOwner = document.querySelector('[data-selected-conversation-owner]');
        const selectedConversationUpdated = document.querySelector('[data-selected-conversation-updated]');
        const threadPrioritySummary = document.querySelector('[data-thread-priority-summary]');
        const conversationInsights = document.querySelector('[data-conversation-insights]');
      const replyGuidance = document.querySelector('[data-reply-guidance]');
      const messageThread = document.querySelector('[data-message-thread]');
      const assignmentInput = document.querySelector('[data-assignment-input]');
      const contactMergeTargetSelect = document.querySelector('[data-contact-merge-target]');
      const contactDetail = document.querySelector('[data-contact-detail]');
      const contactTagsList = document.querySelector('[data-contact-tags-list]');
      const contactTagInput = document.querySelector('[data-contact-tag-input]');
      const mergeStatus = document.querySelector('[data-merge-status]');
      const contactTagsStatus = document.querySelector('[data-contact-tags-status]');
      const internalNoteInput = document.querySelector('[data-internal-note-input]');
      const activityLog = document.querySelector('[data-activity-log]');
      const dashboardConversations = document.querySelector('[data-dashboard-conversations]');
      const contactsRows = document.querySelector('[data-contacts-rows]');
      const contactsCount = document.querySelector('[data-contacts-count]');
      const leadsRows = document.querySelector('[data-leads-rows]');
      const leadsCount = document.querySelector('[data-leads-count]');
      const leadsStatus = document.querySelector('[data-leads-status]');
      const welcomeTour = document.querySelector('[data-welcome-tour]');
      const welcomeTourBadge = document.querySelector('[data-welcome-tour-badge]');
      const welcomeTourCopy = document.querySelector('[data-welcome-tour-copy]');
      const connectionsList = document.querySelector('[data-connections-list]');
      const connectionsStatus = document.querySelector('[data-connections-status]');
      const connectionsCount = document.querySelector('[data-connections-count]');
      const templateHealthPanel = document.querySelector('[data-template-health-panel]');
      const templateHealthStatus = document.querySelector('[data-template-health-status]');
      const templateGalleryPanel = document.querySelector('[data-template-gallery-panel]');
      const templateGalleryStatus = document.querySelector('[data-template-gallery-status]');
      const contactHealthBackfillStatus = document.querySelector('[data-contact-health-backfill-status]');
      const opsReadinessPanel = document.querySelector('[data-ops-readiness-panel]');
      const opsReadinessStatus = document.querySelector('[data-ops-readiness-status]');
      const duplicateReviewPanel = document.querySelector('[data-duplicate-review-panel]');
      const duplicateReviewStatus = document.querySelector('[data-duplicate-review-status]');
      const duplicateReviewNote = document.querySelector('[data-duplicate-review-note]');
      const themeStatuses = [...document.querySelectorAll('[data-theme-status]')];
      const themeHelpNodes = [...document.querySelectorAll('[data-theme-help]')];
      const themeControls = [...document.querySelectorAll('[data-theme-controls]')];
      const supabaseClient = createSupabaseClient();
      const backendService = createBackendService();
      const setShellVisible = (visible) => setShellVisibleUi({ appShell, authOverlay }, visible);
      const updateWorkspacePicker = (workspaces) => updateWorkspacePickerUi(workspaceList, workspaces);

      const persistedUiState = loadAppState({ defaultScreen: DEFAULT_SCREEN });
      const oauthRedirectParams = new URLSearchParams(window.location.search);
      const oauthWorkspaceId = oauthRedirectParams.get('workspace_id') || '';
      if (oauthWorkspaceId) {
        saveWorkspaceContext({ workspaceId: oauthWorkspaceId });
      }
      const auth = {
        ready: false,
        loading: false,
        user: null,
        role: 'viewer',
        permissions: getWorkspacePermissions('viewer'),
        accessToken: getAuthState().accessToken,
        refreshToken: getAuthState().refreshToken,
        workspaceId: getAuthState().workspaceId,
        sessionEmail: getAuthState().sessionEmail,
        workspaces: [],
        snapshot: null,
        selectedConversationId: '',
        aiBriefing: persistedUiState.aiBriefing,
        inboxFilter: persistedUiState.inboxFilter || 'all',
        searchQuery: persistedUiState.searchQuery,
        searchResults: null,
        workflowQueue: [],
        reliability: null,
        onboarding: persistedUiState.onboarding || { dismissedWorkspaceIds: [] },
        themePreference: normalizeThemePreference(persistedUiState.themePreference),
        error: ''
      };
      const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const themeState = {
        preference: normalizeThemePreference(persistedUiState.themePreference),
        resolved: 'dark'
      };

      function resolveTheme(preference = themeState.preference) {
        return preference === 'system'
          ? (themeMediaQuery.matches ? 'dark' : 'light')
          : preference;
      }

      function syncThemeControls() {
        const activePreference = normalizeThemePreference(themeState.preference);
        themeControls.forEach((group) => {
          group.querySelectorAll('[data-theme-preference]').forEach((button) => {
            button.classList.toggle('active', button.dataset.themePreference === activePreference);
          });
        });
        themeStatuses.forEach((themeStatus) => {
          const label = activePreference === 'system'
            ? `System (${themeState.resolved})`
            : activePreference.replace(/^./, (char) => char.toUpperCase());
          themeStatus.textContent = label;
        });
        themeHelpNodes.forEach((themeHelp) => {
          themeHelp.textContent = activePreference === 'system'
            ? `System mode is active. AuraFlow is currently using the ${themeState.resolved} theme.`
            : `Theme preference saved. AuraFlow will reopen in ${activePreference} mode for this browser.`;
        });
      }

      function applyThemePreference(preference, { persist = true } = {}) {
        themeState.preference = normalizeThemePreference(preference);
        themeState.resolved = resolveTheme(themeState.preference);
        document.documentElement.dataset.theme = themeState.resolved;
        document.documentElement.style.colorScheme = themeState.resolved;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeState.resolved === 'light' ? '#ffffff' : '#8f2fff');
        auth.themePreference = themeState.preference;
        if (persist) {
          saveAppState({ themePreference: themeState.preference });
        }
        syncThemeControls();
      }

      const handleThemeMediaChange = () => {
        if (themeState.preference === 'system') {
          applyThemePreference('system', { persist: false });
        }
      };
      if (typeof themeMediaQuery.addEventListener === 'function') {
        themeMediaQuery.addEventListener('change', handleThemeMediaChange);
      } else if (typeof themeMediaQuery.addListener === 'function') {
        themeMediaQuery.addListener(handleThemeMediaChange);
      }
      let activeScreen = persistedUiState.screen;
      auth.selectedConversationId = persistedUiState.selectedConversationId;
      auth.selectedSequenceId = persistedUiState.selectedSequenceId;
      let providerReadiness = [];
      const runtimeView = createRuntimeView({
        auth,
        saveAppState,
        ui,
        nodes: {
          dashboardConversations,
          inboxCount,
          contactsRows,
          contactsCount,
          leadsRows,
          leadsCount,
          leadsStatus,
          welcomeTour,
            welcomeTourBadge,
            welcomeTourCopy,
            connectionsList,
            connectionsStatus,
            connectionsCount,
            voiceProfilesList,
            voiceSessionsList,
            voiceNotesList,
            voiceAnalyticsBrief,
            voiceAnalyticsStatus,
            providerGrid,
            reliabilityPanel,
            reliabilityStatus,
            workspaceRole,
            permissionsPanel,
            permissionsStatus,
            templateHealthPanel,
            templateHealthStatus,
            templateGalleryPanel,
            templateGalleryStatus,
            contactHealthBackfillStatus,
            opsReadinessPanel,
            opsReadinessStatus,
            duplicateReviewPanel,
            duplicateReviewStatus,
            duplicateReviewNote,
            webhookSetup,
          searchSection,
          searchResults,
          searchStatus,
            searchInput,
            homeLeadsWeek,
            homeLeadsDetail,
            homeAiSent,
            homeAiDetail,
            homeChannelHealth,
            homeChannelDetail,
            homeSummaryCopy,
            homeNextStep,
            homeHealthBadge,
            homeHighlights,
            inboxFilters,
            inboxListStatus,
          workflowQueueList,
          workflowQueueStatus,
          workflowAssigneeInput,
          workflowNoteInput,
          syncJobsList,
          syncJobsStatus,
            followUpList: document.querySelector('[data-followup-list]'),
            followUpCoverage: document.querySelector('[data-followup-coverage]'),
            aiFollowupBrief: document.querySelector('[data-ai-followup-brief]'),
            aiFollowupStatus: document.querySelector('[data-ai-followup-status]'),
            aiOutreachGuide: document.querySelector('[data-ai-outreach-guide]'),
            aiOutreachStatus: document.querySelector('[data-ai-outreach-status]'),
            aiLeadBrief: document.querySelector('[data-ai-lead-brief]'),
            aiLeadStatus: document.querySelector('[data-ai-lead-status]'),
            aiAnalyticsBrief: document.querySelector('[data-ai-analytics-brief]'),
            aiAnalyticsStatus: document.querySelector('[data-ai-analytics-status]'),
            aiDeployBrief: document.querySelector('[data-ai-deploy-brief]'),
            aiDeployStatus: document.querySelector('[data-ai-deploy-status]'),
            contactDetail: document.querySelector('[data-contact-detail]'),
          agentNameInput,
          agentToneInput,
          agentStatusInput,
          agentInstructionsInput,
          agentSourcesInput,
          agentSourceList,
            agentGuardrails,
            aiLiveThread: document.querySelector('[data-ai-live-thread]'),
            aiLiveStatus: document.querySelector('[data-ai-live-status]'),
            aiLiveNote: document.querySelector('[data-ai-live-note]'),
            aiRecommendation,
            aiOperatorLane,
            replyTemplateModeInput,
            replyTemplateStatus,
            sendReplyButton,
            replyTarget,
            threadWorkflow,
            replyStatus,
            selectedConversationTitle,
            selectedConversationChannel,
            selectedConversationStatus,
            selectedConversationOwner,
            selectedConversationUpdated,
            threadPrioritySummary,
            conversationInsights,
          replyGuidance,
          assignmentInput,
          contactMergeTargetSelect,
          messageThread,
          activityLog,
          voiceSessionContactSelect,
          voiceNoteContactSelect,
          voiceSessionProfileSelect,
          voiceNoteProfileSelect,
          businessKnowledgeList,
          businessKnowledgeStatus,
          businessKnowledgeTopicInput,
          businessKnowledgeQuestionInput,
          businessKnowledgeAnswerInput,
          businessKnowledgeTagsInput,
          businessKnowledgePriorityInput,
          businessKnowledgeIdInput,
          sequenceTemplateModeInput,
          sequenceTemplateStatus,
          metrics: {
            resolved: {
              label: metricLabels.get('resolved'),
              value: metrics.get('resolved'),
              detail: metricDetails.get('resolved')
            },
            firstReply: {
              label: metricLabels.get('first-reply'),
              value: metrics.get('first-reply'),
              detail: metricDetails.get('first-reply')
            },
            channels: {
              label: metricLabels.get('channels'),
              value: metrics.get('channels'),
              detail: metricDetails.get('channels')
            },
            followups: {
              label: metricLabels.get('followups'),
              value: metrics.get('followups'),
              detail: metricDetails.get('followups')
            }
          },
          liveOps: {
            pipeline: {
              value: liveOps.get('pipeline'),
              detail: liveOpsDetails.get('pipeline')
            },
            refunds: {
              value: liveOps.get('refunds'),
              detail: liveOpsDetails.get('refunds')
            },
            analytics: {
              value: liveOps.get('analytics'),
              detail: liveOpsDetails.get('analytics')
            },
            'channels-performance': {
              value: liveOps.get('channels-performance'),
              detail: liveOpsDetails.get('channels-performance')
            }
          },
          voiceMetrics: {
            calls: voiceMetrics.get('calls'),
            transfers: voiceMetrics.get('transfers'),
          notes: voiceMetrics.get('notes')
          }
        }
      });
      const previewActions = createPreviewActions({
        auth,
        supabaseClient,
        providerReadiness,
        workspaceTitle,
        nodes: {
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
          assignmentInput,
          contactMergeTargetSelect,
          mergeStatus,
          contactDetail,
          contactTagsList,
          contactTagInput,
          contactTagsStatus,
          contactHealthBackfillStatus,
          providerGrid,
          searchSection,
          webhookSetup,
          searchResults,
          searchStatus,
          searchInput,
          workflowQueueList,
          workflowQueueStatus,
          workflowAssigneeInput,
          workflowNoteInput,
          aiFollowupBrief: document.querySelector('[data-ai-followup-brief]'),
          aiFollowupStatus: document.querySelector('[data-ai-followup-status]'),
          aiOutreachGuide: document.querySelector('[data-ai-outreach-guide]'),
          aiOutreachStatus: document.querySelector('[data-ai-outreach-status]'),
          aiLeadBrief: document.querySelector('[data-ai-lead-brief]'),
          aiLeadStatus: document.querySelector('[data-ai-lead-status]'),
          aiAnalyticsBrief: document.querySelector('[data-ai-analytics-brief]'),
          aiAnalyticsStatus: document.querySelector('[data-ai-analytics-status]'),
          aiDeployBrief: document.querySelector('[data-ai-deploy-brief]'),
          aiDeployStatus: document.querySelector('[data-ai-deploy-status]'),
          syncJobsList,
          syncJobsStatus,
          internalNoteInput,
          sendReplyButton,
          agentNameInput,
          agentToneInput,
          agentSourcesInput,
          agentStatusInput,
          agentInstructionsInput,
          agentStatusNote
        },
        helpers: {
          buildDemoIngestPayload,
          setStatus,
          setAiStatus,
          setReplyStatus,
          setAgentStatus,
          setIngestStatus,
          saveBusinessKnowledgeEntry,
          deleteBusinessKnowledgeEntry,
          toast
        },
        refreshWorkspaceData,
        saveAppState
      });
      const authFlow = createAuthWorkspaceController({
        auth,
        supabaseClient,
        backendService,
        saveAccessToken,
        saveRefreshToken,
        saveWorkspaceContext,
        clearWorkspaceContext,
        saveAppState,
        updateWorkspacePicker,
        setWorkspaceSummary,
        updateRuntimeView: runtimeView.updateRuntimeView,
        setShellVisible,
        setAuthStatus,
        toast,
        statusNodes: {
          supabaseState,
          runtimeBadge,
          workspaceRole
        }
      });

      if (searchInput && auth.searchQuery) {
        searchInput.value = auth.searchQuery;
      }

      function getLatestFailedWhatsAppConversationId() {
        const messages = Array.isArray(auth.snapshot?.messages) ? auth.snapshot.messages : [];
        const conversations = Array.isArray(auth.snapshot?.conversations) ? auth.snapshot.conversations : [];
        const failedMessage = messages
          .filter((item) => {
            if (String(item.direction || '').toLowerCase() !== 'outbound') return false;
            const provider = String(item.source_provider || item.channel || item.raw_payload?.provider || '').toLowerCase();
            const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
            return provider === 'whatsapp' && ['failed', 'error', 'undelivered', 'retrying'].includes(state);
          })
          .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())[0];
        if (!failedMessage?.conversation_id) return '';
        return conversations.find((item) => item.id === failedMessage.conversation_id)?.id || '';
      }

      function normalizeDuplicateEmail(value = '') {
        return String(value || '').trim().toLowerCase();
      }

      function normalizeDuplicatePhone(value = '') {
        return String(value || '').replace(/[^\d]/g, '').trim();
      }

      function getConversationForContact(contactId = '') {
        const conversations = Array.isArray(auth.snapshot?.conversations) ? auth.snapshot.conversations : [];
        return conversations
          .filter((item) => String(item.contact_id || '').trim() === String(contactId || '').trim())
          .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())[0] || null;
      }

      function buildDuplicateClusterReview(contactIdA = '', contactIdB = '') {
        const contacts = Array.isArray(auth.snapshot?.contacts) ? auth.snapshot.contacts : [];
        const contactA = contacts.find((item) => item.id === contactIdA) || null;
        const contactB = contacts.find((item) => item.id === contactIdB) || null;
        if (!contactA || !contactB) return null;
        const sharedQuery = contactA.email || contactB.email || contactA.phone || contactB.phone || contactA.name || contactB.name || '';
        return {
          query: sharedQuery,
          sourceContact: contactA,
          targetContact: contactB,
          sourceConversation: getConversationForContact(contactA.id),
          targetConversation: getConversationForContact(contactB.id),
          hasEmailMatch: normalizeDuplicateEmail(contactA.email) && normalizeDuplicateEmail(contactA.email) === normalizeDuplicateEmail(contactB.email),
          hasPhoneMatch: normalizeDuplicatePhone(contactA.phone) && normalizeDuplicatePhone(contactA.phone) === normalizeDuplicatePhone(contactB.phone)
        };
      }

      // Runtime view logic now lives in src/ui/runtime-view.js.
      function toast(message) {
        const node = document.createElement('div');
        node.className = 'toast';
        node.textContent = message;
        toastStack.appendChild(node);
        requestAnimationFrame(() => node.classList.add('show'));
        setTimeout(() => {
          node.classList.remove('show');
          setTimeout(() => node.remove(), 250);
        }, 2200);
      }

      function setScreen(screen, { persist = true, replace = false } = {}) {
        const nextScreen = isValidScreen(screen) ? screen : activeScreen;
        activeScreen = nextScreen;
        if (persist) {
          saveAppState({ screen: nextScreen });
        }
        setRouteScreen(nextScreen, { replace });
        const meta = SCREEN_META[nextScreen] || SCREEN_META[DEFAULT_SCREEN];
        title.textContent = meta[0];
        lead.textContent = meta[1];
        navItems.forEach((item) => item.classList.toggle('active', item.dataset.screen === nextScreen));
        sections.forEach((node, key) => {
          const isActive = key === nextScreen;
          node.classList.toggle('panel-focused', isActive);
          node.hidden = !isActive;
        });
        const target = sections.get(nextScreen);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      function setMetric(name, value) {
        const node = metrics.get(name);
        if (node) node.textContent = value;
      }

      function setMetricLabel(name, value) {
        const node = metricLabels.get(name);
        if (node) node.textContent = value;
      }

      function setMetricDetail(name, value) {
        const node = metricDetails.get(name);
        if (node) node.textContent = value;
      }

      function setLiveOp(name, value) {
        const node = liveOps.get(name);
        if (node) node.textContent = value;
      }

      function setLiveOpDetail(name, value) {
        const node = liveOpsDetails.get(name);
        if (node) node.textContent = value;
      }

      function setVoiceMetric(name, value) {
        const node = voiceMetrics.get(name);
        if (node) node.textContent = value;
      }

      function setStatus(node, value) {
        if (node) node.textContent = value;
      }

      function setWorkspaceSummary(workspace) {
        if (!workspace) return;
        if (workspaceTitle) workspaceTitle.textContent = workspace.name || 'Workspace';
        if (workspacePill) workspacePill.textContent = workspace.plan || 'starter';
      }

      function syncScreenFromRoute() {
        const routeScreen = readRouteScreen();
        if (!routeScreen || routeScreen === activeScreen) return;
        const nextScreen = isValidScreen(routeScreen) ? routeScreen : activeScreen;
        setScreen(nextScreen, { persist: false, replace: true });
      }

      function setAuthStatus(message) {
        if (!authStatus) return;
        const text = String(message || '').trim();
        const lower = text.toLowerCase();
        let state = 'neutral';
        if (
          lower.includes('signing in')
          || lower.includes('creating account')
          || lower.includes('loading workspace')
          || lower.includes('checking workspace')
          || lower.includes('bootstrap')
        ) {
          state = 'loading';
        } else if (
          lower.includes('account created')
          || lower.includes('check your inbox')
          || lower.includes('workspace loaded')
          || lower.includes('signed in as')
        ) {
          state = 'success';
        } else if (
          lower.includes('maintenance mode')
          || lower.includes('temporarily unreachable')
          || lower.includes('rate limit')
        ) {
          state = 'warning';
        } else if (
          lower.includes('failed')
          || lower.includes('invalid')
          || lower.includes('no user')
          || lower.includes('expired')
          || lower.includes('not configured')
          || lower.includes('no workspace')
        ) {
          state = 'error';
        }
        authStatus.textContent = text;
        authStatus.dataset.state = state;
      }

      function setAiStatus(message) {
        if (aiStatus) aiStatus.textContent = message;
      }

      function setReplyStatus(message) {
        if (replyStatus) replyStatus.textContent = message;
      }

      function setAgentStatus(message) {
        if (agentStatusNote) agentStatusNote.textContent = message;
      }

      function setIngestStatus(message) {
        if (ingestStatus) ingestStatus.textContent = message;
      }

      let liveSyncTimer = null;
      let liveSyncInFlight = false;
      let messageRealtimeSubscription = null;
      let workspaceRealtimeSubscription = null;
      let workspaceEventSource = null;
      let workspaceEventRetryTimer = null;

      function stopLiveSync() {
        if (liveSyncTimer) {
          clearInterval(liveSyncTimer);
          liveSyncTimer = null;
        }
      }

      function stopWorkspaceRealtime() {
        if (messageRealtimeSubscription?.unsubscribe) {
          messageRealtimeSubscription.unsubscribe();
          messageRealtimeSubscription = null;
        }
        if (workspaceRealtimeSubscription?.unsubscribe) {
          workspaceRealtimeSubscription.unsubscribe();
          workspaceRealtimeSubscription = null;
        }
        if (workspaceEventSource) {
          workspaceEventSource.close();
          workspaceEventSource = null;
        }
        if (workspaceEventRetryTimer) {
          clearTimeout(workspaceEventRetryTimer);
          workspaceEventRetryTimer = null;
        }
      }

      function startLiveSync() {
        if (liveSyncTimer) return;
        liveSyncTimer = setInterval(async () => {
          if (!auth.workspaceId || liveSyncInFlight || document.hidden) return;
          liveSyncInFlight = true;
          try {
            await refreshWorkspaceData();
          } catch (error) {
            console.warn('Live sync refresh failed.', error);
          } finally {
            liveSyncInFlight = false;
          }
        }, 15000);
      }

      function startWorkspaceRealtime() {
        if (!auth.workspaceId || messageRealtimeSubscription || workspaceRealtimeSubscription || workspaceEventSource) return;
        if (supabaseClient?.subscribeToMessagesTable && auth.accessToken) {
          const subscription = supabaseClient.subscribeToMessagesTable({
            workspaceId: auth.workspaceId,
            token: auth.accessToken,
            onStatus: (status) => {
              if (status === 'SUBSCRIBED') {
                setStatus(runtimeBadge, 'Supabase inbox realtime connected');
              } else if (status === 'CHANNEL_ERROR') {
                setStatus(runtimeBadge, 'Supabase inbox realtime error');
              } else if (status === 'TIMED_OUT') {
                setStatus(runtimeBadge, 'Supabase inbox realtime timed out');
              } else if (status === 'CLOSED') {
                setStatus(runtimeBadge, 'Supabase inbox realtime closed');
              }
            },
            onEvent: async () => {
              try {
                await refreshWorkspaceData();
              } catch (error) {
                console.warn('Supabase inbox realtime refresh failed.', error);
              }
            }
          });
          if (subscription) {
            messageRealtimeSubscription = subscription;
            setStatus(runtimeBadge, 'Supabase inbox realtime connecting');
            return;
          }
        }
        if (!window.EventSource) {
          setStatus(runtimeBadge, 'Realtime unavailable');
          return;
        }

        const url = new URL('/.netlify/functions/events', window.location.origin);
        url.searchParams.set('workspace_id', auth.workspaceId);

        const source = new EventSource(url.toString());
        workspaceEventSource = source;

        source.addEventListener('ready', () => {
          setStatus(runtimeBadge, 'Realtime connected');
        });

        source.addEventListener('workspace.updated', async (event) => {
          try {
            const payload = event?.data ? JSON.parse(event.data) : {};
            if (payload?.mutationType === 'workspace.snapshot') return;
            if (!auth.workspaceId) return;
            await refreshWorkspaceData();
          } catch (error) {
            console.warn('Workspace realtime event handling failed.', error);
          }
        });

        source.addEventListener('voice.transcript.relay', async (event) => {
          try {
            const payload = event?.data ? JSON.parse(event.data) : {};
            const detail = payload?.detail || {};
            if (String(detail.voiceSessionId || '') !== String(auth.softphone?.sessionId || '')) return;
            if (typeof previewActions.ingestSoftphoneRelayEvent === 'function') {
              previewActions.ingestSoftphoneRelayEvent(payload);
            }
          } catch (error) {
            console.warn('Voice relay event handling failed.', error);
          }
        });

        source.onerror = () => {
          setStatus(runtimeBadge, 'Realtime reconnecting');
          if (workspaceEventRetryTimer) return;
          workspaceEventRetryTimer = setTimeout(() => {
            workspaceEventRetryTimer = null;
            stopWorkspaceRealtime();
            if (auth.workspaceId) startWorkspaceRealtime();
          }, 5000);
        };
      }

      function getSignupCooldownKey(email) {
        return `auraflow:last-signup:${String(email || '').trim().toLowerCase()}`;
      }

      function isSignupOnCooldown(email, cooldownMs = 10 * 60 * 1000) {
        const stamp = Number(localStorage.getItem(getSignupCooldownKey(email)) || 0);
        return stamp && Date.now() - stamp < cooldownMs;
      }

      function markSignupAttempt(email) {
        localStorage.setItem(getSignupCooldownKey(email), String(Date.now()));
      }

      async function loadWorkspaceSnapshot(workspaceId) {
        if (backendService?.loadWorkspaceSnapshot) {
          try {
            return await backendService.loadWorkspaceSnapshot(workspaceId);
          } catch (error) {
            console.warn('Backend snapshot load failed.', error);
          }
        }
        return supabaseClient ? supabaseClient.loadWorkspaceSnapshot(workspaceId) : null;
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

        if (supabaseClient) {
          return supabaseClient.createWorkspaceMember({
            workspaceId,
            userId,
            role: 'owner'
          });
        }

        return null;
      }

      async function listBusinessKnowledge(workspaceId) {
        if (!workspaceId || !supabaseClient?.listBusinessKnowledge) return [];
        try {
          const rows = await supabaseClient.listBusinessKnowledge(workspaceId);
          return Array.isArray(rows) ? rows : [];
        } catch (error) {
          console.warn('Business knowledge list failed.', error);
          return [];
        }
      }

      async function saveBusinessKnowledgeEntry(payload = {}) {
        if (!supabaseClient?.upsertBusinessKnowledge) {
          throw new Error('Business knowledge save is unavailable without Supabase browser access.');
        }
        return supabaseClient.upsertBusinessKnowledge(payload);
      }

      async function deleteBusinessKnowledgeEntry(payload = {}) {
        if (!supabaseClient?.deleteBusinessKnowledge) {
          throw new Error('Business knowledge delete is unavailable without Supabase browser access.');
        }
        return supabaseClient.deleteBusinessKnowledge(payload);
      }

      async function enrichSnapshotWithBusinessKnowledge(snapshot) {
        if (!snapshot || !auth.workspaceId) return snapshot;
        const existing = Array.isArray(snapshot.businessKnowledge) ? snapshot.businessKnowledge : [];
        if (existing.length) return snapshot;
        const businessKnowledge = await listBusinessKnowledge(auth.workspaceId);
        return {
          ...snapshot,
          businessKnowledge
        };
      }

      async function finishAuthSession(email, session) {
        const accessToken = session?.access_token || session?.session?.access_token;
        if (!accessToken) {
          if (session?.user && !session?.session) {
            throw new Error('Account created. Check your email and sign in again.');
          }
          throw new Error('Supabase did not return a session.');
        }

        saveAccessToken(accessToken);
        supabaseClient.setAccessToken(accessToken);
        const user = await supabaseClient.getUser(accessToken);
        saveWorkspaceContext({ sessionEmail: email });

        auth.user = user;
        auth.accessToken = accessToken;
        auth.sessionEmail = email;
        setAuthStatus(`Signed in as ${email}. Loading workspace...`);

        const workspaces = await listWorkspaces(user.id);
        auth.workspaces = Array.isArray(workspaces) ? workspaces : [];

        if (!auth.workspaces.length) {
          const fallbackName = 'Northstar Commerce';
          const fallbackSlug = fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const created = await createWorkspace(fallbackName, fallbackSlug, 'starter');
          const workspace = Array.isArray(created) ? created[0] : created;
          if (workspace?.id) {
            await createWorkspaceMember(workspace.id, user.id);
            auth.workspaces = [workspace];
          }
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

      async function selectWorkspace(workspaceId) {
        if (!workspaceId) return;
        stopLiveSync();
        stopWorkspaceRealtime();
        saveWorkspaceContext({ workspaceId });
        saveAppState({ workspaceId });
        auth.workspaceId = workspaceId;
        const workspace = auth.workspaces.find((item) => item.id === workspaceId);
        const baseSnapshot = await loadWorkspaceSnapshot(workspaceId);
        const snapshot = await enrichSnapshotWithBusinessKnowledge(baseSnapshot);
        auth.snapshot = snapshot;
        setWorkspaceSummary(workspace);
        runtimeView.updateRuntimeView(snapshot, providerReadiness);
        setShellVisible(true);
        setAuthStatus(`Workspace loaded: ${workspaceId}.`);
        setStatus(supabaseState, `Supabase live: ${snapshot.conversations?.length || 0} conversations synced.`);
        setStatus(runtimeBadge, 'Live data');
        toast('Workspace loaded from Supabase.');
        startLiveSync();
        startWorkspaceRealtime();
      }

      function calculateAverageFirstReply(conversations = [], messages = []) {
        const byConversation = new Map();
        messages.forEach((message) => {
          if (!message.conversation_id) return;
          if (!byConversation.has(message.conversation_id)) byConversation.set(message.conversation_id, []);
          byConversation.get(message.conversation_id).push(message);
        });

        const durations = [];
        conversations.forEach((conversation) => {
          const thread = (byConversation.get(conversation.id) || [])
            .slice()
            .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
          const inbound = thread.find((item) => String(item.direction || '').toLowerCase() === 'inbound');
          const outbound = inbound
            ? thread.find((item) => String(item.direction || '').toLowerCase() === 'outbound' && new Date(item.created_at).getTime() >= new Date(inbound.created_at).getTime())
            : null;
          if (!inbound || !outbound) return;
          const diffMinutes = (new Date(outbound.created_at).getTime() - new Date(inbound.created_at).getTime()) / 60000;
          if (Number.isFinite(diffMinutes) && diffMinutes >= 0) {
            durations.push(diffMinutes);
          }
        });

        if (!durations.length) return 0;
        return durations.reduce((sum, value) => sum + value, 0) / durations.length;
      }

      async function refreshWorkspaceData() {
        if (!auth.workspaceId) {
          toast('Load a workspace first.');
          return;
        }

        const baseSnapshot = await loadWorkspaceSnapshot(auth.workspaceId);
        const snapshot = await enrichSnapshotWithBusinessKnowledge(baseSnapshot);
        auth.snapshot = snapshot;
        runtimeView.updateRuntimeView(snapshot, providerReadiness);
        await hydrateRuntimeData();
        try {
          await previewActions.refreshWorkflowQueue();
        } catch (error) {
          console.warn('Workflow queue refresh failed.', error);
        }
        try {
          await previewActions.refreshSyncJobs();
        } catch (error) {
          console.warn('Sync jobs refresh failed.', error);
        }
        try {
          await previewActions.refreshReliabilityPanel();
        } catch (error) {
          console.warn('Reliability refresh failed.', error);
        }
        toast('Workspace data refreshed.');
      }

      async function hydrateRuntimeData() {
        try {
          providerReadiness = backendService?.requestProviderReadiness
            ? await backendService.requestProviderReadiness(auth.workspaceId || '')
            : [];
        } catch (error) {
          console.warn('Provider readiness refresh failed.', error);
          providerReadiness = [];
        }

        if (auth.snapshot) {
          runtimeView.updateRuntimeView(auth.snapshot, providerReadiness);
        }

        const formatOauthStatusMessage = (provider, status, errorMessage = '') => {
          const normalizedProvider = String(provider || 'Channel').trim();
          const normalizedError = String(errorMessage || '').trim();
          const lowerError = normalizedError.toLowerCase();
          if (status === 'connected') {
            return `${normalizedProvider} connected for this workspace. Finish webhook verification in Deploy.`;
          }
          if (
            lowerError.includes('app review')
            || lowerError.includes('not approved')
            || lowerError.includes('pending approval')
            || lowerError.includes('advanced access')
            || lowerError.includes('coming soon')
            || lowerError.includes('app not active')
          ) {
            return `${normalizedProvider} is pending Meta approval. This connection will unlock automatically once review finishes.`;
          }
          return `${normalizedProvider} connection failed: ${normalizedError || 'OAuth error'}`;
        };

        const oauthProvider = oauthRedirectParams.get('oauth_provider') || '';
        const oauthStatus = oauthRedirectParams.get('oauth_status') || '';
        if (oauthProvider && oauthStatus && nangoState) {
          setStatus(
            nangoState,
            formatOauthStatusMessage(oauthProvider, oauthStatus, oauthRedirectParams.get('oauth_error') || '')
          );
          if (oauthStatus === 'connected') {
            toast(`${oauthProvider} connected.`);
          } else if (String(oauthRedirectParams.get('oauth_error') || '').toLowerCase().includes('approval')) {
            toast(`${oauthProvider} is pending approval.`);
          }
          const cleanUrl = new URL(window.location.href);
          ['oauth_provider', 'oauth_status', 'oauth_error', 'workspace_id'].forEach((key) => cleanUrl.searchParams.delete(key));
          window.history.replaceState({}, document.title, cleanUrl.toString());
          oauthRedirectParams.delete('oauth_provider');
          oauthRedirectParams.delete('oauth_status');
          oauthRedirectParams.delete('oauth_error');
          oauthRedirectParams.delete('workspace_id');
        }
      }

      function populateSequenceEditor(sequence = null) {
        const current = sequence || {};
        const template = Array.isArray(auth.snapshot?.sequenceStepTemplates)
          ? auth.snapshot.sequenceStepTemplates.find((item) => item.id === current.id)
          : null;
        const steps = Array.isArray(current.steps_detail)
          ? current.steps_detail
          : Array.isArray(template?.steps_detail)
            ? template.steps_detail
          : String(current.steps_detail || '')
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean);
        if (sequenceIdInput) sequenceIdInput.value = current.id || '';
        if (sequenceNameInput) sequenceNameInput.value = current.name || 'Post-demo follow-up';
        if (sequenceStatusInput) sequenceStatusInput.value = current.status || 'active';
        if (sequenceTriggerInput) sequenceTriggerInput.value = current.trigger || 'No reply after 48 hours';
        if (sequenceChannelInput) sequenceChannelInput.value = current.channel || 'Email + WhatsApp';
        if (sequenceGoalInput) sequenceGoalInput.value = current.goal || 'Book a meeting or recover the lead';
        if (sequenceOwnerInput) sequenceOwnerInput.value = current.owner || 'Sales + Support';
        if (sequenceStepsInput) sequenceStepsInput.value = String(current.steps ?? 3);
        if (sequenceRepliesInput) sequenceRepliesInput.value = current.replies || '12.8%';
        if (sequenceDeliveriesInput) sequenceDeliveriesInput.value = current.deliveries || '96.4%';
        if (sequenceNextRunInput) sequenceNextRunInput.value = current.next_run || 'Today, 4:00 PM';
        if (sequenceNotesInput) sequenceNotesInput.value = current.notes || '';
        if (sequenceEditorTitle) sequenceEditorTitle.textContent = current.id ? current.name || 'Follow-up sequence' : 'New sequence';
        renderSequenceStepRows(steps);
        if (sequenceStatusNote) {
          sequenceStatusNote.textContent = current.id
            ? 'Editing a saved sequence. Update any field and save to persist changes.'
            : 'Create a sequence or load one from the list.';
        }
      }

      function renderSequenceStepRows(items = []) {
        if (!sequenceStepList) return;
        const steps = items.length ? items : [''];
        sequenceStepList.innerHTML = steps.map((step, index) => `
          <div class="sequence-step-row" draggable="true" data-sequence-step-row data-step-index="${index}">
            <button class="ghost-button compact" type="button" data-action="drag-sequence-step" data-step-index="${index}" aria-label="Drag to reorder">Drag</button>
            <span class="badge neutral">${index + 1}</span>
            <input type="text" data-sequence-step-value value="${escapeHtml(String(step || ''))}" placeholder="Step copy or timing" />
            <button class="ghost-button compact" type="button" data-action="move-sequence-step" data-direction="up" data-step-index="${index}">Up</button>
            <button class="ghost-button compact" type="button" data-action="move-sequence-step" data-direction="down" data-step-index="${index}">Down</button>
            <button class="ghost-button compact" type="button" data-action="remove-sequence-step" data-step-index="${index}">Remove</button>
          </div>
        `).join('');
      }

      function addSequenceStepRow() {
        const rows = Array.from(sequenceStepList?.querySelectorAll('[data-sequence-step-value]') || []);
        rows.push(null);
        renderSequenceStepRows(rows.map((row) => (row ? row.value : '')));
      }

      function moveSequenceStepRow(index, direction) {
        const rows = Array.from(sequenceStepList?.querySelectorAll('[data-sequence-step-value]') || []);
        if (!rows.length) return;
        const nextValues = rows.map((row) => row.value);
        const targetIndex = Number(index);
        if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= nextValues.length) return;
        const swapIndex = direction === 'up' ? targetIndex - 1 : targetIndex + 1;
        if (swapIndex < 0 || swapIndex >= nextValues.length) return;
        [nextValues[targetIndex], nextValues[swapIndex]] = [nextValues[swapIndex], nextValues[targetIndex]];
        renderSequenceStepRows(nextValues);
        requestAnimationFrame(() => {
          const nextRows = Array.from(sequenceStepList?.querySelectorAll('[data-sequence-step-value]') || []);
          const focusRow = nextRows[swapIndex];
          if (focusRow) {
            focusRow.focus();
            const valueLength = focusRow.value.length;
            if (typeof focusRow.setSelectionRange === 'function') {
              focusRow.setSelectionRange(valueLength, valueLength);
            }
          }
        });
      }

      function moveSequenceStepRowToIndex(sourceIndex, targetIndex) {
        const rows = Array.from(sequenceStepList?.querySelectorAll('[data-sequence-step-value]') || []);
        if (!rows.length) return;
        const nextValues = rows.map((row) => row.value);
        const fromIndex = Number(sourceIndex);
        const toIndex = Number(targetIndex);
        if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
        if (fromIndex < 0 || fromIndex >= nextValues.length) return;
        if (toIndex < 0 || toIndex >= nextValues.length || fromIndex === toIndex) return;
        const [moved] = nextValues.splice(fromIndex, 1);
        nextValues.splice(toIndex, 0, moved);
        renderSequenceStepRows(nextValues);
        requestAnimationFrame(() => {
          const nextRows = Array.from(sequenceStepList?.querySelectorAll('[data-sequence-step-value]') || []);
          const focusRow = nextRows[toIndex];
          if (focusRow) focusRow.focus();
        });
      }

      function renderContactTagChips(tags = []) {
        const tagsList = contactDetail?.querySelector('[data-contact-tags-list]');
        if (!tagsList) return;
        const uniqueTags = Array.from(new Set(tags.map((tag) => String(tag || '').trim()).filter(Boolean)));
        tagsList.innerHTML = uniqueTags.length
          ? uniqueTags.map((tag) => `<button class="badge neutral tag-chip" type="button" data-action="remove-contact-tag" data-contact-tag-value="${escapeHtml(tag)}">${escapeHtml(tag)} <span aria-hidden="true">x</span></button>`).join('')
          : '<span class="badge muted">No tags</span>';
      }

      function currentContactTags() {
        const tagsList = contactDetail?.querySelector('[data-contact-tags-list]');
        return Array.from(tagsList?.querySelectorAll('[data-contact-tag-value]') || [])
          .map((node) => String(node.dataset.contactTagValue || '').trim())
          .filter(Boolean);
      }

      function updateContactTags(tag) {
        const tags = currentContactTags();
        const normalized = String(tag || '').trim();
        if (!normalized || tags.includes(normalized)) return;
        tags.push(normalized);
        renderContactTagChips(tags);
        if (contactTagsStatus) contactTagsStatus.textContent = `Added "${normalized}". Save tags to persist the update.`;
      }

      function removeContactTag(tag) {
        const normalized = String(tag || '').trim();
        const next = currentContactTags().filter((item) => item !== normalized);
        renderContactTagChips(next);
        if (contactTagsStatus) contactTagsStatus.textContent = normalized
          ? `Removed "${normalized}". Save tags to persist the update.`
          : 'Save tags to persist the update.';
      }

      function handleSequenceStepKeydown(event) {
        const input = event.target?.closest?.('[data-sequence-step-value]');
        if (!input || !sequenceStepList?.contains(input)) return;
        if (!event.altKey) return;
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const rows = Array.from(sequenceStepList.querySelectorAll('[data-sequence-step-value]'));
        const index = rows.indexOf(input);
        if (index === -1) return;
        moveSequenceStepRow(index, event.key === 'ArrowUp' ? 'up' : 'down');
      }

      function handleSequenceDragStart(event) {
        const row = event.target?.closest?.('[data-sequence-step-row]');
        if (!row || !sequenceStepList?.contains(row)) return;
        sequenceDragIndex = Number(row.dataset.stepIndex || -1);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(sequenceDragIndex));
        row.classList.add('is-dragging');
      }

      function handleSequenceDragOver(event) {
        const row = event.target?.closest?.('[data-sequence-step-row]');
        if (!row || !sequenceStepList?.contains(row)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }

      function handleSequenceDrop(event) {
        const row = event.target?.closest?.('[data-sequence-step-row]');
        if (!row || !sequenceStepList?.contains(row)) return;
        event.preventDefault();
        const dropIndex = Number(row.dataset.stepIndex || -1);
        if (!Number.isInteger(sequenceDragIndex) || sequenceDragIndex < 0 || dropIndex < 0) return;
        moveSequenceStepRowToIndex(sequenceDragIndex, dropIndex);
        sequenceDragIndex = -1;
      }

      function handleSequenceDragEnd() {
        sequenceDragIndex = -1;
        sequenceStepList?.querySelectorAll('[data-sequence-step-row]').forEach((row) => row.classList.remove('is-dragging'));
      }

      function openSequenceModal(sequence = null) {
        if (sequence?.id) {
          auth.selectedSequenceId = sequence.id;
          saveAppState({ selectedSequenceId: sequence.id });
        } else {
          auth.selectedSequenceId = '';
          saveAppState({ selectedSequenceId: '' });
        }
        populateSequenceEditor(sequence);
        backdrop.hidden = false;
        backdrop.classList.add('open');
      }

      function closeSequenceModal() {
        backdrop.hidden = true;
        backdrop.classList.remove('open');
      }

      sequenceStepList?.addEventListener('keydown', handleSequenceStepKeydown);
      sequenceStepList?.addEventListener('dragstart', handleSequenceDragStart);
      sequenceStepList?.addEventListener('dragover', handleSequenceDragOver);
      sequenceStepList?.addEventListener('drop', handleSequenceDrop);
      sequenceStepList?.addEventListener('dragend', handleSequenceDragEnd);

      // Preview actions now live in src/controllers/preview-actions.js.
      bindPreviewEvents({
        nodes: {
          menu,
          nav,
          closeNavButtons,
          navItems,
          actionButtons,
          closeModalButtons,
          backdrop,
          authForm,
          signupButton: document.querySelector('[data-signup-action]'),
          createWorkspaceButton,
          workspaceList,
          searchForm,
          searchInput,
          dashboardConversations,
          providerGrid,
          connectionsList,
          appShell,
          authOverlay
        },
        authFlow,
        setScreen,
        openSequenceModal,
        closeSequenceModal,
        refreshWorkspaceData,
        getLatestFailedWhatsAppConversationId: () => {
          const messages = Array.isArray(auth.snapshot?.messages) ? auth.snapshot.messages : [];
          const conversations = Array.isArray(auth.snapshot?.conversations) ? auth.snapshot.conversations : [];
          const failedMessage = messages
            .filter((item) => {
              if (String(item.direction || '').toLowerCase() !== 'outbound') return false;
              const provider = String(item.source_provider || item.channel || item.raw_payload?.provider || '').toLowerCase();
              const state = String(item.delivery_state || item.raw_payload?.delivery_state || '').toLowerCase();
              return provider === 'whatsapp' && ['failed', 'error', 'undelivered', 'retrying'].includes(state);
            })
            .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())[0];
          if (!failedMessage?.conversation_id) return '';
          return conversations.find((item) => item.id === failedMessage.conversation_id)?.id || '';
        },
        actionHandlers: {
          'focus-agent': async () => {
            setScreen('agent');
            toast('Agent builder focused.');
          },
          'focus-inbox': async () => {
            setScreen('inbox');
          },
          'focus-whatsapp-failures': async () => {
            auth.inboxFilter = 'failed';
            saveAppState({ inboxFilter: auth.inboxFilter });
            const conversationId = getLatestFailedWhatsAppConversationId();
            if (conversationId) {
              auth.selectedConversationId = conversationId;
              saveAppState({ selectedConversationId: conversationId });
            }
            setScreen('inbox');
            if (auth.snapshot) {
              runtimeView.updateRuntimeView(auth.snapshot, providerReadiness);
            }
            toast(conversationId ? 'Inbox focused on failed WhatsApp sends.' : 'No failed WhatsApp sends found right now.');
          },
          'retry-failed-whatsapp': async () => {
            const conversationId = getLatestFailedWhatsAppConversationId();
            if (!conversationId) {
              throw new Error('No failed WhatsApp send is available to retry right now.');
            }
            auth.inboxFilter = 'failed';
            auth.selectedConversationId = conversationId;
            saveAppState({
              inboxFilter: auth.inboxFilter,
              selectedConversationId: conversationId
            });
            setScreen('inbox');
            if (auth.snapshot) {
              runtimeView.updateRuntimeView(auth.snapshot, providerReadiness);
            }
            await previewActions.retryLastReply();
          },
          'retry-all-failed-whatsapp': async () => {
            auth.inboxFilter = 'failed';
            saveAppState({ inboxFilter: auth.inboxFilter });
            setScreen('inbox');
            if (auth.snapshot) {
              runtimeView.updateRuntimeView(auth.snapshot, providerReadiness);
            }
            await previewActions.retryFailedWhatsAppQueue({ limit: 5 });
          },
          'search-duplicate-cluster': async (dataset = {}) => {
            const query = String(dataset?.duplicateQuery || '').trim();
            if (!query) {
              throw new Error('No duplicate review query is available for this cluster yet.');
            }
            if (searchInput) searchInput.value = query;
            await previewActions.searchWorkspace(query);
            toast(`Showing workspace matches for ${query}.`);
          },
          'prepare-contact-merge': async (dataset = {}) => {
            const sourceContactId = String(dataset?.sourceContactId || '').trim();
            const targetContactId = String(dataset?.targetContactId || '').trim();
            const review = buildDuplicateClusterReview(sourceContactId, targetContactId);
            if (!review?.sourceContact || !review?.targetContact) {
              throw new Error('AuraFlow could not find both contacts for this duplicate review item.');
            }
            if (!review.sourceConversation) {
              throw new Error('Open a thread for the first contact before preparing a merge.');
            }
            auth.selectedConversationId = review.sourceConversation.id;
            saveAppState({ selectedConversationId: review.sourceConversation.id });
            setScreen('inbox');
            if (auth.snapshot) {
              runtimeView.updateRuntimeView(auth.snapshot, providerReadiness);
            }
            if (contactMergeTargetSelect) {
              contactMergeTargetSelect.value = review.targetContact.id;
            }
            const basis = review.hasEmailMatch ? 'matching email' : review.hasPhoneMatch ? 'matching phone' : 'shared contact signal';
            toast(`Merge prepared for ${review.sourceContact.name || 'contact'} into ${review.targetContact.name || 'contact'} based on ${basis}.`);
          },
          'focus-settings': async () => {
            setScreen('settings');
          },
          'backfill-contact-phone-health': previewActions.backfillContactPhoneHealth,
          'set-theme-preference': async (dataset = {}) => {
            applyThemePreference(dataset?.themePreference || 'system');
            toast(`Theme set to ${normalizeThemePreference(dataset?.themePreference || 'system')}.`);
          },
          'dismiss-welcome-tour': async () => {
            const dismissed = Array.isArray(auth.onboarding?.dismissedWorkspaceIds)
              ? auth.onboarding.dismissedWorkspaceIds
              : [];
            auth.onboarding = {
              dismissedWorkspaceIds: Array.from(new Set([
                ...dismissed,
                String(auth.workspaceId || '').trim()
              ])).filter(Boolean)
            };
            saveAppState({ onboarding: auth.onboarding });
            runtimeView.updateRuntimeView(auth.snapshot || {}, providerReadiness);
            toast('Welcome tour dismissed.');
          },
          'create-voice-profile': previewActions.createVoiceProfileRecord,
          'queue-voice-call': previewActions.queueVoiceCallRecord,
          'save-voice-note': previewActions.saveVoiceNoteRecord,
          'analyze-voice-note': previewActions.analyzeVoiceNoteRecord,
          'generate-ai-briefing': previewActions.generateAiBriefing,
          'generate-ai-reply': previewActions.generateAiReplyDraft,
          'apply-ai-sequence': async () => {
            openSequenceModal(null);
            await previewActions.applyAiSequenceSuggestion('default');
          },
          'apply-ai-email-variant': async () => {
            openSequenceModal(null);
            await previewActions.applyAiSequenceSuggestion('email');
          },
          'apply-ai-whatsapp-variant': async () => {
            openSequenceModal(null);
            await previewActions.applyAiSequenceSuggestion('whatsapp');
          },
          'send-reply': previewActions.sendReplyRecord,
            'start-softphone-call': previewActions.startSoftphoneCall,
            'end-softphone-call': previewActions.endSoftphoneCall,
            'save-softphone-summary': previewActions.saveSoftphoneSummary,
          'queue-reply': previewActions.queueReplyRecord,
          'generate-ai-summary': () => previewActions.generateAiAssist('summary'),
          'generate-ai-classification': () => previewActions.generateAiAssist('classify'),
          'generate-ai-next-action': () => previewActions.generateAiAssist('next_action'),
          'retry-last-reply': previewActions.retryLastReply,
            'create-ai-workflow-job': async (dataset = {}) => previewActions.createAiWorkflowJob(dataset?.choice || 'auto'),
            'ai-handoff': () => previewActions.assignConversationRecord({ status: 'escalated' }),
            'assign-conversation': () => previewActions.assignConversationRecord({}),
            'save-assignment': () => previewActions.assignConversationRecord({}),
            'escalate-conversation': () => previewActions.assignConversationRecord({ status: 'escalated' }),
            'merge-contact': previewActions.mergeContactRecord,
          'save-contact-tags': previewActions.saveContactTagsRecord,
          'save-business-knowledge': previewActions.saveBusinessKnowledgeRecord,
          'reset-business-knowledge': previewActions.resetBusinessKnowledgeForm,
          'load-business-knowledge': async (dataset = {}) => {
            await previewActions.loadBusinessKnowledgeRecord(dataset?.knowledgeId || '');
          },
          'delete-business-knowledge': async (dataset = {}) => {
            await previewActions.deleteBusinessKnowledgeRecord(dataset?.knowledgeId || '');
          },
          'add-contact-tag': async () => {
            const tag = String(contactDetail?.querySelector('[data-contact-tag-input]')?.value || '').trim();
            if (!tag) {
              throw new Error('Enter a tag first.');
            }
            updateContactTags(tag);
            const input = contactDetail?.querySelector('[data-contact-tag-input]');
            if (input) input.value = '';
          },
          'apply-contact-tag': async (dataset) => {
            const tag = String(dataset?.contactTagValue || '').trim();
            if (!tag) {
              throw new Error('Choose a tag first.');
            }
            updateContactTags(tag);
          },
          'remove-contact-tag': async (dataset) => {
            removeContactTag(dataset?.contactTagValue || dataset?.tag || '');
          },
          'resolve-conversation': () => previewActions.setConversationState('closed'),
          'reopen-conversation': () => previewActions.setConversationState('open'),
          'add-internal-note': previewActions.saveInternalNoteRecord,
          'sync-configured-channels': previewActions.syncConfiguredChannels,
          'refresh-sync-jobs': previewActions.refreshSyncJobs,
          'refresh-workflow-queue': previewActions.refreshWorkflowQueue,
          'refresh-reliability': previewActions.refreshReliabilityPanel,
          'retry-webhook-replay': async (dataset = {}) => {
            await previewActions.retryWebhookReplay(dataset?.replayKey || '');
          },
          'assign-workflow-job': async (dataset = {}) => {
            await previewActions.updateWorkflowJobRecord({
              jobId: dataset?.jobId || '',
              status: 'assigned',
              assignee: String(workflowAssigneeInput?.value || dataset?.jobAssignee || 'Workspace operator').trim()
            });
          },
          'complete-workflow-job': async (dataset = {}) => {
            await previewActions.updateWorkflowJobRecord({
              jobId: dataset?.jobId || '',
              status: 'completed',
              assignee: String(workflowAssigneeInput?.value || dataset?.jobAssignee || 'Workspace operator').trim()
            });
          },
          'escalate-workflow-job': async (dataset = {}) => {
            await previewActions.updateWorkflowJobRecord({
              jobId: dataset?.jobId || '',
              status: 'escalated',
              assignee: String(workflowAssigneeInput?.value || dataset?.jobAssignee || 'Escalation queue').trim(),
              note: String(workflowNoteInput?.value || dataset?.jobNote || 'Escalated from workflow queue.').trim()
            });
          },
          'retry-workflow-job': async (dataset = {}) => {
            await previewActions.updateWorkflowJobRecord({
              jobId: dataset?.jobId || '',
              status: 'retrying',
              assignee: String(workflowAssigneeInput?.value || dataset?.jobAssignee || 'Workspace operator').trim(),
              note: String(workflowNoteInput?.value || dataset?.jobNote || 'Retrying from workflow queue.').trim()
            });
          },
          'search-workspace': async (dataset = {}) => {
            const query = String(dataset?.query || searchInput?.value || '').trim();
            await previewActions.searchWorkspace(query);
          },
          'clear-search': async () => {
            previewActions.clearWorkspaceSearch();
          },
          'set-inbox-filter': async (dataset = {}) => {
            auth.inboxFilter = String(dataset?.inboxFilter || 'all').trim().toLowerCase() || 'all';
            saveAppState({ inboxFilter: auth.inboxFilter });
            if (auth.snapshot) {
              runtimeView.updateRuntimeView(auth.snapshot, providerReadiness);
            }
          },
          'add-sequence-step': async () => {
            addSequenceStepRow();
          },
          'move-sequence-step': async (dataset) => {
            moveSequenceStepRow(dataset?.stepIndex || dataset?.index || -1, dataset?.direction || 'down');
          },
          'remove-sequence-step': async (dataset) => {
            const index = Number(dataset?.stepIndex || dataset?.index || -1);
            const rows = Array.from(sequenceStepList?.querySelectorAll('[data-sequence-step-value]') || []);
            if (rows.length <= 1) return;
            const nextValues = rows
              .filter((_, rowIndex) => rowIndex !== index)
              .map((row) => row.value);
            renderSequenceStepRows(nextValues);
          },
          'load-sequence': async (dataset) => {
            const sequenceId = String(dataset?.sequenceId || '').trim();
            const sequence = Array.isArray(auth.snapshot?.sequences)
              ? auth.snapshot.sequences.find((item) => item.id === sequenceId)
              : null;
            if (!sequence) {
              throw new Error('Select a saved sequence first.');
            }
            openSequenceModal(sequence);
          },
          'save-channel-readiness': async (dataset) => {
            await previewActions.saveChannelReadiness(dataset?.providerKey || '');
          },
          'copy-webhook-url': async (dataset = {}) => {
            const url = String(dataset?.webhookUrl || '').trim();
            if (!url) {
              throw new Error('No webhook URL available to copy.');
            }
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(url);
              toast(`${dataset?.webhookLabel || 'Webhook'} callback copied.`);
              return;
            }
            const textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.setAttribute('readonly', 'true');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            toast(`${dataset?.webhookLabel || 'Webhook'} callback copied.`);
          },
          'save-sequence': async () => {
            await previewActions.saveFollowUpSequenceRecord();
            if (auth.selectedSequenceId) {
              saveAppState({ selectedSequenceId: auth.selectedSequenceId });
            }
            closeSequenceModal();
          },
          'search-workspace': async (dataset = {}) => {
            const query = String(dataset?.query || searchInput?.value || '').trim();
            await previewActions.searchWorkspace(query);
          },
          'connect-gmail': () => previewActions.openProviderConnect('gmail'),
          'connect-whatsapp': () => previewActions.openProviderConnect('whatsapp'),
          'test-gmail-webhook': () => previewActions.testGmailWebhookRelay(),
          'test-whatsapp-webhook': () => previewActions.testWhatsAppWebhookRelay(),
          'reset-provider-relay': async (dataset = {}) => {
            await previewActions.resetProviderRelaySetup(dataset?.providerKey || dataset?.provider || '');
          },
          'seed-gmail-thread': () => previewActions.seedProviderThread('gmail'),
          'seed-whatsapp-thread': () => previewActions.seedProviderThread('whatsapp'),
          'save-agent-config': previewActions.saveAgentConfig
        },
        toast,
        setAuthStatus,
        setAiStatus,
        setIngestStatus,
        handleConversationSelect: async (conversationId) => {
          auth.selectedConversationId = conversationId;
          saveAppState({ selectedConversationId: conversationId });
          if (auth.snapshot) {
            runtimeView.updateRuntimeView(auth.snapshot, providerReadiness);
          }
        },
        handleProviderConnect: previewActions.openProviderConnect,
        handleWorkspaceSelect: (workspaceId) => authFlow.selectWorkspace(workspaceId),
        syncScreenFromRoute
      });

      applyThemePreference(themeState.preference, { persist: false });
      setShellVisible(false);
      setScreen(activeScreen, { persist: false, replace: true });
      await authFlow.restoreSession();
      await hydrateRuntimeData();
      if (auth.workspaceId) {
        try {
          await previewActions.refreshWorkflowQueue();
        } catch (error) {
          console.warn('Initial workflow queue load failed.', error);
        }
        try {
          await previewActions.refreshSyncJobs();
        } catch (error) {
          console.warn('Initial sync jobs load failed.', error);
        }
        try {
          await previewActions.refreshReliabilityPanel();
        } catch (error) {
          console.warn('Initial reliability panel load failed.', error);
        }
      }
      if (auth.workspaceId) {
        startLiveSync();
        startWorkspaceRealtime();
      }

