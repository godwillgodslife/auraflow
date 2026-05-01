# WhatsApp Meta Setup

Use this file to map the Meta values AuraFlow will need when the WhatsApp integration is wired through Nango.

## Required values

- `META_APP_ID`
  - Found in Meta for Developers -> your app -> App Settings -> Basic
- `META_APP_SECRET`
  - Found in Meta for Developers -> your app -> App Settings -> Basic
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
  - Found in Meta for Developers -> your app -> WhatsApp -> API Setup
- `WHATSAPP_PHONE_NUMBER_ID`
  - Found in Meta for Developers -> your app -> WhatsApp -> API Setup

## Common confusion

- `WHATSAPP_BUSINESS_ACCOUNT_ID` is not the same as `WHATSAPP_PHONE_NUMBER_ID`
- you usually need both
- if you only have one ID today, confirm which screen it came from before wiring the integration

## Where AuraFlow will use them

- Nango provider configuration for Meta / WhatsApp auth
- webhook registration for message events
- channel metadata display inside the Deploy screen

## Next implementation step

Once these values exist in `.env.local`, AuraFlow can move to:

1. create a Nango-backed WhatsApp connect flow
2. store the connected channel in Supabase `channels`
3. ingest inbound WhatsApp conversations into `conversations` and `messages`
4. draft AI replies against those real threads
