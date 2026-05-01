# Channel Env Reference

Use these exact variable names in `.env.local` and later in Netlify environment variables.

## Meta / WhatsApp / Instagram / Messenger

- `META_APP_ID`
  - Meta for Developers -> App Settings -> Basic
- `META_APP_SECRET`
  - Meta for Developers -> App Settings -> Basic
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
  - Meta -> WhatsApp -> API Setup
- `WHATSAPP_PHONE_NUMBER_ID`
  - Meta -> WhatsApp -> API Setup
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`
  - Instagram professional account ID connected to your Facebook Page
- `FACEBOOK_PAGE_ID`
  - Facebook Page ID used for Instagram messaging linkage
- `MESSENGER_PAGE_ID`
  - Facebook Page ID for Messenger; often the same value as `FACEBOOK_PAGE_ID`

## Google / Gmail

- `GOOGLE_CLIENT_ID`
  - Google Cloud -> APIs & Services -> Credentials
- `GOOGLE_CLIENT_SECRET`
  - Google Cloud -> APIs & Services -> Credentials
- `GMAIL_INBOX_ADDRESS`
  - The Gmail or Google Workspace inbox you want AuraFlow to connect first

## Supabase admin + ingestion

- `SUPABASE_SERVICE_ROLE_KEY`
  - Supabase project settings -> API -> service_role key
- `AURAFLOW_INGEST_SECRET`
  - Shared secret for provider webhook calls and local ingestion tests

## Formatting rule

Every line in `.env.local` must be plain `NAME=value`

Correct:

```env
META_APP_ID=123456789
WHATSAPP_PHONE_NUMBER_ID=987654321
GOOGLE_CLIENT_ID=abc123.apps.googleusercontent.com
```

Incorrect:

```env
META_APP_ID = 123456789
"WHATSAPP_PHONE_NUMBER_ID"=987654321
# pasted from notes with extra formatting
```

## Recommended first provider order

1. WhatsApp
2. Gmail
3. Instagram
4. Messenger
