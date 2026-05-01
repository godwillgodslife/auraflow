# Provider Ingest Contract

AuraFlow now accepts normalized provider payloads at `/.netlify/functions/provider-ingest`.

## Required env vars

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AURAFLOW_INGEST_SECRET` for production webhook protection

## Required payload shape

```json
{
  "provider": "gmail",
  "workspaceId": "uuid",
  "accountId": "provider-account-id",
  "contact": {
    "externalId": "provider-contact-id",
    "name": "Maya Chen",
    "email": "maya@example.com"
  },
  "conversation": {
    "externalId": "provider-thread-id",
    "subject": "Need help",
    "status": "open",
    "priority": "high",
    "source": "Gmail",
    "summary": "Optional conversation summary"
  },
  "messages": [
    {
      "externalId": "provider-message-id",
      "direction": "inbound",
      "senderName": "Maya Chen",
      "body": "Message body",
      "createdAt": "2026-03-24T10:00:00.000Z"
    }
  ]
}
```

## Behavior

- Upserts the contact, conversation, and messages by provider-scoped external IDs.
- Writes an activity event for the inbound sync.
- Returns the normalized rows that were inserted or updated.

## Local test

The preview shell includes a `Seed Gmail thread` action in Deploy. It posts a Gmail-shaped demo payload to the same endpoint so you can validate the flow before wiring Nango webhooks.
