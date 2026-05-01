export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

export function initials(value) {
  return String(value || 'NA')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'NA';
}

export function formatCurrency(value) {
  const number = Number(value || 0);
  return `$${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function formatRelativeDate(value) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diff = Math.round((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return 'Now';
  if (diff < 60) return `${diff}m ago`;
  const hours = Math.round(diff / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatTimestamp(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function formatDurationFromMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (minutes < 1) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function toneFromPriority(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('high') || normalized.includes('urgent') || normalized.includes('critical')) return 'danger';
  if (normalized.includes('warm') || normalized.includes('qualified')) return 'success';
  if (normalized.includes('waiting') || normalized.includes('pending')) return 'warning';
  return 'neutral';
}

export function formatChannelLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Email';
  if (normalized === 'gmail' || normalized === 'email') return 'Email';
  if (normalized === 'whatsapp') return 'WhatsApp';
  if (normalized === 'sms') return 'SMS';
  if (normalized === 'voice') return 'Voice';
  if (normalized === 'instagram') return 'Instagram';
  if (normalized === 'messenger') return 'Messenger';
  return String(value || '').trim();
}

export function formatProviderLabel(value) {
  return formatChannelLabel(value);
}
