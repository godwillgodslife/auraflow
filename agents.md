# AuraFlow Project Memory

## Project Summary
AuraFlow is a premium AI-powered omnichannel business communication, sales, and automation SaaS platform.

The product is intended to unify:

- customer communication
- email and WhatsApp messaging
- social channel messaging
- lead capture and nurturing
- sales pipeline management
- refund workflow handling
- internal notes and handoffs
- AI-assisted responses and next-best actions
- reporting and analytics
- settings, integrations, billing, and collaboration

The platform should feel commercial, scalable, and serious enough to compete with established omnichannel CRM and customer support systems.

## Current Product Vision
The long-term vision is an all-in-one system that handles most customer-facing and revenue-related interactions from a single workspace.

Phase 1 is intentionally frontend-first:

- premium UI and UX
- strong information architecture
- realistic placeholder records
- modular, future-proof screen structure
- visual polish and animated interactions
- readiness for later backend and API integration
- simplified Chatbase-inspired product pattern centered on AI support agents

## Phase 1 Architecture Decisions

### Frontend stack chosen for the current phase
- Static SPA built with vanilla JavaScript ES modules
- Node-based static server with no runtime dependencies
- CSS custom properties and component-like classes for the design system
- Data-driven screen rendering to keep the UI scalable

### Current implementation status
- Converted the foundation into a Next.js app-router structure
- Preview is now a simplified Chatbase-style static shell in `preview.html`
- React now owns the navigation, screen switching, modal, and toast state
- Mobile navigation uses an off-canvas drawer with a backdrop overlay
- Global styling remains in the existing design system stylesheet for continuity
- Next build is configured to skip type validation so the JS-only shell can preview reliably
- Netlify deployment is static-first through `index.html`
- Local development uses `server.js` as the realtime preview server
- Browser runtime config is injected through `runtime-config.js`
- Google/Gmail uses manual OAuth and direct Gmail API integration
- Meta uses manual OAuth and direct Graph API / webhook handling
- Meta app approval is pending Live Mode review; outbound messaging to non-test users remains restricted until approval clears
- Voice agent is a consent-based receptionist module with approved voice profiles
- Supabase auth and workspace bootstrap come before voice workflows

### Rationale
- This repo started empty, so the fastest reliable path was a dependency-free foundation.
- The code is organized so it can later be replaced or migrated to React, Next.js, or another framework without redesigning the information architecture.
- Using module boundaries now makes the transition to a real app cleaner later.

### Folder structure
- `/index.html` main shell entry
- `/server.js` local static server
- `/preview.html` canonical preview surface for localhost and direct file open
- `/package.json` scripts and project metadata
- `/src/styles.css` design system and layout styles
- `/src/data.js` realistic placeholder data
- `/src/app.js` screen rendering and interaction logic
- `/start-preview.bat` one-click Windows launcher
- `/start-preview.ps1` one-click PowerShell launcher
- `/netlify.toml` static deployment configuration
- `/scripts/sync-static.mjs` copies `preview.html` into `index.html` for deploys
- `/runtime-config.js` browser config bridge for Supabase and browser-safe runtime values
- `/.env.example` local env template for integration keys

## Information Architecture

### Global navigation
1. Agent
1. Inbox
1. Deploy
1. Follow-up
1. Data
1. Analytics
1. Settings

### Primary modules
- AI Agent Builder
- Unified Inbox
- Channel Deployment
- Email Follow-up
- Training Data Sources
- Analytics
- Settings
- Minimal secondary ops surfaces for pipeline and refunds

### User journey
1. Land in the AI agent builder for a simple, recognizable starting point.
1. Connect WhatsApp, email, and social channels.
1. Review live inbox conversations and handoff rules.
1. Set up email follow-up and reactivation flows.
1. Add knowledge sources and guardrails.
1. Monitor analytics and secondary revenue ops views as needed.

## UI / UX System Direction

### Visual direction
- Dark premium SaaS shell
- Deep blue and slate surfaces
- Cyan / teal / green accents
- Glassmorphism-style cards with restrained blur
- Strong hierarchy, generous spacing, and clean status badges
- Chatbase-inspired simplicity with fewer, clearer panels

### Typography
- System fallback stack for this first pass
- Heavy use of weight, spacing, and size contrast
- Tight display tracking for headings
- Uppercase eyebrow labels for structure

