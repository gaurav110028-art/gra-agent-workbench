/* =========================================================
   QUERY STORE
   Manages WhatsApp queries in localStorage.
   Same pattern as approvalQueue.js and runHistory.js.
========================================================= */

const QUERIES_KEY = 'gra-query-inbox';
const QUERIES_EVENT = 'gra-queries-updated';
const TEAM_KEY = 'gra-team-members';
const TEAM_EVENT = 'gra-team-updated';

/* ---------------------------------------------------------
   QUERY OPERATIONS
--------------------------------------------------------- */

export function getQueries() {
  if (typeof window === 'undefined') return [];

  try {
    const saved = localStorage.getItem(QUERIES_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistQueries(queries) {
  if (typeof window === 'undefined') return;

  localStorage.setItem(
    QUERIES_KEY,
    JSON.stringify(queries.slice(0, 500))
  );

  window.dispatchEvent(new CustomEvent(QUERIES_EVENT));
}

export function saveQuery(query) {
  const current = getQueries();
  const existingIndex = current.findIndex(
    (item) => item.id === query.id
  );

  let updated;

  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = query;
  } else {
    updated = [query, ...current];
  }

  persistQueries(updated);
}

export function createQuery({
  senderName = 'Unknown',
  senderNumber = '',
  message = '',
  source = 'personal',
  groupName = '',
  messageType = 'text',
  attachments = [],
}) {
  const now = new Date().toISOString();

  const query = {
    id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

    senderName,
    senderNumber,
    message,
    source,
    groupName,
    messageType,
    attachments,

    status: 'New',
    priority: 'Normal',
    assignedTo: '',
    escalatedTo: '',

    notes: [],

    receivedAt: now,
    acknowledgedAt: null,
    resolvedAt: null,

    isRead: false,
  };

  saveQuery(query);
  return query;
}

export function updateQuery(queryId, changes) {
  const queries = getQueries();
  const query = queries.find((item) => item.id === queryId);

  if (!query) return null;

  const updated = { ...query, ...changes };
  saveQuery(updated);
  return updated;
}

export function acknowledgeQuery(queryId) {
  return updateQuery(queryId, {
    status: 'Acknowledged',
    acknowledgedAt: new Date().toISOString(),
    isRead: true,
  });
}

export function assignQuery(queryId, assignedTo) {
  return updateQuery(queryId, {
    status: 'In Progress',
    assignedTo,
    isRead: true,
  });
}

export function escalateQuery(queryId, escalatedTo) {
  return updateQuery(queryId, {
    status: 'Escalated',
    escalatedTo,
    isRead: true,
  });
}

export function resolveQuery(queryId) {
  return updateQuery(queryId, {
    status: 'Resolved',
    resolvedAt: new Date().toISOString(),
    isRead: true,
  });
}

export function addNote(queryId, noteText, author = 'Team') {
  const queries = getQueries();
  const query = queries.find((item) => item.id === queryId);

  if (!query) return null;

  const note = {
    id: `note-${Date.now()}`,
    text: noteText,
    author,
    createdAt: new Date().toISOString(),
  };

  const updated = {
    ...query,
    notes: [...(query.notes || []), note],
  };

  saveQuery(updated);
  return updated;
}

export function deleteQuery(queryId) {
  if (typeof window === 'undefined') return;

  const updated = getQueries().filter(
    (item) => item.id !== queryId
  );

  persistQueries(updated);
}

export function clearAllQueries() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(QUERIES_KEY);
  window.dispatchEvent(new CustomEvent(QUERIES_EVENT));
}

export function getQueryStats() {
  const queries = getQueries();

  return {
    total: queries.length,
    new: queries.filter((q) => q.status === 'New').length,
    acknowledged: queries.filter((q) => q.status === 'Acknowledged').length,
    inProgress: queries.filter((q) => q.status === 'In Progress').length,
    escalated: queries.filter((q) => q.status === 'Escalated').length,
    resolved: queries.filter((q) => q.status === 'Resolved').length,
    unread: queries.filter((q) => !q.isRead).length,
  };
}

export function subscribeToQueries(callback) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(QUERIES_EVENT, callback);

  return () => {
    window.removeEventListener(QUERIES_EVENT, callback);
  };
}

/* ---------------------------------------------------------
   TEAM MEMBER OPERATIONS
--------------------------------------------------------- */

export function getTeamMembers() {
  if (typeof window === 'undefined') return [];

  try {
    const saved = localStorage.getItem(TEAM_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTeamMembers(members) {
  if (typeof window === 'undefined') return;

  localStorage.setItem(TEAM_KEY, JSON.stringify(members));
  window.dispatchEvent(new CustomEvent(TEAM_EVENT));
}

export function addTeamMember({ name, role = 'Staff', phone = '' }) {
  const current = getTeamMembers();

  const member = {
    id: `member-${Date.now()}`,
    name: name.trim(),
    role,
    phone: phone.trim(),
    active: true,
    addedAt: new Date().toISOString(),
  };

  saveTeamMembers([...current, member]);
  return member;
}

export function removeTeamMember(memberId) {
  const updated = getTeamMembers().filter(
    (item) => item.id !== memberId
  );
  saveTeamMembers(updated);
}

export function subscribeToTeam(callback) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(TEAM_EVENT, callback);

  return () => {
    window.removeEventListener(TEAM_EVENT, callback);
  };
}
