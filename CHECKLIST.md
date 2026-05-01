# AuraFlow Environment Checklist

Use this before running the live connectivity phase.

## Core Supabase
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `AURAFLOW_INGEST_SECRET`
- [ ] `AURAFLOW_DEFAULT_WORKSPACE_ID`
- [ ] `SUPABASE_SCHEMA` (optional, defaults to `public`)

## Nango
- [ ] `NANGO_BASE_URL`
- [ ] `NANGO_CONNECT_URL`
- [ ] `NANGO_PUBLIC_KEY`
- [ ] `NANGO_SECRET_KEY`

## Gemini
- [ ] `GEMINI_API_KEY`
- [ ] `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)

## OpenRouter
- [ ] `OPENROUTER_API_KEY`
- [ ] `OPENROUTER_MODEL`
- [ ] `OPENROUTER_SITE_URL`
- [ ] `OPENROUTER_APP_NAME`

## Google / Gmail
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `GMAIL_INBOX_ADDRESS`
- [ ] `GMAIL_FROM_EMAIL`
- [ ] `GMAIL_ACCESS_TOKEN`
- [ ] `GMAIL_REFRESH_TOKEN`
- [ ] `GOOGLE_CLOUD_PROJECT_ID`
- [ ] `GMAIL_WEBHOOK_TOPIC`
- [ ] `GMAIL_PUSH_SUBSCRIPTION`
- [ ] `GMAIL_WEBHOOK_SECRET`
- [ ] `LEAD_NOTIFICATION_EMAIL`
- [ ] `OWNER_NOTIFICATION_EMAIL`

## Meta / Facebook
- [ ] `FACEBOOK_APP_ID`
- [ ] `FACEBOOK_APP_SECRET`
- [ ] `META_APP_SECRET`
- [ ] `META_WEBHOOK_VERIFY_TOKEN`
- [ ] `META_GRAPH_VERSION` (optional)
- [ ] `META_OAUTH_SCOPES` (optional)

## Twilio Conversations / Messaging
- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_AUTH_TOKEN`
- [ ] `TWILIO_API_KEY` (optional if you want a separate API key pair)
- [ ] `TWILIO_API_SECRET` (optional if you want a separate API key pair)
- [ ] `TWILIO_CONVERSATIONS_SERVICE_SID`
- [ ] `TWILIO_WHATSAPP_SANDBOX_NUMBER`
- [ ] `TWILIO_WHATSAPP_SANDBOX_JOIN_CODE`
- [ ] `TWILIO_SMS_FROM_NUMBER` (optional if SMS is part of your rollout)
- [ ] `TWILIO_WEBHOOK_BASE_URL`
- [ ] `TWILIO_MESSAGING_STATUS_CALLBACK_URL` (optional)
- [ ] `TWILIO_WHATSAPP_ACCOUNT_SID` (optional console/account mapping)
- [ ] `TWILIO_INSTAGRAM_ACCOUNT_SID` (optional console/account mapping)
- [ ] `TWILIO_MESSENGER_ACCOUNT_SID` (optional console/account mapping)
- [ ] `TWILIO_CONVERSATIONS_WEBHOOK_SECRET` (optional internal relay secret)

## Botpress
- [ ] `BOTPRESS_REPLY_WEBHOOK_URL`
- [ ] `BOTPRESS_REPLY_WEBHOOK_TOKEN`
- [ ] `BOTPRESS_INSTAGRAM_WEBHOOK_URL`
- [ ] `BOTPRESS_WEBHOOK_URL`
- [ ] `BOTPRESS_WEBHOOK_TOKEN`
- [ ] `BOTPRESS_TOKEN_PUSH_URL`
- [ ] `BOTPRESS_TOKEN_PUSH_TOKEN`

## Voice and transcription
- [ ] `DEEPGRAM_API_KEY`
- [ ] `DEEPGRAM_MODEL` (optional)

## Launch surfaces
- [ ] `http://localhost:3000/healthz`
- [ ] `http://localhost:3000/admin/review-demo?workspace_id=...`
- [ ] `http://localhost:3000/api/test/lead-notification`

## Notes
- `NANGO_PUBLIC_KEY` was missing from the sample env file and is required for the browser connect flow to read the public key explicitly.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `NANGO_SECRET_KEY` server-side only.
- If you are using local demo mode, you can leave the provider keys empty, but real connect/sync/webhook calls will not work until these are populated.
- AuraFlow now expects WhatsApp, Instagram, and Messenger traffic to arrive through Twilio Conversations webhooks rather than direct Meta webhooks.
- The review demo and health routes are safe to use as launch checks while the final keys are being added.
- Gmail inbound now expects Pub/Sub push traffic on `/api/webhooks/gmail` and can re-arm watches through `/api/webhooks/gmail/watch`.
