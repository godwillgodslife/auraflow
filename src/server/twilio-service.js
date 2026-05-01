function normalizeText(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function parseJsonSafely(text = '') {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function buildProviderError(responseText = '', fallbackMessage = 'Twilio request failed.') {
  const parsed = parseJsonSafely(responseText);
  return parsed?.message || parsed?.error?.message || responseText || fallbackMessage;
}

function normalizePhone(value = '') {
  const normalized = normalizeText(value, '').replace(/[^\d+]/g, '');
  if (!normalized) return '';
  if (normalized.startsWith('+')) return normalized;
  if (normalized.startsWith('234')) return `+${normalized}`;
  if (normalized.startsWith('0')) return `+234${normalized.slice(1)}`;
  return normalized.startsWith('1') ? `+${normalized}` : `+${normalized}`;
}

function sanitizeTemplateKey(value = '') {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isNigerianNumber(value = '') {
  return normalizePhone(value).startsWith('+234');
}

function normalizeLookupFields(fields = []) {
  const values = Array.isArray(fields) ? fields : [fields];
  return values
    .map((value) => normalizeText(value, ''))
    .filter(Boolean);
}

function getTwilioConfig() {
  const whatsappWebhookUrl = normalizeText(
    process.env.TWILIO_WHATSAPP_INBOUND_WEBHOOK_URL
    || 'https://auraflow-neway.netlify.app/.netlify/functions/whatsapp-webhook'
  );
  return {
    accountSid: normalizeText(process.env.TWILIO_ACCOUNT_SID),
    authToken: normalizeText(process.env.TWILIO_AUTH_TOKEN),
    messagingServiceSid: normalizeText(process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_CONVERSATIONS_SERVICE_SID),
    whatsappSender: normalizeText(
      process.env.TWILIO_WHATSAPP_SENDER
      || process.env.TWILIO_WHATSAPP_NUMBER
      || process.env.TWILIO_WHATSAPP_FROM
      || process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER
    ),
    whatsappSenderSid: normalizeText(process.env.TWILIO_WHATSAPP_ACCOUNT_SID),
    smsFromNumber: normalizeText(process.env.TWILIO_SMS_FROM_NUMBER),
    smsAlphaSenderId: normalizeText(process.env.TWILIO_SMS_ALPHA_SENDER_ID || 'AuraFlow'),
    statusCallbackUrl: normalizeText(
      process.env.TWILIO_MESSAGING_STATUS_CALLBACK_URL
      || whatsappWebhookUrl
    ),
    wabaId: normalizeText(process.env.WABA_ID || process.env.TWILIO_WABA_ID),
    metaBusinessId: normalizeText(process.env.META_BUSINESS_ID),
    whatsappWebhookUrl
  };
}

function buildTwilioAuthHeader(accountSid, authToken) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
}

async function twilioRequest(url, { method = 'POST', headers = {}, body, isForm = false } = {}) {
  const { accountSid, authToken } = getTwilioConfig();
  if (!accountSid || !authToken) {
    throw new Error('Twilio account credentials are not configured.');
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: buildTwilioAuthHeader(accountSid, authToken),
      ...(isForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/json' }),
      ...headers
    },
    body
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(buildProviderError(text));
  }
  return parseJsonSafely(text);
}

function resolveContentSid(templateName = '') {
  const normalized = sanitizeTemplateKey(templateName);
  const directKey = `TWILIO_CONTENT_SID_${normalized}`;
  return normalizeText(process.env[directKey] || process.env.TWILIO_CONTENT_SID_DEFAULT);
}

function mapAuraFlowTemplateVariables(templateName = '', variables = {}) {
  const normalized = sanitizeTemplateKey(templateName);
  const businessName = normalizeText(
    variables.businessName
    || variables.workspaceName
    || variables.companyName
    || 'Neway Marketing'
  );
  const contactName = normalizeText(
    variables.contactName
    || variables.name
    || variables.leadName
    || 'there'
  );
  const leadInterest = normalizeText(
    variables.leadInterest
    || variables.interest
    || variables.source
    || variables.formSource
    || 'your request'
  );

  if (normalized === 'LEAD_INTRO') {
    return {
      '1': contactName,
      '2': businessName,
      '3': leadInterest
    };
  }

  return Object.entries(variables || {}).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

export async function sendTwilioMessage({
  to = '',
  from = '',
  body = '',
  messagingServiceSid = '',
  contentSid = '',
  contentVariables = null,
  statusCallback = ''
} = {}) {
  const { accountSid } = getTwilioConfig();
  const params = new URLSearchParams();
  if (to) params.set('To', to);
  if (from) params.set('From', from);
  if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid);
  if (body) params.set('Body', body);
  if (contentSid) params.set('ContentSid', contentSid);
  if (contentVariables && Object.keys(contentVariables).length) {
    params.set('ContentVariables', JSON.stringify(contentVariables));
  }
  if (statusCallback) params.set('StatusCallback', statusCallback);

  return twilioRequest(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    body: params,
    isForm: true
  });
}

export async function sendTwilioWhatsAppMessage({
  to = '',
  body = '',
  from = '',
  contentSid = '',
  contentVariables = null,
  statusCallback = ''
} = {}) {
  const config = getTwilioConfig();
  const normalizedTo = normalizePhone(String(to).replace(/^whatsapp:/i, ''));
  if (!normalizedTo) {
    throw new Error('WhatsApp recipient phone number is missing.');
  }
  const sender = normalizeText(from || config.whatsappSender);
  if (!sender) {
    throw new Error('Twilio WhatsApp sender is not configured.');
  }

  return sendTwilioMessage({
    to: `whatsapp:${normalizedTo}`,
    from: sender.startsWith('whatsapp:') ? sender : `whatsapp:${sender}`,
    body,
    contentSid,
    contentVariables,
    statusCallback: statusCallback || config.statusCallbackUrl
  });
}

export async function sendTwilioSmsMessage({
  to = '',
  body = '',
  from = '',
  messagingServiceSid = '',
  statusCallback = '',
  contentSid = '',
  contentVariables = null
} = {}) {
  const config = getTwilioConfig();
  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) {
    throw new Error('SMS recipient phone number is missing.');
  }

  const senderId = isNigerianNumber(normalizedTo)
    ? config.smsAlphaSenderId
    : normalizeText(from || config.smsFromNumber);

  return sendTwilioMessage({
    to: normalizedTo,
    from: messagingServiceSid ? '' : senderId,
    messagingServiceSid: messagingServiceSid || config.messagingServiceSid,
    body,
    contentSid,
    contentVariables,
    statusCallback: statusCallback || config.statusCallbackUrl
  });
}

