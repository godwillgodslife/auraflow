import { handler as webhookRouterHandler } from './webhook-router.mjs';

export const handler = async (event, context) => {
  const defaultWorkspaceId = process.env.AURAFLOW_DEFAULT_WORKSPACE_ID || '';
  const normalizedEvent = {
    ...event,
    path: '/.netlify/functions/whatsapp-webhook',
    queryStringParameters: {
      ...(event?.queryStringParameters || {}),
      provider: event?.queryStringParameters?.provider || 'whatsapp',
      workspace_id: event?.queryStringParameters?.workspace_id || defaultWorkspaceId || undefined
    }
  };

  return webhookRouterHandler(normalizedEvent, context);
};
