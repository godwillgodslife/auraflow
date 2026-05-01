const SUPPORTED_CHANNELS = ["email", "whatsapp", "sms", "voice", "instagram", "messenger"] as const;
const CHANNEL_ALIASES: Record<string, (typeof SUPPORTED_CHANNELS)[number]> = {
  gmail: "email",
  email: "email",
  whatsapp: "whatsapp",
  sms: "sms",
  voice: "voice",
  instagram: "instagram",
  messenger: "messenger"
};

function normalizeText(value: unknown, fallback = "") {
  return String(value || "").trim() || fallback;
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.length) return value;
      continue;
    }
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

export function normalizeChannel(value: unknown, fallback: (typeof SUPPORTED_CHANNELS)[number] | "" = "") {
  const normalized = normalizeText(value, "").toLowerCase();
  if (!normalized) return fallback;
  return CHANNEL_ALIASES[normalized] || (SUPPORTED_CHANNELS.includes(normalized as (typeof SUPPORTED_CHANNELS)[number]) ? normalized as (typeof SUPPORTED_CHANNELS)[number] : fallback);
}

export function providerToChannel(provider: unknown) {
  const normalized = normalizeText(provider, "").toLowerCase();
  if (!normalized) return "";
  return CHANNEL_ALIASES[normalized] || "";
}

export function resolveChannel(provider = "", message: Record<string, unknown> = {}) {
  const explicit = normalizeChannel(firstNonEmpty(message.channel, message.channel_type, message.channelType), "");
  if (explicit) return explicit;

  const providerChannel = providerToChannel(provider);
  if (providerChannel) return providerChannel;

  const normalizedProvider = normalizeText(provider, "").toLowerCase();
  if (SUPPORTED_CHANNELS.includes(normalizedProvider as (typeof SUPPORTED_CHANNELS)[number])) {
    return normalizedProvider as (typeof SUPPORTED_CHANNELS)[number];
  }

  return "whatsapp";
}

export function normalizeSourceProvider(provider = "") {
  const normalized = normalizeText(provider, "").toLowerCase();
  if (!normalized) return "";
  if (normalized === "email") return "gmail";
  return normalized;
}