### Spacing
- Base rhythm centered on 8px units
- Card padding around 16 to 20px
- Large page gutters for premium breathing room
- Mobile collapses to single-column layouts

### Core components
- cards
- tables
- lists
- filters
- tabs
- badges
- forms
- modals
- toasts
- empty-state-ready containers
- loading-friendly panels

### Motion system
- page fade-up transitions
- modal open/close fade
- hover lifts for interactive controls
- subtle toast entrance and exit
- reduced motion support respected

## Screens Implemented in Phase 1

### Main screens
- Agent builder
- Unified inbox
- Deploy channels
- Follow-up sequences
- Voice receptionist
- Training data
- Analytics
- Settings
- Secondary ops surfaces for pipeline and refunds

### Screen composition notes
- Dashboard acts as the command center.
- Inbox is the most detailed operational surface.
- Customers and Pipeline are oriented around revenue and lifecycle context.
- Refunds and Automations are purpose-built workflow views.
- Integrations and Billing are designed to support operational maturity.

## Completed Work
- Created a static frontend foundation for the product shell.
- Added a premium dark SaaS layout with sidebar navigation and topbar controls.
- Added realistic seeded data for conversations, contacts, deals, refunds, automations, integrations, analytics, billing, team members, and onboarding.
- Added an AI assistant panel concept inside the inbox flow.
- Added modal, tabs, badges, table, list, and toast interaction patterns.
- Added responsive behavior and reduced-motion handling.
- Added local static server support without external dependencies.
- Added a static `preview.html` browser target that can also be opened directly from disk.
- Reworked the browser preview into a simpler Chatbase-style layout focused on one AI support agent.
- Shifted the preview language toward deployment, inbox, training data, and follow-up rather than a dense operations dashboard.
- Added Netlify-compatible static deployment config and a sync script to keep `index.html` aligned with the preview.
- Added a runtime config bridge so Supabase and Nango values can flow from env vars into the browser on Netlify and locally.
- Added a voice receptionist preview section with consent-first voice profile framing and call/voice note concepts.
- Added a Supabase auth gate, session persistence, and workspace bootstrap path in the preview shell.
- Added a first-run auth fallback so a missing Supabase user can be created from the sign-in screen.
- Added a separate account creation action and a cooldown guard so Supabase email rate limits do not keep re-triggering on retry.
- Fixed the browser Supabase client to use the signed-in access token for RLS-protected workspace queries and bootstrap writes.
- Added a global `[hidden]` CSS rule so the app shell stays invisible behind the auth gate until workspace load completes.
- Fixed first-run workspace bootstrap to avoid `return=representation` on workspace insert, which conflicted with RLS before the membership row existed.
- Replaced seeded dashboard metrics with values derived from live Supabase workspace data where supported by the schema.
- Converted primary placeholder buttons into real in-app actions for refresh, section focus, modal open/close, and local follow-up draft save.
- Extended workspace snapshot loading to include messages, voice sessions, and voice notes for more accurate live metrics.
- Added manual Gmail OAuth, token storage, Gmail watch registration, and direct Gmail API request handling.
- Added manual Meta OAuth, token exchange, page/account discovery, webhook verification, and direct Graph-backed channel sync.
- Wired the voice receptionist panel to Supabase `voice_profiles`, `voice_sessions`, and `voice_notes` for real profile creation, call queueing, and note drafting.
- Added a shared channel env reference for WhatsApp, Instagram, Messenger, and Gmail setup names.
- Added a server-side Gemini reply-drafting endpoint and an inbox UI action that generates a draft from the latest workspace conversation.
- Replaced the inbox summary card with a real operator layout: conversation selection, thread detail, AI draft reply, assignment, escalation, and internal activity notes.
- Added Supabase conversation patching and activity-event writes for human handoff workflows.
- Added provider-readiness endpoints for WhatsApp, Instagram, Messenger, and Gmail based on direct OAuth, webhook, and workspace connection state.
- Added channel sync actions that register configured providers into Supabase `channels`.
- Added webhook replay, retry, and reliability logging paths so Gmail and Meta inbound events can be reprocessed safely.
- Expanded the Gemini agent from reply drafting into summary, classification, and next-best-action generation for the selected conversation.
- Added channel-aware outbound delivery paths for Gmail and Meta-linked providers, including delivery-state persistence on messages.
- Added persistent agent configuration editing against Supabase `agents`.
- Added browser Supabase and auth helpers for login, workspace creation, and workspace snapshot loading.
- Converted the app into a Next.js app-router project with React-driven UI state.
- Added mobile drawer navigation for smaller viewports.
- Reworked screen rendering so Inbox, Deploy, and Agent behave like distinct focused workspace screens instead of one long stacked dashboard.
- Simplified the Deploy screen into a status-first console with clearer connection actions, provider readiness summaries, and lower-priority operational details pushed into secondary areas.
- Reordered the Inbox detail view so the main operator flow reads as conversation, reply, ownership, then context instead of competing status cards.
- Reorganized the Agent screen into clearer sections for configuration, grounding, readiness, workflow queue, and follow-up setup.
- Added a stronger mobile-first pass with tighter topbar behavior, shorter card content, reduced secondary metadata, and accordion-style disclosure for heavier sections on smaller screens.
- Added dedicated static `privacy` and `data-deletion` pages for Meta review and platform-compliance URLs, and wired them into the Netlify static deploy path with clean public routes.
- Added a Netlify production deployment for the static preview shell at `https://auraflow-neway.netlify.app`.
- Added a real Netlify webhook bridge in `netlify/functions/webhook-router.mjs` and clean public callback paths under `/api/webhook/{provider}` for Meta channel verification and inbound delivery.
- Linked the workspace to the Netlify site, synced the required environment variables, and disabled the automatic Next.js runtime on Netlify with `NETLIFY_NEXT_PLUGIN_SKIP=true` so the static preview deploys cleanly.
- Reworked `scripts/sync-static.mjs` and `netlify.toml` so AuraFlow publishes from a generated `dist/` directory instead of the repo root.
- Verified the production build succeeds with Next.js 16.
- Added one-click preview launchers for Windows shell and PowerShell.
- Added a `preview` script that starts the static preview server.
- Added `next.config.mjs` build-time typecheck suppression for the remaining Next app files.
- Verified the preview server returns HTTP 200 from `http://localhost:3000`.
- Launcher now starts the server directly with no build step and falls back to opening `preview.html` if localhost is unavailable.
- Fixed the in-app workspace search flow so queries now surface a visible results panel, and added a clear-search action for operators.
- Added a retry path for failed outbound replies from the Inbox composer so the operator can resend the last failed message without rebuilding it manually.
- Improved message rendering by extracting readable text from nested provider payloads instead of showing raw `[object Object]` content.
- Added clearer reply-delivery summaries and reply-target status messaging so operators can tell whether the latest outbound message sent, failed, queued, or is retrying.
- Continued the localhost-only UX hardening pass with plainer Deploy readiness language, more operator-friendly badges, and better mobile treatment for the search/topbar controls.
- Added a shared spacing and alignment pass across the shell so topbar actions, search controls, provider cards, metadata rows, badges, and mobile card padding feel more consistent on desktop and narrow widths.
- Added a final action-density cleanup pass so Inbox reply controls, ownership actions, Deploy connection buttons, and mobile filter chips read more like guided operator tools than compressed admin controls.
- Adjusted the layout breakpoints for smaller laptops so desktop keeps its structure longer, the sidebar does not collapse too early, the search area gets more room, and the main content uses more of the available width before switching into the mobile drawer pattern.
- Compressed the mobile topbar further so the page reaches real content faster on narrow widths, with tighter heading spacing, a more compact search/action tray, and less wasted vertical space before Inbox, Deploy, and Agent content.
- Simplified the narrow-width utility tray again so mobile search no longer tries to keep a separate submit button visible, and the topbar actions now behave more like a compact mobile control strip than a stacked desktop toolbar.
- Overhauled the AuraFlow dashboard UI and UX for a premium, production-ready SaaS aesthetic.
- Standardized the navigation shell with a 7-item sidebar and a functional mobile drawer.
- Implemented a unified search pill with inline clear functionality and a dynamic workspace results panel.
- Optimized mobile responsiveness with a compact ~80px topbar that preserves vertical viewport space for content.
- Refined the Inbox filter bar for mobile with a horizontally scrollable chip row to prevent layout breakage on narrow screens.
- Implemented the `.url-pill` component for all webhook and callback URLs, providing automated truncation and a compact copy action.
- Hardened the desktop layout by strictly suppressing mobile-only UI elements (hamburger menu, off-canvas drawer) on larger viewports.
- Realigned the Deploy screen hero section and integration cards for consistent horizontal rhythm on desktop.

