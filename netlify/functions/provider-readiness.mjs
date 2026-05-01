function getProviderReadiness() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const gmailInboxAddress = process.env.GMAIL_INBOX_ADDRESS || '';
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';
  const twilioConversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID || '';
  const twilioWhatsappSender = process.env.TWILIO_WHATSAPP_SENDER || process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER || '';

  return [
    {
      provider: 'whatsapp',
      label: 'WhatsApp',
      channelType: 'whatsapp',
      configured: Boolean(twilioAccountSid && twilioAuthToken && twilioConversationsServiceSid && twilioWhatsappSender),
      externalAccountId: twilioWhatsappSender || twilioConversationsServiceSid || '',
      missing: [
        !twilioAccountSid && 'TWILIO_ACCOUNT_SID',
        !twilioAuthToken && 'TWILIO_AUTH_TOKEN',
        !twilioConversationsServiceSid && 'TWILIO_CONVERSATIONS_SERVICE_SID',
        !twilioWhatsappSender && 'TWILIO_WHATSAPP_SENDER'
      ].filter(Boolean)
    },
    {
      provider: 'instagram',
      label: 'Instagram',
      channelType: 'instagram',
      configured: Boolean(twilioAccountSid && twilioAuthToken && twilioConversationsServiceSid),
      externalAccountId: twilioConversationsServiceSid || '',
      missing: [
        !twilioAccountSid && 'TWILIO_ACCOUNT_SID',
        !twilioAuthToken && 'TWILIO_AUTH_TOKEN',
        !twilioConversationsServiceSid && 'TWILIO_CONVERSATIONS_SERVICE_SID'
      ].filter(Boolean)
    },
    {
      provider: 'messenger',
      label: 'Messenger',
      channelType: 'messenger',
      configured: Boolean(twilioAccountSid && twilioAuthToken && twilioConversationsServiceSid),
      externalAccountId: twilioConversationsServiceSid || '',
      missing: [
        !twilioAccountSid && 'TWILIO_ACCOUNT_SID',
        !twilioAuthToken && 'TWILIO_AUTH_TOKEN',
        !twilioConversationsServiceSid && 'TWILIO_CONVERSATIONS_SERVICE_SID'
      ].filter(Boolean)
    },
    {
      provider: 'gmail',
      label: 'Gmail',
      channelType: 'email',
      configured: Boolean(googleClientId && googleClientSecret && gmailInboxAddress),
      externalAccountId: gmailInboxAddress || '',
      missing: [
        !googleClientId && 'GOOGLE_CLIENT_ID',
        !googleClientSecret && 'GOOGLE_CLIENT_SECRET',
        !gmailInboxAddress && 'GMAIL_INBOX_ADDRESS'
      ].filter(Boolean)
    }
  ];
}

export default async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(getProviderReadiness())
});
