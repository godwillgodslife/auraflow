export function renderPreviewLayout() {
  return String.raw`
    <section class="auth-overlay" data-auth-overlay>
      <div class="auth-shell auth-gate auth-shell-premium">
        <article class="auth-panel hero-auth auth-hero-panel">
          <div class="auth-hero-copy">
            <div class="auth-brand-lockup">
              <img class="auth-brand-logo auth-brand-logo-dark-theme" src="/assets/brand/logo.png" alt="AuraFlow" />
              <img class="auth-brand-logo auth-brand-logo-light-theme" src="/assets/brand/logo-dark.png" alt="" aria-hidden="true" />
              <div class="auth-brand-meta">
                <span class="eyebrow">Supabase auth</span>
                <strong>AI Support OS</strong>
              </div>
            </div>
            <h2>Sign in to AuraFlow</h2>
            <p>Access your workspace, customer conversations, AI replies, and channel readiness from one calm operator console.</p>
            <div class="auth-trust-row section-gap-xs">
              <span class="auth-trust-pill">Workspace scoped</span>
              <span class="auth-trust-pill">Email confirmation supported</span>
            </div>
            <form class="auth-form" data-auth-form>
              <label><span>Email address</span><input id="auth-email" type="email" autocomplete="email" placeholder="founder@company.com" /></label>
              <label><span>Password</span><input id="auth-password" type="password" autocomplete="current-password" placeholder="********" /></label>
              <div class="auth-action-row">
                <button class="primary-button" type="submit">Sign in</button>
                <button class="ghost-button" type="button" data-signup-action>Create account</button>
              </div>
            </form>
            <p class="muted auth-note">Use sign in for an existing user. Use create account once for a new workspace owner, then confirm the Supabase email if prompted.</p>
            <div class="mini-status muted auth-status-banner" data-auth-status>Sign in to load the workspace.</div>
          </div>
          <div class="auth-hero-visual" aria-hidden="true">
            <div class="auth-visual-shell">
              <div class="auth-visual-orbit">
                <div class="auth-orbit-ring ring-one">
                  <span class="auth-orbit-node gmail">Gmail</span>
                  <span class="auth-orbit-node whatsapp">WhatsApp</span>
                  <span class="auth-orbit-node meta">Meta</span>
                  <span class="auth-orbit-node voice">Voice</span>
                  <span class="auth-orbit-node sms">SMS</span>
                </div>
                <div class="auth-orbit-core">
                  <img src="/assets/brand/logo-mark.png" alt="" />
                </div>
              </div>
              <div class="auth-glance-card auth-glance-primary">
                <span class="eyebrow">Operator view</span>
                <strong>Support, follow-up, and channel readiness in one workspace.</strong>
                <p>Enough context to orient the user, without turning sign-in into a product tour.</p>
              </div>
            </div>
          </div>
        </article>

        <div class="auth-side">
          <article class="auth-panel">
            <p class="eyebrow">Workspace bootstrap</p>
            <h3>Load your workspace</h3>
            <div class="workspace-picker" data-workspace-list></div>
            <p class="muted auth-note">Sign in first, then AuraFlow can load your existing workspace or bootstrap one if your account is still empty. If the account is brand new, check your email confirmation before trying to sign in again.</p>
            <button class="ghost-button" type="button" data-create-workspace>Sign in and bootstrap workspace</button>
          </article>

          <article class="auth-panel">
            <div class="panel-head compact">
              <div>
                <p class="eyebrow">Appearance</p>
                <h3>Theme preference</h3>
              </div>
              <span class="badge neutral" data-theme-status>System</span>
            </div>
            <p class="muted auth-note">Pick the original light AuraFlow palette, keep the darker operator shell, or let AuraFlow follow the browser and device automatically.</p>
            <div class="segmented-control section-gap-sm" data-theme-controls>
              <button class="chip" type="button" data-action="set-theme-preference" data-theme-preference="system">System</button>
              <button class="chip" type="button" data-action="set-theme-preference" data-theme-preference="light">Light</button>
              <button class="chip" type="button" data-action="set-theme-preference" data-theme-preference="dark">Dark</button>
            </div>
            <div class="mini-status muted section-gap-sm" data-theme-help>System mode automatically follows the user's browser and device appearance.</div>
          </article>

          <article class="auth-panel">
            <p class="eyebrow">Session persistence</p>
            <p>Your login session and selected workspace remain active on refresh.</p>
            <div class="check-item"><span>OK</span><div><strong>Auth session</strong><span>Stored locally until sign out</span></div></div>
            <div class="check-item"><span>OK</span><div><strong>Workspace ID</strong><span>Saved for future app loads</span></div></div>
            <div class="check-item"><span>OK</span><div><strong>Support contact</strong><span>Neway Marketing Enterprises | Port Harcourt, Nigeria</span></div></div>
          </article>
        </div>
        <div class="legal-footer auth-legal-footer">
          <div class="legal-meta-stack">
            <span class="mini-status muted">Neway Marketing Enterprises</span>
            <span class="mini-status muted">Port Harcourt, Nigeria | newayagency247@gmail.com</span>
          </div>
          <div class="legal-links">
            <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
            <a href="/data-deletion" target="_blank" rel="noreferrer">Data Deletion</a>
            <a href="mailto:newayagency247@gmail.com">Contact</a>
          </div>
        </div>
      </div>
    </section>

    <div class="app-shell simple-shell" hidden>
      <aside class="sidebar" aria-label="Primary">
        <div class="sidebar-mobile-head">
          <div class="brand-block">
            <img class="brand-logo brand-logo-dark-theme" src="/assets/brand/logo.png" alt="AuraFlow" />
            <img class="brand-logo brand-logo-light-theme" src="/assets/brand/logo-dark.png" alt="" aria-hidden="true" />
            <div class="brand-copy">
              <div class="brand-subtitle">AI Support OS</div>
            </div>
          </div>
          <button class="icon-button mobile-close" type="button" data-close-nav>Close</button>
        </div>

        <button class="workspace-switcher" type="button" data-screen="home">
          <div>
            <div class="workspace-label">Workspace</div>
            <strong>Northstar Commerce</strong>
          </div>
          <span class="workspace-pill" data-runtime-badge>Support team</span>
        </button>

        <nav class="nav-groups">
          <section class="nav-group">
            <h2>Support ops</h2>
            <div class="nav-list">
              <button class="nav-item active" type="button" data-screen="home"><span class="nav-item-icon">HM</span><span class="nav-item-copy"><span class="nav-item-label">Home</span><span class="nav-item-hint">Overview</span></span></button>
              <button class="nav-item" type="button" data-screen="agent"><span class="nav-item-icon">AG</span><span class="nav-item-copy"><span class="nav-item-label">Agent</span><span class="nav-item-hint">Build + rules</span></span></button>
              <button class="nav-item" type="button" data-screen="inbox"><span class="nav-item-icon">IN</span><span class="nav-item-copy"><span class="nav-item-label">Inbox</span><span class="nav-item-hint">Customer chats</span></span></button>
              <button class="nav-item" type="button" data-screen="deploy"><span class="nav-item-icon">DP</span><span class="nav-item-copy"><span class="nav-item-label">Deploy</span><span class="nav-item-hint">Channels</span></span></button>
              <button class="nav-item" type="button" data-screen="outreach"><span class="nav-item-icon">FL</span><span class="nav-item-copy"><span class="nav-item-label">Follow-up</span><span class="nav-item-hint">Email sequences</span></span></button>
            </div>
          </section>
          <section class="nav-group">
            <h2>Platform</h2>
            <div class="nav-list">
              <button class="nav-item" type="button" data-screen="data"><span class="nav-item-icon">DT</span><span class="nav-item-copy"><span class="nav-item-label">Data</span><span class="nav-item-hint">Sources + training</span></span></button>
              <button class="nav-item" type="button" data-screen="analytics"><span class="nav-item-icon">AN</span><span class="nav-item-copy"><span class="nav-item-label">Analytics</span><span class="nav-item-hint">Performance</span></span></button>
              <button class="nav-item" type="button" data-screen="settings"><span class="nav-item-icon">ST</span><span class="nav-item-copy"><span class="nav-item-label">Settings</span><span class="nav-item-hint">Workspace</span></span></button>
            </div>
          </section>
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-status-row">
            <span class="status-dot success"></span>
            <span class="mini-status" data-supabase-state>Workspace connected</span>
          </div>
          <div class="mini-status muted" data-nango-state>Channels loading...</div>
          <div class="mini-status muted sidebar-role" data-workspace-role>Owner</div>
        </div>
      </aside>

      <button class="backdrop" aria-label="Close navigation" type="button" data-close-nav hidden></button>

      <div class="main-shell">
        <header class="topbar">
          <div class="topbar-heading">
            <button class="icon-button mobile-menu topbar-menu-btn" type="button" data-open-nav aria-label="Open navigation">
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true"><rect width="18" height="2" rx="1" fill="currentColor"/><rect y="6" width="13" height="2" rx="1" fill="currentColor"/><rect y="12" width="18" height="2" rx="1" fill="currentColor"/></svg>
            </button>
            <div class="topbar-title-block">
              <h1 data-topbar-title>Home</h1>
              <p class="lead" data-topbar-lead>See leads, AI activity, and channel readiness at a glance.</p>
            </div>
          </div>
          <div class="topbar-actions">
            <form class="topbar-search" data-search-form>
              <span class="topbar-search-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 10L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </span>
              <input type="search" data-search-input placeholder="Search contacts, chats..." aria-label="Search workspace" />
              <button class="topbar-search-clear" type="button" data-action="clear-search" aria-label="Clear search">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
            </form>
            <button class="icon-button topbar-refresh-btn" type="button" data-action="refresh-runtime" aria-label="Refresh workspace" title="Refresh">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 2.5C12.1 1 10.15 0.5 8 0.5A7.5 7.5 0 1 0 15.5 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10.5 2.5H13.5V5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </header>

        <main class="page-shell">
          <section class="panel welcome-tour" data-welcome-tour hidden>
            <div class="panel-head compact">
              <div>
                <p class="eyebrow">Welcome</p>
                <h2>Link your first channels</h2>
              </div>
              <span class="badge accent" data-welcome-tour-badge>New workspace</span>
            </div>
            <p class="lead" data-welcome-tour-copy>Start in Settings, connect Facebook and WhatsApp, then return to Deploy to verify webhooks and go live.</p>
            <div class="source-list">
              <div class="check-item"><span>1</span><div><strong>Open Settings</strong><span>Use the Connections card to link your Facebook page and WhatsApp workspace accounts.</span></div></div>
              <div class="check-item"><span>2</span><div><strong>Finish Deploy checks</strong><span>Confirm webhook health and routing once the accounts are connected.</span></div></div>
              <div class="check-item"><span>3</span><div><strong>Watch the inbox</strong><span>New leads and chats will start landing in one operator queue.</span></div></div>
            </div>
            <div class="composer-actions">
              <button class="ghost-button compact" type="button" data-action="dismiss-welcome-tour">Dismiss</button>
              <button class="primary-button compact" type="button" data-action="focus-settings">Open Settings</button>
            </div>
          </section>
          <section class="panel search-panel" data-search-section hidden>
            <div class="panel-head compact">
              <div>
                <p class="eyebrow">Search</p>
                <h2>Workspace results</h2>
              </div>
              <span class="badge neutral" data-search-status>Search the workspace to surface contacts, conversations, messages, and activity.</span>
            </div>
            <div class="search-results-panel" data-search-results>
              <div class="mini-status muted">Enter a query above to search the workspace.</div>
            </div>
          </section>
          <section class="workspace-grid">
            <article class="panel panel-wide" data-section="home">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Home</p>
                  <h2>At a glance</h2>
                  <p class="lead">A quick read on lead flow, AI activity, and channel readiness before you drop into the queue.</p>
                </div>
                <span class="badge accent" data-home-health-badge>System view</span>
              </div>
              <div class="grid stats-grid compact home-stats-grid">
                <article class="stat-card">
                  <span class="eyebrow">Leads this week</span>
                  <strong data-home-leads-week>0</strong>
                  <div class="stat-delta neutral" data-home-leads-detail>Waiting for lead traffic.</div>
                </article>
                <article class="stat-card">
                  <span class="eyebrow">AI responses sent</span>
                  <strong data-home-ai-sent>0</strong>
                  <div class="stat-delta neutral" data-home-ai-detail>Outbound AI activity will appear here.</div>
                </article>
                <article class="stat-card">
                  <span class="eyebrow">Channel health</span>
                  <strong data-home-channel-health>0/4</strong>
                  <div class="stat-delta neutral" data-home-channel-detail>No connected channels yet.</div>
                </article>
              </div>
              <div class="two-column simple-two-column">
                <article class="focus-card">
                  <div class="focus-top">
                    <span class="badge neutral">Overview</span>
                    <strong>Team pulse</strong>
                  </div>
                  <p data-home-summary-copy>Once your workspace is connected, AuraFlow will summarize operator load, active leads, and channel readiness here.</p>
                </article>
                <article class="focus-card">
                  <div class="focus-top">
                    <span class="badge accent">Next move</span>
                    <strong>Suggested action</strong>
                  </div>
                  <p data-home-next-step>Start in Settings to choose your theme and link Gmail, Facebook, and WhatsApp for this workspace.</p>
                  <div class="composer-actions">
                    <button class="ghost-button compact" type="button" data-action="focus-settings">Open Settings</button>
                    <button class="primary-button compact" type="button" data-action="focus-inbox">Open Inbox</button>
                  </div>
                </article>
              </div>
              <article class="panel-subcard section-gap-lg">
                <div class="panel-head compact">
                  <div>
                    <p class="eyebrow">Highlights</p>
                    <h3>Operational watchlist</h3>
                  </div>
                </div>
                <div class="source-list" data-home-highlights>
                  <div class="check-item"><span>...</span><div><strong>Waiting for workspace data</strong><span>Highlights will appear here once AuraFlow loads live leads, AI activity, and channels.</span></div></div>
                </div>
              </article>
            </article>
            <article class="panel" data-section="inbox">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Inbox</p>
                  <h2>Live conversations</h2>
                  <p class="lead">Work the thread, understand the context, and reply from one place.</p>
                </div>
                <span class="badge accent" data-inbox-count>0 waiting</span>
              </div>
              <div class="inbox-layout">
                <div class="auth-panel inbox-list-panel">
                  <div class="filter-row" data-inbox-filters>
                    <button class="chip active" type="button" data-action="set-inbox-filter" data-inbox-filter="all">All</button>
                    <button class="chip" type="button" data-action="set-inbox-filter" data-inbox-filter="high_priority">High priority</button>
                    <button class="chip" type="button" data-action="set-inbox-filter" data-inbox-filter="failed">Failed sends</button>
                    <button class="chip" type="button" data-action="set-inbox-filter" data-inbox-filter="attention">Needs attention</button>
                    <button class="chip" type="button" data-action="set-inbox-filter" data-inbox-filter="verified">Verified live</button>
                    <button class="chip" type="button" data-action="set-inbox-filter" data-inbox-filter="test">Test only</button>
                  </div>
                  <div class="mini-status muted" data-inbox-list-status>Threads will sort by urgency and live confidence once the workspace loads.</div>
                  <div class="conversation-list" data-dashboard-conversations>
                    <div class="mini-status muted">Conversations will appear here as channels come online.</div>
                  </div>
                </div>
                <div class="auth-panel inbox-detail-panel">
                  <div class="panel-head">
                    <div>
                      <p class="eyebrow">Conversation detail</p>
                      <h3 data-selected-conversation-title>Select a conversation</h3>
                    </div>
                    <span class="badge neutral" data-selected-conversation-channel>Not selected</span>
                  </div>
                  <div class="detail-meta">
                    <div><span>Status</span><strong data-selected-conversation-status>Not loaded</strong></div>
                    <div><span>Owner</span><strong data-selected-conversation-owner>Unassigned</strong></div>
                    <div><span>Last update</span><strong data-selected-conversation-updated>Recently</strong></div>
                  </div>
                  <div class="mini-status muted" data-thread-priority-summary>Priority reasoning will appear here once a thread is selected.</div>
                  <div class="thread" data-message-thread>
                    <div class="mini-status muted">Message history will appear here once a thread is selected.</div>
                  </div>
                  <div class="composer-card">
                    <div class="panel-head compact">
                      <div>
                        <p class="eyebrow">AI assist</p>
                        <h3>Brief, draft, and route</h3>
                      </div>
                      <div class="composer-actions ai-tool-actions">
                        <button class="primary-button compact" type="button" data-action="generate-ai-briefing">Run AI brief</button>
                        <button class="ghost-button compact" type="button" data-action="generate-ai-summary">Summarize</button>
                        <button class="ghost-button compact" type="button" data-action="generate-ai-classification">Classify</button>
                        <button class="ghost-button compact" type="button" data-action="generate-ai-next-action">Next action</button>
                        <button class="ghost-button compact" type="button" data-action="generate-ai-reply">Draft reply</button>
                      </div>
                      </div>
                      <div class="mini-status muted" data-ai-status>Select a thread to generate an AI brief, recommendation, or reply draft.</div>
                      <div data-ai-operator-lane>
                        <div class="check-item"><span>AI</span><div><strong>AI lane ready</strong><span>Select a thread to see whether AI should reply, hand off, assign, or push follow-up.</span></div><span class="badge neutral">Idle</span></div>
                      </div>
                      <div class="detail-meta">
                        <div><span>Summary</span><strong data-ai-summary>No summary yet.</strong></div>
                      <div><span>Classification</span><strong data-ai-classification>No classification yet.</strong></div>
                      <div><span>Next action</span><strong data-ai-next-action>No recommendation yet.</strong></div>
                    </div>
                    <div data-ai-recommendation>
                      <div class="check-item"><span>AI</span><div><strong>No recommendation yet</strong><span>Run AI brief to populate summary, routing guidance, and a reply draft together.</span></div><span class="badge neutral">Idle</span></div>
                      </div>
                      <textarea rows="6" data-ai-reply-output placeholder="AI draft reply will appear here."></textarea>
                      <div class="modal-grid section-gap-sm">
                        <label><span>WhatsApp send mode</span>
                          <select data-reply-template-mode>
                            <option value="auto">Auto</option>
                            <option value="freeform">Free-form</option>
                            <option value="lead_intro">Lead intro template</option>
                            <option value="appointment_reminder">Appointment reminder template</option>
                          </select>
                        </label>
                      </div>
                      <div class="mini-status muted" data-reply-template-status>Auto will use free-form inside the active customer window and suggest a template when policy likely requires it.</div>
                      <div class="mini-status muted" data-reply-status>Send now publishes immediately. Queue for later keeps the draft attached to this thread.</div>
                      <div class="composer-actions reply-send-actions">
                        <button class="ghost-button compact" type="button" data-action="retry-last-reply">Retry failed</button>
                        <button class="ghost-button compact" type="button" data-action="queue-reply">Queue for later</button>
                        <button class="primary-button compact" type="button" data-action="send-reply">Send now</button>
                    </div>
                  </div>
                  <div class="composer-card">
                    <div class="panel-head compact">
                      <div>
                        <p class="eyebrow">Reply target</p>
                        <h3>Send destination</h3>
                      </div>
                    </div>
                    <div class="mini-status muted" data-reply-target>Send target details will appear here for the selected conversation.</div>
                    <div class="composer-actions section-gap-sm">
                      <button class="ghost-button compact" type="button" data-action="start-softphone-call">Call lead</button>
                      <button class="ghost-button compact" type="button" data-action="end-softphone-call">End call</button>
                    </div>
                  </div>
                  <div class="composer-card">
                    <div class="panel-head compact">
                      <div>
                        <p class="eyebrow">Live call panel</p>
                        <h3>Softphone bootstrap</h3>
                      </div>
                      <span class="badge neutral" data-softphone-status-badge>Idle</span>
                    </div>
                    <div class="mini-status muted" data-softphone-status>Authorize the browser as a softphone to begin local voice-call testing.</div>
                    <div class="detail-meta compact">
                      <div><span>Softphone</span><strong data-softphone-identity>Not ready</strong></div>
                      <div><span>Session</span><strong data-softphone-session>None</strong></div>
                      <div><span>State</span><strong data-softphone-call-state>Idle</strong></div>
                    </div>
                    <div class="detail-meta compact softphone-live-meta section-gap-sm">
                      <div><span>Call mood</span><strong><span class="badge neutral" data-softphone-mood-badge>Neutral</span></strong></div>
                      <div><span>Transcript</span><strong data-softphone-transcript-status>Waiting for live speech</strong></div>
                      <div><span>Follow-up</span><strong data-softphone-followup-status>Will draft after the call</strong></div>
                    </div>
                    <div class="softphone-transcript-window section-gap-sm" data-softphone-transcript-window>
                      <div class="softphone-transcript-empty mini-status muted" data-softphone-transcript-empty>Operator and lead transcript lines will stream here as the call progresses.</div>
                      <div class="softphone-transcript-list" data-softphone-transcript-list></div>
                    </div>
                    <label class="section-gap-sm">
                      <span>Manual call summary</span>
                      <textarea rows="4" data-softphone-manual-summary placeholder="If the transcript stream drops, type a short recap here so AuraFlow can still draft the next WhatsApp follow-up."></textarea>
                    </label>
                    <div class="composer-actions">
                      <button class="ghost-button compact" type="button" data-action="save-softphone-summary">Save manual summary</button>
                    </div>
                    <div class="mini-status muted section-gap-sm" data-softphone-note>Call state will move from dialing to connected locally while AuraFlow keeps the voice session linked to Supabase.</div>
                  </div>
                  <details class="mobile-accordion" open>
                    <summary>Ownership and handoff</summary>
                    <div class="accordion-section">
                      <div class="grid outcome-grid">
                        <article class="panel-subcard inbox-action-card">
                          <p class="eyebrow">Ownership and escalation</p>
                          <label><span>Assign owner</span><input type="text" data-assignment-input placeholder="Ada" /></label>
                          <div class="mini-status muted">Assign the thread, escalate when it needs human review, and keep the operational state obvious.</div>
                          <div class="composer-actions ownership-actions">
                            <button class="ghost-button compact" type="button" data-action="save-assignment">Save owner</button>
                            <button class="ghost-button compact" type="button" data-action="escalate-conversation">Escalate</button>
                            <button class="ghost-button compact" type="button" data-action="resolve-conversation">Resolve</button>
                            <button class="ghost-button compact" type="button" data-action="reopen-conversation">Reopen</button>
                          </div>
                        </article>
                        <article class="panel-subcard inbox-action-card">
                          <p class="eyebrow">Handoff note</p>
                          <textarea rows="5" data-internal-note-input placeholder="Add context for the next handoff."></textarea>
                          <div class="mini-status muted">Use this for SLA context, billing edge cases, and anything the next operator should see immediately.</div>
                          <div class="composer-actions">
                            <button class="ghost-button compact" type="button" data-action="add-internal-note">Save note</button>
                          </div>
                        </article>
                      </div>
                    </div>
                  </details>
                  <details class="mobile-accordion" open>
                    <summary>Contact context</summary>
                    <article class="accordion-section side-card contact-card" data-contact-detail>
                      <p class="eyebrow">Contact context</p>
                      <div class="source-list">
                        <div class="check-item"><span>*</span><div><strong>No contact selected</strong><span>Contact details, tags, and routing info will appear here.</span></div></div>
                      </div>
                      <div class="tag-list" data-contact-tags-list></div>
                      <label class="modal-full"><span>New tag</span><input type="text" data-contact-tag-input placeholder="VIP" /></label>
                      <div class="composer-actions">
                        <button class="ghost-button compact" type="button" data-action="add-contact-tag">Add tag</button>
                      </div>
                    </article>
                  </details>
                  <details class="mobile-accordion">
                    <summary>Guidance and workflow</summary>
                    <div class="accordion-section">
                      <div class="grid inbox-support-grid">
                        <div class="side-card compact-card" data-reply-guidance>
                          <div class="mini-status muted">Reply guidance will appear here once a thread is selected.</div>
                        </div>
                        <div class="side-card compact-card" data-thread-workflow>
                          <div class="mini-status muted">Thread workflow coverage will appear here once a thread is selected.</div>
                        </div>
                      </div>
                    </div>
                  </details>
                  <details class="mobile-accordion">
                    <summary>Conversation health</summary>
                    <div class="accordion-section">
                      <div class="grid conversation-insights-grid" data-conversation-insights>
                        <div class="mini-status muted">Conversation health will appear here once a thread is selected.</div>
                      </div>
                    </div>
                  </details>
                  <details class="mobile-accordion">
                    <summary>Activity log</summary>
                    <article class="accordion-section side-card">
                      <p class="eyebrow">Activity log</p>
                      <div class="source-list" data-activity-log>
                        <div class="check-item"><span>*</span><div><strong>No activity yet</strong><span>Assignments, notes, and workflow updates will appear here.</span></div></div>
                      </div>
                    </article>
                  </details>
                </div>
              </div>
            </article>

              <article class="panel deploy-panel" data-section="deploy">
                <div class="panel-head deploy-head">
                  <div>
                    <p class="eyebrow">Deploy</p>
                    <h2>Channel connections</h2>
                    <p class="lead">See what is live now, what still needs provider setup, and the next action for each channel.</p>
                  </div>
                  <span class="badge accent">Operational</span>
                </div>

                <div class="deploy-hero">
                  <div class="deploy-hero-copy">
                    <strong>Production readiness, without guesswork</strong>
                    <p>Gmail stays on its direct path. WhatsApp, Instagram, and Messenger should read as Twilio Conversations channels with one shared webhook receiver and one shared operator model.</p>
                  </div>
                  <div class="composer-actions deploy-hero-actions">
                    <button class="primary-button compact" type="button" data-action="sync-configured-channels">Sync configured channels</button>
                    <button class="ghost-button compact" type="button" data-action="refresh-reliability">Refresh reliability</button>
                  </div>
                </div>

                <article class="panel-subcard section-gap-md">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">AI deployment guide</p>
                      <h3>Current rollout signal</h3>
                    </div>
                    <span class="badge neutral" data-ai-deploy-status>Idle</span>
                  </div>
                  <div class="source-list" data-ai-deploy-brief>
                    <div class="mini-status muted">Run AI brief from Inbox to bring routing and rollout guidance into Deploy.</div>
                  </div>
                </article>

                <div class="deploy-console">
                  <section class="deploy-primary">
                    <details class="mobile-accordion" open>
                      <summary>Connect workspace</summary>
                      <article class="panel-subcard deploy-setup-card">
                        <div class="panel-head compact">
                          <div>
                            <p class="eyebrow">Connect</p>
                            <h3>Workspace authorizations</h3>
                          </div>
                        </div>
                        <div class="mini-status muted deploy-section-note">Authorize the mailbox first, then prepare the shared Twilio path for social and WhatsApp channels.</div>
                        <div class="deploy-action-grid">
                          <article class="deploy-action-card">
                            <span class="eyebrow">Gmail</span>
                            <strong>Connect Gmail</strong>
                            <p>Authorize a mailbox and confirm the inbound watch path is active.</p>
                            <div class="composer-actions deploy-action-buttons">
                              <button class="primary-button compact" type="button" data-action="connect-gmail">Connect Gmail</button>
                              <button class="ghost-button compact" type="button" data-action="test-gmail-webhook">Test Gmail callback</button>
                            </div>
                          </article>
                          <article class="deploy-action-card">
                            <span class="eyebrow">Twilio</span>
                            <strong>Prepare Twilio channels</strong>
                            <p>Save the webhook targets in AuraFlow, then link WhatsApp, Instagram, and Messenger inside the Twilio Console.</p>
                            <div class="composer-actions deploy-action-buttons">
                              <button class="primary-button compact" type="button" data-action="connect-whatsapp">Prepare Twilio</button>
                              <button class="ghost-button compact" type="button" data-action="test-whatsapp-webhook">Test Twilio callback</button>
                            </div>
                          </article>
                        </div>
                      </article>
                    </details>

                    <details class="mobile-accordion" open>
                      <summary>Provider readiness</summary>
                      <article class="panel-subcard deploy-status-card">
                        <div class="panel-head compact">
                          <div>
                            <p class="eyebrow">System status</p>
                            <h3>Provider readiness</h3>
                          </div>
                        </div>
                        <div class="mini-status muted deploy-section-note">Use this as the operator-facing answer to one question: connected, blocked, or still in setup.</div>
                        <div data-provider-grid>Provider readiness will load here.</div>
                      </article>
                    </details>
                  </section>

                  <aside class="deploy-secondary">
                    <details class="mobile-accordion" open>
                      <summary>Inbound verification</summary>
                      <article class="panel-subcard">
                        <div class="panel-head compact">
                          <div>
                            <p class="eyebrow">Inbound verification</p>
                            <h3>Webhook setup</h3>
                          </div>
                        </div>
                        <div class="mini-status muted deploy-section-note">Keep these callback targets close by during setup, then get out of the way once the provider is verified.</div>
                        <div class="source-list" data-webhook-setup>
                          <div class="check-item">
                            <span>GM</span>
                            <div>
                              <strong>Gmail callback</strong><span>Gmail watch/push</span>
                              <div class="url-pill">
                                <span class="url-pill-text">http://localhost:3005/api/webhook/gmail?workspace_id=6b12900d-8c33-4227-84a8-04ee3e3396cc</span>
                                <button class="ghost-button compact icon-only" title="Copy callback url" type="button">
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="9" height="9" rx="2"/><path d="M10.5 5.5V3.5C10.5 2.39543 9.60457 1.5 8.5 1.5H2.5C1.39543 1.5 0.5 2.39543 0.5 3.5V9.5C0.5 10.6046 1.39543 11.5 2.5 11.5H4.5"/></svg>
                                </button>
                              </div>
                            </div>
                          </div>
                          <div class="check-item">
                            <span>TW</span>
                            <div>
                              <strong>Twilio callback</strong><span>Conversations webhook receiver</span>
                              <div class="url-pill">
                                <span class="url-pill-text">https://your-project.supabase.co/functions/v1/api-webhook?provider=whatsapp&amp;workspace_id=6b12900d-8c33-4227-84a8-04ee3e3396cc</span>
                                <button class="ghost-button compact icon-only" title="Copy callback url" type="button">
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="9" height="9" rx="2"/><path d="M10.5 5.5V3.5C10.5 2.39543 9.60457 1.5 8.5 1.5H2.5C1.39543 1.5 0.5 2.39543 0.5 3.5V9.5C0.5 10.6046 1.39543 11.5 2.5 11.5H4.5"/></svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    </details>

                    <details class="mobile-accordion">
                      <summary>Reliability</summary>
                      <article class="panel-subcard">
                        <div class="panel-head compact">
                          <div>
                            <p class="eyebrow">Reliability</p>
                            <h3>Retry and replay health</h3>
                          </div>
                        </div>
                        <div class="mini-status muted" data-reliability-status>Queue backlog, replay health, and failed workflow jobs will appear here.</div>
                        <div class="source-list" data-reliability-panel>
                          <div class="check-item"><span>*</span><div><strong>No replay diagnostics yet</strong><span>Webhook attempts and retrying jobs will appear after the first delivery or workflow retry.</span></div></div>
                        </div>
                      </article>
                    </details>
                  </aside>
                </div>
              </article>

            <article class="panel" data-section="agent">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Agent</p>
                  <h2>AI behavior and operator support</h2>
                  <p class="lead">Control how the agent writes, escalates, and supports the team.</p>
                </div>
                <span class="badge accent">Workspace scoped</span>
              </div>
                <div class="agent-console">
                  <div class="grid agent-top-grid">
                    <details class="mobile-accordion" open>
                      <summary>Agent configuration</summary>
                      <article class="panel-subcard">
                        <p class="eyebrow">Configuration</p>
                        <div class="mini-status muted agent-section-note">Set the shared writing posture, escalation tone, and instructions that shape every supported channel.</div>
                        <div class="modal-grid">
                          <label><span>Name</span><input type="text" data-agent-name placeholder="Northstar Support Agent" /></label>
                          <label><span>Tone</span><input type="text" data-agent-tone placeholder="Direct, calm, concise" /></label>
                          <label><span>Status</span><input type="text" data-agent-status placeholder="active" /></label>
                          <label><span>Knowledge sources</span><input type="text" data-agent-sources placeholder="Docs, policies, resolved threads" /></label>
                        </div>
                        <div class="form-field-full">
                          <label class="form-label" for="agent-instructions">Instructions</label>
                          <textarea id="agent-instructions" rows="7" data-agent-instructions placeholder="Tell the agent how to respond, when to escalate, and what to avoid."></textarea>
                        </div>
                        <div class="agent-config-footer">
                          <div class="mini-status muted" data-agent-status-note>Save to persist agent config in Supabase.</div>
                          <div class="composer-actions agent-config-actions">
                            <button class="primary-button compact" type="button" data-action="save-agent-config">Save agent config</button>
                          </div>
                        </div>
                      </article>
                    </details>
                    <details class="mobile-accordion" open>
                      <summary>Knowledge and live context</summary>
                      <div class="accordion-section agent-side-stack">
                        <article class="panel-subcard">
                          <div class="panel-head compact">
                            <div>
                              <p class="eyebrow">Knowledge base</p>
                              <h3>Grounding and source health</h3>
                            </div>
                          </div>
                          <div class="mini-status muted" data-agent-source-list>Knowledge sources and imported workspace material will appear here once the workspace snapshot loads.</div>
                        </article>
                        <article class="panel-subcard">
                          <div class="panel-head compact">
                            <div>
                              <p class="eyebrow">AI live state</p>
                              <h3>Current thread context</h3>
                            </div>
                          </div>
                          <div class="source-list">
                            <div class="check-item"><span>AI</span><div><strong data-ai-live-thread>No conversation selected</strong><span data-ai-live-note>Choose a thread in Inbox before using AI actions.</span></div><span class="badge neutral" data-ai-live-status>Select a conversation</span></div>
                          </div>
                        </article>
                      </div>
                    </details>
                  </div>
                <div class="grid agent-mid-grid">
                  <details class="mobile-accordion" open>
                    <summary>Guardrails</summary>
                    <article class="panel-subcard">
                      <div class="panel-head compact">
                        <div>
                          <p class="eyebrow">Guardrails</p>
                          <h3>Operational readiness</h3>
                        </div>
                      </div>
                        <div class="source-list" data-agent-guardrails>
                          <div class="check-item"><span>*</span><div><strong>Guardrail review pending</strong><span>Escalation posture, knowledge coverage, and instruction depth will show here.</span></div></div>
                        </div>
                    </article>
                  </details>
                  <details class="mobile-accordion">
                    <summary>Workflow queue</summary>
                    <article class="panel-subcard">
                      <div class="panel-head compact">
                        <div>
                          <p class="eyebrow">Workflow queue</p>
                          <h3>Queued support actions</h3>
                        </div>
                      </div>
                      <div class="mini-status muted" data-workflow-queue-status>Queued and escalated work will appear here.</div>
                      <div class="source-list" data-workflow-queue-list>
                        <div class="check-item"><span>*</span><div><strong>No queued workflow yet</strong><span>Queued replies, handoffs, and escalations will appear here.</span></div></div>
                      </div>
                      <div class="modal-grid section-gap-sm">
                        <label><span>Assignee</span><input type="text" data-workflow-assignee placeholder="Ada" /></label>
                        <label><span>Operator note</span><input type="text" data-workflow-note placeholder="Escalate if billing context is unclear" /></label>
                      </div>
                    </article>
                  </details>
                </div>
                <details class="mobile-accordion agent-sequence-accordion">
                  <summary>Follow-up engine</summary>
                  <article class="panel-subcard agent-sequence-card">
                    <div class="panel-head compact">
                      <div>
                        <p class="eyebrow">Follow-up engine</p>
                        <h3 data-sequence-editor-title>Sequence engine</h3>
                      </div>
                      <div class="composer-actions">
                        <button class="ghost-button compact" type="button" data-action="add-sequence-step">Add step</button>
                        <button class="primary-button compact" type="button" data-action="save-sequence">Save sequence</button>
                      </div>
                      </div>
                      <div class="mini-status muted" data-sequence-status-note>Active sequences, delivery confidence, and next-run planning will appear here.</div>
                      <div class="source-list section-gap-xs" data-followup-coverage>
                        <div class="check-item"><span>*</span><div><strong>Coverage pending</strong><span>High-priority threads without sequence coverage will show here.</span></div></div>
                      </div>
                      <div class="inbox-layout section-gap-sm">
                      <div class="auth-panel inbox-list-panel">
                        <div class="source-list" data-followup-list>
                          <div class="mini-status muted">Saved follow-up sequences will appear here.</div>
                        </div>
                      </div>
                      <div class="auth-panel inbox-detail-panel">
                        <input type="hidden" data-sequence-id />
                        <div class="modal-grid">
                          <label><span>Name</span><input type="text" data-sequence-name placeholder="Post-demo follow-up" /></label>
                          <label><span>Status</span><input type="text" data-sequence-status placeholder="active" /></label>
                          <label><span>Trigger</span><input type="text" data-sequence-trigger placeholder="No reply after 48 hours" /></label>
                          <label><span>Channel mix</span><input type="text" data-sequence-channel placeholder="Email + WhatsApp" /></label>
                          <label><span>WhatsApp mode</span>
                            <select data-sequence-template-mode>
                              <option value="auto">Auto</option>
                              <option value="freeform">Free-form</option>
                              <option value="lead_intro">Lead intro template</option>
                              <option value="appointment_reminder">Appointment reminder template</option>
                            </select>
                          </label>
                          <label><span>Goal</span><input type="text" data-sequence-goal placeholder="Recover the lead or book a call" /></label>
                          <label><span>Owner</span><input type="text" data-sequence-owner placeholder="Sales + Support" /></label>
                          <label><span>Step count</span><input type="number" min="0" data-sequence-steps placeholder="3" /></label>
                          <label><span>Reply rate</span><input type="text" data-sequence-replies placeholder="12.8%" /></label>
                          <label><span>Delivery rate</span><input type="text" data-sequence-deliveries placeholder="96.4%" /></label>
                          <label><span>Next run</span><input type="text" data-sequence-next-run placeholder="Today, 4:00 PM" /></label>
                        </div>
                        <div class="mini-status muted section-gap-sm" data-sequence-template-status>Auto keeps WhatsApp sequence steps free-form while the thread is active and switches to a template-backed posture when the policy window is likely closed.</div>
                        <div class="panel-head compact section-gap-sm">
                          <div>
                            <p class="eyebrow">Steps</p>
                            <h3>Sequence timeline</h3>
                          </div>
                        </div>
                        <div class="source-list sequence-step-list" data-sequence-step-list>
                          <div class="mini-status muted">Sequence steps will appear here when a workflow is loaded.</div>
                        </div>
                        <label class="modal-full section-gap-sm"><span>Operator notes</span><textarea rows="4" data-sequence-notes placeholder="Describe the follow-up logic, escalation handoff, or promise this sequence makes to customers."></textarea></label>
                      </div>
                    </div>
                  </article>
                </details>
              </div>
            </article>

            <article class="panel" data-section="outreach">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Follow-up</p>
                  <h2>Email sequences</h2>
                  <p class="lead">Automate outreach with multi-step sequences sent across email and WhatsApp.</p>
                </div>
                <button class="ghost-button compact" type="button" data-action="open-sequence-modal">New sequence</button>
              </div>
              <div class="grid outcome-grid section-gap-sm">
                <article class="panel-subcard">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">AI follow-up plan</p>
                      <h3>Suggested sequence</h3>
                    </div>
                    <span class="badge neutral" data-ai-followup-status>Idle</span>
                  </div>
                  <div class="source-list" data-ai-followup-brief>
                    <div class="mini-status muted">Run AI brief from Inbox to create a sequence suggestion for the active thread.</div>
                  </div>
                </article>
                <article class="panel-subcard">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">AI sequence studio</p>
                      <h3>Apply the plan</h3>
                    </div>
                    <span class="badge neutral" data-ai-outreach-status>Idle</span>
                  </div>
                  <div class="source-list" data-ai-outreach-guide>
                    <div class="mini-status muted">AI will turn the current thread into an outreach plan here.</div>
                  </div>
                  <div class="composer-actions section-gap-sm">
                    <button class="ghost-button compact" type="button" data-action="apply-ai-sequence">Load into sequence</button>
                    <button class="ghost-button compact" type="button" data-action="apply-ai-email-variant">Rewrite for email</button>
                    <button class="ghost-button compact" type="button" data-action="apply-ai-whatsapp-variant">Rewrite for WhatsApp</button>
                  </div>
                </article>
                <article class="panel-subcard">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">Lead intake</p>
                      <h3>AI qualification</h3>
                    </div>
                    <span class="badge neutral" data-ai-lead-status>Idle</span>
                  </div>
                  <div class="source-list" data-ai-lead-brief>
                    <div class="mini-status muted">Lead scoring, ownership, and next-touch guidance will appear here after an AI brief.</div>
                  </div>
                </article>
              </div>
              <div class="automation-list">
                <article class="automation-card">
                  <div class="automation-top"><span class="badge success">Live</span><span class="badge neutral">3 steps</span></div>
                  <strong>Post-demo follow-up</strong>
                  <p>Send recap, answer objections, and remind the lead after 48 hours.</p>
                  <div class="automation-footer"><span>42 sent today</span><strong>Email + WhatsApp</strong></div>
                </article>
                <article class="automation-card">
                  <div class="automation-top"><span class="badge success">Live</span><span class="badge neutral">5 steps</span></div>
                  <strong>Cold outreach</strong>
                  <p>Reach out to new prospects with a short intro, value proposition, and booking link.</p>
                  <div class="automation-footer"><span>91 sent today</span><strong>Email</strong></div>
                </article>
                <article class="automation-card">
                  <div class="automation-top"><span class="badge warning">Draft</span><span class="badge neutral">Needs review</span></div>
                  <strong>Abandoned checkout</strong>
                  <p>Recover failed purchases with support-first follow-up and a discount prompt.</p>
                  <div class="automation-footer"><span>13 pending</span><strong>Triggered</strong></div>
                </article>
              </div>
            </article>

            <article class="panel" data-section="data">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Data</p>
                  <h2>Training sources</h2>
                  <p class="lead">Connect documents, past chats, and policies so the agent stays grounded in real material.</p>
                </div>
                <span class="badge neutral">Auto sync on</span>
              </div>
              <div class="source-list">
                <div class="check-item"><span>ðŸ“„</span><div><strong>Website docs</strong><span>Help pages, pricing, and onboarding guides</span></div><span class="badge success">Synced</span></div>
                <div class="check-item"><span>ðŸ’¬</span><div><strong>Past chats</strong><span>Resolved support threads and sales conversations</span></div><span class="badge success">Synced</span></div>
                <div class="check-item"><span>ðŸ§§</span><div><strong>Refund policies</strong><span>Decision tree for approval and escalation</span></div><span class="badge warning">Review needed</span></div>
                <div class="check-item"><span>ðŸ“¦</span><div><strong>Order history</strong><span>Customer purchase context for support replies</span></div><span class="badge neutral">Pending</span></div>
              </div>
              <article class="panel-subcard section-gap-lg">
                <div class="panel-head compact panel-head-with-help">
                  <div>
                    <p class="eyebrow">Leads</p>
                    <h3>Captured lead records</h3>
                    <p class="lead">Meta submissions appear here with contact fields, source details, and reviewer-friendly timestamps.</p>
                  </div>
                  <div class="panel-head-actions">
                    <span class="badge neutral" data-leads-count>0 leads tracked</span>
                    <details class="inline-help">
                      <summary aria-label="How leads data is used">?</summary>
                      <div class="inline-help-popover">
                        Lead data is used only to identify the customer, route the inquiry to the right workspace, and trigger follow-up inside AuraFlow.
                      </div>
                    </details>
                  </div>
                </div>
                <div class="mini-status muted" data-leads-status>Meta and Gmail leads will appear here with source fields, routing details, and capture timestamps.</div>
                <div class="table-card section-gap-sm">
                  <table>
                    <thead><tr><th>Lead</th><th>Source</th><th>Stage</th><th>Contact</th><th>Captured</th></tr></thead>
                    <tbody data-leads-rows>
                      <tr><td colspan="5">No leads captured yet.</td></tr>
                    </tbody>
                  </table>
                </div>
                <article class="panel-subcard section-gap-md">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">Voice analytics</p>
                      <h3>Call intelligence snapshot</h3>
                    </div>
                    <span class="badge neutral" data-voice-analytics-status>Idle</span>
                  </div>
                  <div class="source-list" data-voice-analytics-brief>
                    <div class="check-item"><span>VO</span><div><strong>No analyzed calls yet</strong><span>Deepgram summaries, caller mood, and follow-up readiness will appear here.</span></div><span class="badge neutral">Waiting</span></div>
                  </div>
                </article>
              </article>
              <article class="panel-subcard section-gap-lg">
                <div class="panel-head compact">
                  <div>
                    <p class="eyebrow">Voice intelligence</p>
                    <h3>Deepgram call analysis</h3>
                    <p class="lead">Paste a transcript or a recording URL to capture a smart-formatted summary and the caller's mood.</p>
                  </div>
                  <span class="badge accent">Aura + sentiment</span>
                </div>
                <div class="grid outcome-grid section-gap-sm">
                  <article class="panel-subcard">
                    <label><span>Contact</span><select data-voice-note-contact></select></label>
                    <label><span>Voice profile</span><select data-voice-note-profile></select></label>
                    <label><span>Attach to call session</span><select data-voice-note-session></select></label>
                    <label><span>Title</span><input type="text" data-voice-note-title placeholder="Follow-up call summary" /></label>
                    <label><span>Recording URL (optional)</span><input type="url" data-voice-note-audio-url placeholder="https://..." /></label>
                    <label><span>Transcript or operator notes</span><textarea rows="5" data-voice-note-body placeholder="Paste the call transcript here, or leave this as quick notes if a recording URL is available."></textarea></label>
                    <div class="composer-actions">
                      <button class="ghost-button compact" type="button" data-action="save-voice-note">Save raw note</button>
                      <button class="primary-button compact" type="button" data-action="analyze-voice-note">Analyze with Deepgram</button>
                    </div>
                  </article>
                  <article class="panel-subcard">
                    <p class="eyebrow">Recent call sessions</p>
                    <div class="source-list section-gap-sm" data-voice-sessions-list>
                      <div class="check-item"><span>-</span><div><strong>No call sessions yet</strong><span>Queued and analyzed calls will appear here.</span></div></div>
                    </div>
                    <p class="eyebrow">Recent voice notes</p>
                    <div class="source-list" data-voice-notes-list>
                      <div class="check-item"><span>-</span><div><strong>No voice notes yet</strong><span>Deepgram summaries and caller mood will appear here.</span></div></div>
                    </div>
                  </article>
                </div>
              </article>
              <div class="panel-head section-gap-lg">
                <div>
                  <p class="eyebrow">Add source</p>
                  <h3>Upload or connect</h3>
                </div>
              </div>
              <div class="deploy-action-grid">
                <article class="deploy-action-card">
                  <span class="eyebrow">Document</span>
                  <strong>Upload file</strong>
                  <p>PDF, DOCX, TXT up to 10MB. The agent will learn from the content.</p>
                  <div class="composer-actions"><button class="ghost-button compact" type="button">Upload file</button></div>
                </article>
                <article class="deploy-action-card">
                  <span class="eyebrow">Website</span>
                  <strong>Crawl URL</strong>
                  <p>Enter a URL and the agent will index visible page content automatically.</p>
                  <div class="composer-actions"><button class="ghost-button compact" type="button">Add URL</button></div>
                </article>
              </div>
              <div class="panel-head section-gap-lg">
                <div>
                  <p class="eyebrow">Business knowledge</p>
                  <h3>Northstar playbook</h3>
                  <p class="lead">Store services, pricing, and hours so Aura answers from your business facts first.</p>
                </div>
                <span class="badge neutral" data-business-knowledge-status>No business knowledge saved yet.</span>
              </div>
              <div class="grid outcome-grid">
                <article class="panel-subcard">
                  <input type="hidden" data-business-knowledge-id value="" />
                  <label><span>Topic</span><input type="text" data-business-knowledge-topic placeholder="Services" /></label>
                  <label><span>Question pattern</span><input type="text" data-business-knowledge-question placeholder="What services do you offer?" /></label>
                  <label><span>Answer</span><textarea rows="4" data-business-knowledge-answer placeholder="Northstar Commerce offers ..."></textarea></label>
                  <div class="detail-meta">
                    <label><span>Tags</span><input type="text" data-business-knowledge-tags placeholder="pricing, hours" /></label>
                    <label><span>Priority</span><input type="number" min="0" max="100" step="1" data-business-knowledge-priority value="50" /></label>
                  </div>
                  <div class="composer-actions">
                    <button class="ghost-button compact" type="button" data-action="reset-business-knowledge">Reset</button>
                    <button class="primary-button compact" type="button" data-action="save-business-knowledge">Save knowledge</button>
                  </div>
                </article>
                <article class="panel-subcard">
                  <p class="eyebrow">Saved entries</p>
                  <div class="source-list" data-business-knowledge-list>
                    <div class="mini-status muted">Saved business knowledge entries will appear here.</div>
                  </div>
                </article>
              </div>
            </article>

            <article class="panel" data-section="analytics">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Analytics</p>
                  <h2>Performance overview</h2>
                  <p class="lead">Track response time, AI solve rate, handoff rate, and channel breakdown.</p>
                </div>
                <span class="badge accent">Live data</span>
              </div>
              <div class="grid stats-grid compact">
                <article class="stat-card">
                  <span class="eyebrow">AI solve rate</span>
                  <strong>91%</strong>
                  <div class="stat-delta positive">â†‘ 4% vs last week</div>
                </article>
                <article class="stat-card">
                  <span class="eyebrow">Avg. first reply</span>
                  <strong>2m 41s</strong>
                  <div class="stat-delta positive">â†“ 18s improvement</div>
                </article>
                <article class="stat-card">
                  <span class="eyebrow">Human handoffs</span>
                  <strong>14%</strong>
                  <div class="stat-delta neutral">Stable this week</div>
                </article>
                <article class="stat-card">
                  <span class="eyebrow">Follow-up opens</span>
                  <strong>68%</strong>
                  <div class="stat-delta positive">â†‘ 9% vs last month</div>
                </article>
              </div>
              <article class="panel-subcard section-gap-md">
                <div class="panel-head compact">
                  <div>
                    <p class="eyebrow">AI operations snapshot</p>
                    <h3>Latest model signal</h3>
                  </div>
                  <span class="badge neutral" data-ai-analytics-status>Idle</span>
                </div>
                <div class="source-list" data-ai-analytics-brief>
                  <div class="mini-status muted">Run AI brief from Inbox to surface a live operator snapshot here.</div>
                </div>
              </article>
                <div class="grid outcome-grid section-gap-md">
                  <article class="panel-subcard">
                    <span class="eyebrow">Pipeline</span>
                    <strong>$603k forecast</strong>
                    <p class="lead">Deals tracked but secondary to the support agent workflow.</p>
                </article>
                <article class="panel-subcard">
                  <span class="eyebrow">Refunds</span>
                  <strong>7 open cases</strong>
                  <p class="lead">Approval and recovery steps visible for finance and support.</p>
                </article>
                  <article class="panel-subcard">
                    <span class="eyebrow">Channel mix</span>
                    <strong data-live-ops="channels-performance">whatsapp leads 0</strong>
                    <p class="lead" data-live-ops-detail="channels-performance">Voice 0 | WhatsApp 0 | SMS 0</p>
                  </article>
                  <article class="panel-subcard">
                    <span class="eyebrow">Inbox SLA</span>
                    <strong data-live-ops="sla-risk">Waiting on live queue</strong>
                    <p class="lead" data-live-ops-detail="sla-risk">Stale inbound threads and operator backlog will appear here once the queue starts moving.</p>
                  </article>
                  <article class="panel-subcard">
                    <span class="eyebrow">Identity health</span>
                    <strong data-live-ops="identity-health">No unified profiles yet</strong>
                    <p class="lead" data-live-ops-detail="identity-health">Cross-channel customer matching and duplicate cleanup will surface here.</p>
                  </article>
                  <article class="panel-subcard">
                    <span class="eyebrow">Voice follow-up</span>
                    <strong data-live-ops="voice-followup">No analyzed calls yet</strong>
                    <p class="lead" data-live-ops-detail="voice-followup">Deepgram recaps, caller mood, and ready follow-ups will appear here.</p>
                  </article>
                  <article class="panel-subcard">
                    <span class="eyebrow">WhatsApp delivery</span>
                    <strong data-live-ops="whatsapp-delivery">Waiting on callbacks</strong>
                    <p class="lead" data-live-ops-detail="whatsapp-delivery">Sent, delivered, read, and failed counts will appear here once replies begin flowing through the production sender.</p>
                    <div class="composer-actions section-gap-sm">
                    <button class="ghost-button compact" type="button" data-action="focus-whatsapp-failures">Open failed sends</button>
                    <button class="primary-button compact" type="button" data-action="retry-failed-whatsapp">Retry latest failed send</button>
                    <button class="ghost-button compact" type="button" data-action="retry-all-failed-whatsapp">Retry all safe sends</button>
                  </div>
                </article>
              </div>
            </article>

            <article class="panel panel-wide" data-section="settings">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Settings</p>
                  <h2>Workspace & team</h2>
                  <p class="lead">Manage your workspace, team members, plan, and integrations.</p>
                </div>
                <span class="badge neutral" data-contacts-count>Workspace loaded</span>
              </div>
              <div class="two-column simple-two-column">
                <article class="panel-subcard">
                  <p class="eyebrow">Workspace</p>
                  <div class="source-list">
                    <div class="check-item"><span>âœ…</span><div><strong>Workspace name</strong><span data-workspace-name-display>Northstar Commerce</span></div></div>
                    <div class="check-item"><span>âœ…</span><div><strong>Plan</strong><span>Starter</span></div></div>
                    <div class="check-item"><span>âœ…</span><div><strong>Role</strong><span data-workspace-role>Owner</span></div></div>
                  </div>
                </article>
                <article class="panel-subcard">
                  <p class="eyebrow">Team</p>
                  <div class="source-list">
                    <div class="check-item"><span>AW</span><div><strong>Ada Wilson</strong><span>Support lead</span></div><span class="badge success">Active</span></div>
                    <div class="check-item"><span>JR</span><div><strong>James Rivera</strong><span>Sales ops</span></div><span class="badge neutral">Invited</span></div>
                  </div>
                </article>
              </div>
              <article class="panel-subcard section-gap-lg">
                <div class="panel-head compact panel-head-with-help">
                  <div>
                    <p class="eyebrow">Connections</p>
                    <h3>Workspace accounts</h3>
                  </div>
                  <div class="panel-head-actions">
                    <span class="badge neutral" data-connections-count>Checking status</span>
                    <details class="inline-help">
                      <summary aria-label="How WhatsApp data is used">?</summary>
                      <div class="inline-help-popover">
                        WhatsApp data is used to receive customer messages, keep conversation history in the correct workspace, and support follow-up or handoff when the team replies.
                      </div>
                    </details>
                  </div>
                </div>
                <div class="mini-status muted" data-connections-status>Each workspace keeps its own Gmail and Meta connections so a new client can link a different account.</div>
                <div class="source-list section-gap-sm" data-connections-list>
                  <div class="check-item"><span>...</span><div><strong>Loading connections</strong><span>Workspace connection status will appear here after the snapshot loads.</span></div></div>
                </div>
              </article>
                <article class="panel-subcard section-gap-lg">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">Appearance</p>
                      <h3>Theme preference</h3>
                  </div>
                  <span class="badge neutral" data-theme-status>System</span>
                </div>
                <p class="mini-status muted">Use the original light AuraFlow palette, keep the dark operator shell, or follow the browser and OS theme automatically.</p>
                <div class="segmented-control section-gap-sm" data-theme-controls>
                  <button class="chip" type="button" data-action="set-theme-preference" data-theme-preference="system">System</button>
                  <button class="chip" type="button" data-action="set-theme-preference" data-theme-preference="light">Light</button>
                  <button class="chip" type="button" data-action="set-theme-preference" data-theme-preference="dark">Dark</button>
                  </div>
                  <div class="mini-status muted section-gap-sm" data-theme-help>System mode automatically follows the user's browser and device appearance.</div>
                </article>
                <article class="panel-subcard section-gap-lg">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">Template & sender health</p>
                      <h3>WhatsApp operations</h3>
                    </div>
                    <span class="badge accent">Twilio live</span>
                  </div>
                  <div class="mini-status muted" data-template-health-status>Sender readiness, callback coverage, and template blockers will appear here.</div>
                  <div class="source-list section-gap-sm" data-template-health-panel>
                    <div class="check-item"><span>WA</span><div><strong>Waiting on traffic</strong><span>Outbound template and sender diagnostics will appear after WhatsApp traffic flows through the workspace.</span></div></div>
                  </div>
                </article>
                <article class="panel-subcard section-gap-lg">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">Template gallery</p>
                      <h3>Approved WhatsApp & SMS</h3>
                    </div>
                    <span class="badge neutral">Supabase</span>
                  </div>
                  <div class="mini-status muted" data-template-gallery-status>Approved WhatsApp and SMS templates from Supabase will appear here with their approval status.</div>
                  <div class="source-list section-gap-sm" data-template-gallery-panel>
                    <div class="check-item"><span>TM</span><div><strong>Waiting on template data</strong><span>Saved WhatsApp and SMS templates will appear here after the workspace data loads.</span></div></div>
                  </div>
                </article>
                <article class="panel-subcard section-gap-lg">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">Ops readiness</p>
                      <h3>Admin diagnostics</h3>
                    </div>
                    <span class="badge neutral">Local runtime</span>
                  </div>
                  <div class="mini-status muted" data-ops-readiness-status>Identity merge health, webhook verification, queue pressure, and voice readiness will appear here.</div>
                  <div class="source-list section-gap-sm" data-ops-readiness-panel>
                    <div class="check-item"><span>OP</span><div><strong>Waiting on workspace data</strong><span>Operational diagnostics will appear here once AuraFlow loads the latest workspace snapshot.</span></div></div>
                  </div>
                </article>
                <article class="panel-subcard section-gap-lg">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">Contact health</p>
                      <h3>Phone enrichment backfill</h3>
                    </div>
                    <span class="badge accent">Twilio Lookup</span>
                  </div>
                  <div class="mini-status muted" data-contact-health-backfill-status>Run this once to enrich older contacts that do not have carrier or line-type health data yet.</div>
                  <div class="composer-actions section-gap-sm">
                    <button class="primary-button compact" type="button" data-action="backfill-contact-phone-health">Backfill contact health</button>
                  </div>
                </article>
                <div class="panel-head section-gap-lg">
                  <div>
                    <p class="eyebrow">Contacts</p>
                    <h3>Customer list</h3>
                  </div>
                </div>
                <article class="panel-subcard section-gap-md">
                  <div class="panel-head compact">
                    <div>
                      <p class="eyebrow">Duplicate review</p>
                      <h3>Identity cleanup queue</h3>
                    </div>
                    <span class="badge neutral" data-duplicate-review-status>Idle</span>
                  </div>
                  <div class="mini-status muted" data-duplicate-review-note>Potential duplicate customers across email and phone variants will appear here for manual review.</div>
                  <div class="source-list section-gap-sm" data-duplicate-review-panel>
                    <div class="check-item"><span>ID</span><div><strong>No duplicate clusters yet</strong><span>When AuraFlow spots likely duplicate contacts, they will appear here with a merge recommendation.</span></div><span class="badge success">Clean</span></div>
                  </div>
                </article>
                <div class="table-card">
                  <table>
                  <thead><tr><th>Customer</th><th>Stage</th><th>Owner</th><th>Last seen</th><th>Lifetime value</th></tr></thead>
                  <tbody data-contacts-rows>
                    <tr><td><strong>Maya Chen</strong><span>Brightlane Studio</span></td><td><span class="badge neutral">SQL</span></td><td>Ada</td><td>2m ago</td><td>$18,420</td></tr>
                    <tr><td><strong>Daniel Osei</strong><span>Osei Ventures</span></td><td><span class="badge success">Customer</span></td><td>James</td><td>1h ago</td><td>$9,200</td></tr>
                    <tr><td><strong>Priya Nair</strong><span>NairTech</span></td><td><span class="badge warning">At risk</span></td><td>Ada</td><td>3h ago</td><td>$31,000</td></tr>
                  </tbody>
                </table>
              </div>
            </article>

          </section>
          <footer class="legal-footer app-legal-footer">
            <div class="legal-meta-stack">
              <span class="mini-status muted">AuraFlow by Neway Marketing Enterprises</span>
              <span class="mini-status muted">Port Harcourt, Nigeria | newayagency247@gmail.com</span>
            </div>
            <div class="legal-links">
              <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
              <a href="/data-deletion" target="_blank" rel="noreferrer">Data Deletion</a>
              <a href="mailto:newayagency247@gmail.com">Contact</a>
            </div>
          </footer>
        </main>
      </div>
    </div>

    <div class="toast-stack" aria-live="polite" aria-atomic="true"></div>
  `;
}