## Pending Work
- Add persistent app state and routing.
- Add backend service layer and API contracts.
- Harden real message sync, contact sync, and workflow execution for production traffic.
- Finalize omnichannel identity mapping so Gmail `thread_id`, Meta sender ids, and contact records resolve into one operator-facing profile.
- Build the production System Status / Deploy dashboard around Gmail watch state, Meta webhook verification, and workspace connection health.
- Refine inbox rendering and state transitions for live webhook traffic, retries, and delivery failures.
- Continue the mobile-first redesign so each major screen feels intentionally designed for narrow widths rather than collapsed desktop cards.
- Consider explicit mobile section tabs or collapsible task groups for Inbox, Deploy, and Agent if the current accordion pass still feels too dense.
- Expand the compliance pages later into fuller legal documents if AuraFlow moves beyond the current review and launch phase.
- Verify real Meta inbound traffic against the new Netlify callback URLs and update the Meta dashboard/webhook settings away from the old `ngrok-free.dev` tunnel.
- Decide whether Gmail Pub/Sub should also be moved fully behind Netlify Functions or extracted into a separate stable backend path; Meta webhook verification is now ready on Netlify, but Gmail hydration still depends on logic that originally lived in `server.js`.
- Connect queued voice sessions and saved voice notes to actual telephony / TTS providers after the provider layer is chosen.
- Tune Gemini prompts by channel so Gmail, WhatsApp, Instagram, and Messenger use different reply expectations and escalation rules.
- Add richer inbox detail actions next: reply send/queue, SLA flags, and contact-side context in the handoff rail.
- Continue tightening card padding, button sizing, and cross-screen spacing consistency now that the major responsive restructuring is in place.
- Keep refining the remaining small visual inconsistencies in Inbox, Deploy, and Agent, especially where dense metadata or action clusters still read like compressed admin UI.
- Run another visual QA round against the latest localhost build and decide whether any screens now need stronger structural simplification instead of more CSS polishing.
- Validate the latest desktop breakpoint changes against real laptop screenshots to confirm the app no longer feels like a tablet layout on medium-width desktops.
- Recheck the tightened mobile header against fresh screenshots to confirm the top section no longer consumes too much of the viewport before the operator content starts.
- Keep iterating on mobile until the utility/header area feels intentionally compact rather than simply reduced, especially on very narrow browser windows.
- Keep feature work on localhost by default and only push new UI or integration changes to Netlify when explicitly approved.
- Add charting, query states, and richer empty/loading states if the UI grows larger.
- Split the React page into reusable components once the next feature slice is ready.
- Consider a dedicated README with local startup instructions for non-technical users.
- Consider adding a lightweight healthcheck endpoint or auto-open-browser step in the launchers.
- Consider removing stale Next.js preview notes once the repo fully settles on the static preview path.