export function hasTwilioLookupConfig() {
  const { accountSid, authToken } = getTwilioConfig();
  return Boolean(accountSid && authToken);
}

export async function lookupPhoneNumber(phone = '', { fields = ['line_type_intelligence'] } = {}) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error('A phone number is required for Twilio Lookup.');
  }

  const lookupFields = normalizeLookupFields(fields);
  const query = lookupFields.length
    ? `?${new URLSearchParams({ Fields: lookupFields.join(',') }).toString()}`
    : '';
  const payload = await twilioRequest(
    `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(normalizedPhone)}${query}`,
    { method: 'GET' }
  );

  const lineType = payload?.line_type_intelligence || {};

  return {
    phoneNumber: normalizeText(payload?.phone_number || normalizedPhone, normalizedPhone),
    nationalFormat: normalizeText(payload?.national_format || '', ''),
    countryCode: normalizeText(payload?.country_code || '', ''),
    valid: Boolean(payload?.valid),
    validationErrors: Array.isArray(payload?.validation_errors) ? payload.validation_errors : [],
    carrierName: normalizeText(lineType?.carrier_name || '', ''),
    lineType: normalizeText(lineType?.type || '', '').toLowerCase(),
    mobileCountryCode: normalizeText(lineType?.mobile_country_code || '', ''),
    mobileNetworkCode: normalizeText(lineType?.mobile_network_code || '', ''),
    errorCode: lineType?.error_code ?? null,
    lookedUpAt: new Date().toISOString(),
    raw: payload
  };
}

