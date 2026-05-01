const ROLE_ORDER = ['viewer', 'agent', 'admin', 'owner'];

const ROLE_CAPABILITIES = {
  owner: {
    connectChannels: true,
    sendReplies: true,
    escalateThreads: true,
    manageWorkflows: true,
    manageAgents: true,
    managePermissions: true,
    retryReliability: true,
    editContacts: true,
    saveNotes: true
  },
  admin: {
    connectChannels: true,
    sendReplies: true,
    escalateThreads: true,
    manageWorkflows: true,
    manageAgents: true,
    managePermissions: false,
    retryReliability: true,
    editContacts: true,
    saveNotes: true
  },
  agent: {
    connectChannels: false,
    sendReplies: true,
    escalateThreads: true,
    manageWorkflows: true,
    manageAgents: false,
    managePermissions: false,
    retryReliability: false,
    editContacts: true,
    saveNotes: true
  },
  viewer: {
    connectChannels: false,
    sendReplies: false,
    escalateThreads: false,
    manageWorkflows: false,
    manageAgents: false,
    managePermissions: false,
    retryReliability: false,
    editContacts: false,
    saveNotes: false
  }
};

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  agent: 'Agent',
  viewer: 'Viewer'
};

export function normalizeWorkspaceRole(role = 'viewer') {
  const normalized = String(role || '').trim().toLowerCase();
  return ROLE_ORDER.includes(normalized) ? normalized : 'viewer';
}

export function deriveWorkspaceRole(members = [], userId = '', fallbackRole = 'viewer') {
  const normalizedUserId = String(userId || '').trim();
  const memberList = Array.isArray(members) ? members : [];

  if (normalizedUserId) {
    const matchedMember = memberList.find((member) => String(member?.user_id || member?.userId || '').trim() === normalizedUserId);
    if (matchedMember) {
      return normalizeWorkspaceRole(matchedMember.role);
    }
  }

  const roleFromMembers = memberList
    .map((member) => normalizeWorkspaceRole(member?.role))
    .find((role) => role === 'owner' || role === 'admin' || role === 'agent' || role === 'viewer');

  return roleFromMembers || normalizeWorkspaceRole(fallbackRole);
}

export function getWorkspacePermissions(role = 'viewer') {
  return ROLE_CAPABILITIES[normalizeWorkspaceRole(role)] || ROLE_CAPABILITIES.viewer;
}

export function canPerformWorkspaceAction(role = 'viewer', capability = '') {
  const permissions = getWorkspacePermissions(role);
  return Boolean(permissions[capability]);
}

export function describeWorkspaceRole(role = 'viewer') {
  return ROLE_LABELS[normalizeWorkspaceRole(role)] || ROLE_LABELS.viewer;
}