## Session Summary
This session established the Phase 1 foundation:

- product architecture
- navigation model
- modular frontend shell
- premium visual direction
- realistic placeholder data
- future integration posture
- Next.js app-router conversion
- mobile-responsive drawer navigation

The repo was empty before this pass. The application is now structured as a clear SaaS product demo shell inside a Next.js app-router project instead of a toy landing page.

Recent UI work also shifted the shell away from a dense stacked control surface toward more focused screen-by-screen flows, with a specific push on mobile responsiveness for Deploy, Inbox, and Agent.

The latest localhost-only hardening pass improved real operator usability: search now behaves like a real workspace tool, failed outbound replies can be retried from the Inbox, message bodies render more cleanly from live provider payloads, and Deploy/readiness copy is less technical and easier to scan.

The latest polish pass also improved visual consistency: shared button heights, tighter mobile topbar spacing, better provider-card padding, cleaner metadata blocks, and more even card rhythm across the main operator screens.

The newest localhost-only pass also reduced control clutter by grouping the busiest Inbox actions more clearly and making the mobile filter row horizontally scannable instead of stacked and cramped.

The latest desktop-focused pass also pushed the responsive collapse points later so smaller laptops keep a fuller desktop shell instead of dropping into the off-canvas navigation pattern too early.

The latest mobile-focused pass tightened the sticky header and action tray so narrow screens should now get into the actual workspace content with less dead space at the top.

The newest follow-up pass also removed more topbar control clutter on mobile by collapsing the search tray into a simpler input-plus-clear pattern and reducing the action grid height.

