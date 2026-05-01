const DEFAULT_SDK_URL = 'https://sdk.twilio.com/js/voice/releases/2.12.3/twilio.min.js';

function resolveSdkUrl() {
  const runtimeConfig = window.__AURAFLOW_CONFIG__ || {};
  return String(runtimeConfig.twilioVoiceSdkUrl || DEFAULT_SDK_URL).trim();
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-twilio-voice-sdk="${src}"]`);
    if (existing && window.Twilio?.Device) {
      resolve(window.Twilio);
      return;
    }
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.twilioVoiceSdk = src;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => {
      if (window.Twilio?.Device) {
        resolve(window.Twilio);
        return;
      }
      reject(new Error('Twilio Voice SDK loaded, but Device is unavailable.'));
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load the Twilio Voice SDK.')), { once: true });
  });
}

async function ensureMicrophoneAccess() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
  return true;
}

function attachCallListeners(call, onStateChange) {
  if (!call || typeof call.on !== 'function') return;
  call.on('accept', () => onStateChange('connected', { message: 'Call connected through the Twilio browser device.' }));
  call.on('disconnect', () => onStateChange('completed', { message: 'Call disconnected.' }));
  call.on('cancel', () => onStateChange('canceled', { message: 'Call canceled before it connected.' }));
  call.on('reject', () => onStateChange('rejected', { message: 'Call was rejected.' }));
  call.on('error', (error) => onStateChange('error', { message: error?.message || 'Twilio call failed.', error }));
}

export function createTwilioSoftphoneClient({ onStateChange = () => {} } = {}) {
  let device = null;
  let activeCall = null;
  let registeredIdentity = '';

  async function register(token, identity = '') {
    await ensureMicrophoneAccess();
    const twilio = await loadScriptOnce(resolveSdkUrl());
    if (!device) {
      device = new twilio.Device(token, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu'],
        allowIncomingWhileBusy: false,
        closeProtection: true
      });
      device.on('registered', () => onStateChange('registered', { identity: registeredIdentity, message: 'Browser softphone registered with Twilio.' }));
      device.on('registering', () => onStateChange('registering', { identity: registeredIdentity, message: 'Registering the browser softphone...' }));
      device.on('unregistered', () => onStateChange('unregistered', { identity: registeredIdentity, message: 'Browser softphone unregistered.' }));
      device.on('error', (error) => onStateChange('error', { identity: registeredIdentity, message: error?.message || 'Twilio device error.', error }));
      device.on('tokenWillExpire', () => onStateChange('token-expiring', { identity: registeredIdentity, message: 'Twilio Voice token is expiring soon.' }));
    } else if (typeof device.updateToken === 'function') {
      await device.updateToken(token);
    }

    registeredIdentity = identity || registeredIdentity;
    if (typeof device.register === 'function') {
      await device.register();
    }
    return {
      identity: registeredIdentity || identity || 'softphone',
      ready: true
    };
  }

  async function startCall(params = {}) {
    if (!device) {
      throw new Error('Twilio browser softphone is not registered yet.');
    }
    onStateChange('dialing', { identity: registeredIdentity, message: 'Dialing from the browser softphone...' });
    activeCall = await device.connect({ params });
    attachCallListeners(activeCall, onStateChange);
    return activeCall;
  }

  async function hangup() {
    if (!activeCall) return;
    try {
      activeCall.disconnect();
    } finally {
      activeCall = null;
      onStateChange('completed', { identity: registeredIdentity, message: 'Call ended from the dashboard.' });
    }
  }

  return {
    register,
    startCall,
    hangup,
    getIdentity() {
      return registeredIdentity;
    },
    getCurrentCall() {
      return activeCall;
    }
  };
}