export async function sendAuraFlowTemplate({
  contactId = '',
  to = '',
  channel = 'whatsapp',
  templateName = '',
  variables = {},
  connection = {}
} = {}) {
  const contentSid = resolveContentSid(templateName);
  if (!contentSid) {
    throw new Error(`No Twilio Content SID is configured for template "${templateName}".`);
  }

  if (String(channel).toLowerCase() === 'whatsapp') {
    return sendTwilioWhatsAppMessage({
      to: to || connection?.phone || connection?.recipient_phone || '',
      contentSid,
      contentVariables: mapAuraFlowTemplateVariables(templateName, {
        contactId,
        ...(variables || {})
      })
    });
  }

  return sendTwilioSmsMessage({
    to: to || connection?.phone || connection?.recipient_phone || '',
    body: '',
    messagingServiceSid: connection?.messaging_service_sid || '',
    statusCallback: '',
    from: '',
    contentSid,
    contentVariables: mapAuraFlowTemplateVariables(templateName, {
      contactId,
      ...(variables || {})
    })
  });
}

export async function registerTwilioWhatsAppSender({
  senderName = '',
  senderNumber = '',
  profileSid = '',
  webhookUrl = '',
  extra = {}
} = {}) {
  const config = getTwilioConfig();
  const address = normalizePhone(senderNumber);
  if (!address) {
    throw new Error('A WhatsApp sender number is required for Twilio sender registration.');
  }

  const payload = {
    Channel: 'whatsapp',
    SenderId: address,
    ProfileSid: profileSid || undefined,
    FriendlyName: normalizeText(senderName, 'AuraFlow WhatsApp Sender'),
    Configuration: {
      callbacks: {
        inbound_message_url: webhookUrl || config.whatsappWebhookUrl
      },
      meta: {
        waba_id: config.wabaId || undefined,
        business_manager_id: config.metaBusinessId || undefined
      }
    },
    ...extra
  };

  return twilioRequest('https://messaging.twilio.com/v2/Channels/Senders', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateTwilioSenderWebhook({
  senderSid = '',
  webhookUrl = '',
  statusCallbackUrl = ''
} = {}) {
  const config = getTwilioConfig();
  const sid = normalizeText(senderSid);
  if (!sid) {
    throw new Error('A Twilio sender SID is required to update the sender webhook.');
  }

  return twilioRequest(`https://messaging.twilio.com/v2/Channels/Senders/${encodeURIComponent(sid)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      webhook: {
        callback_url: webhookUrl || config.whatsappWebhookUrl,
        callback_method: 'POST',
        ...(statusCallbackUrl || config.statusCallbackUrl
          ? {
            status_callback_url: statusCallbackUrl || config.statusCallbackUrl,
            status_callback_method: 'POST'
          }
          : {})
      }
    })
  });
}

export async function attachTwilioSenderToMessagingService({
  senderSid = '',
  messagingServiceSid = ''
} = {}) {
  const config = getTwilioConfig();
  const serviceSid = normalizeText(messagingServiceSid || config.messagingServiceSid);
  const sid = normalizeText(senderSid);
  if (!serviceSid || !sid) {
    throw new Error('Both a Messaging Service SID and sender SID are required to attach a sender.');
  }

  const params = new URLSearchParams({
    Sid: sid
  });

  return twilioRequest(`https://messaging.twilio.com/v1/Services/${encodeURIComponent(serviceSid)}/ChannelSenders`, {
    method: 'POST',
    body: params,
    isForm: true
  });
}

export function getTwilioRuntimeSummary() {
  const config = getTwilioConfig();
  return {
    ...config,
    nigeriaAlphaSenderReady: Boolean(config.smsAlphaSenderId),
    whatsappProductionReady: Boolean(config.whatsappSender && !config.whatsappSender.includes('14155238886'))
  };
}

export function previewAuraFlowTemplateVariables(templateName = '', variables = {}) {
  return mapAuraFlowTemplateVariables(templateName, variables);
}