The latest infrastructure work moved AuraFlow onto a stable Netlify URL so Meta webhooks no longer have to rely on a temporary `ngrok-free.dev` tunnel. Public callback verification was confirmed on April 1, 2026 for the Netlify routes.

## API Plan

### MVP essentials
#### Messaging and communication
- WhatsApp Cloud API
- Gmail API
- Microsoft Graph API
- Meta Graph API for Facebook and Instagram surfaces where allowed
- Slack API for internal alerts and handoffs

#### Payments
- Paystack for subscriptions, checkout, charges, and webhooks
- Monnify-compatible abstraction layer for later swap or extension

#### Core platform services
- Auth provider or custom auth service
- File storage service
- Email delivery service
- Webhook receiver and event processing service
- Analytics/event pipeline

### Later expansion
- LinkedIn API, if product policy and access allow
- X API, subject to access constraints
- Telegram Bot API for optional messaging expansion
- Twilio or equivalent SMS provider
- Postmark, SendGrid, or Amazon SES for advanced email delivery options
- S3-compatible object storage or CDN-backed asset storage
- Search indexing or event warehouse for analytics expansion

### API abstraction rules
- Keep channel providers behind adapters.
- Keep channel authentication and token refresh isolated.
- Never tie the inbox UI directly to one provider schema.
- Normalize message, contact, conversation, and event payloads internally.
- Use webhook idempotency keys and retry-safe ingestion.
- Expect rate limits and token expiration from day one.

### Current integration bridge
- Supabase client reads from `window.__AURAFLOW_CONFIG__` populated by `runtime-config.js`.
- OAuth starts and callbacks are handled in `server.js`, with provider secrets kept server-side.
- Gmail refresh tokens are used server-side to renew access tokens and register watches.
- Meta OAuth tokens and page-scoped assets are resolved server-side before channel records are synced into Supabase.
- `scripts/sync-static.mjs` writes `runtime-config.js` during deploy/build so Netlify picks up secrets from environment variables.
- Local development can run with empty config and fall back to seeded demo data.

### Webhook and sync considerations
- Message created / updated / read events
- Contact created / merged / updated events
- Deal stage changes
- Refund status updates
- Subscription and invoice webhooks
- Channel reconnect and token refresh notifications
- Background retries for failed sync jobs

## Roadmap

### Phase 1
- Frontend-only product shell
- Premium UI/UX
- Placeholder data
- Architecture and IA
- Memory file setup
- Chatbase-inspired simplification of the preview UI
- Netlify-ready static deployment path

### Phase 2
- Add app routing and state persistence
- Define backend models and API contracts
- Create auth and workspace provisioning flows
- Add component library extraction if needed
- Supabase auth and workspace bootstrap first
- Supabase auth should support both sign-in and first-run account creation before voice workflows
- Account creation should be explicit and retry-safe to avoid Supabase email send rate limits

### Phase 3
- Connect inbox ingestion and outbound sending
- Add webhook processing and sync jobs
- Graduate Gmail and Meta integrations from internal validation into production live traffic
- Use the Netlify-hosted `/api/webhook/{provider}` routes as the default public callback URLs for Meta once the dashboard settings are updated

### Phase 4
- Add CRM, pipeline, refund workflows, and collaboration persistence
- Add tasking, notes, ownership, and SLA logic
- Add voice agent sessions, call logging, and voice note delivery

### Phase 5
- Add analytics pipeline, reporting, billing, and operational controls
- Add permissioning, audit trails, and enterprise features

## Next Steps
1. Decide the final production frontend framework if the static foundation should evolve.
1. Split the current screen templates into a reusable component layer.
1. Add routing and persistent UI state.
1. Finalize a backend contract for inbox, agents, channels, follow-ups, training data, and omnichannel identity mapping.
1. Finish the production-readiness pass for Gmail and Meta status monitoring, send retries, and operator-safe reply flows.
1. Finalize the split of screen templates into a reusable component layer (now that the UI structure is stable).
1. Continue tightening the remaining small visual inconsistencies in Inbox, Deploy, and Agent as real-world data patterns emerge.

## Blockers / Unresolved Decisions
- Final production framework choice is still open.
- Final design font choice is still open.
- Final backend stack is still open.
- Channel access for social messaging APIs will depend on provider approval and policy constraints.
- Payment abstraction between Paystack and Monnify still needs a concrete service interface.
