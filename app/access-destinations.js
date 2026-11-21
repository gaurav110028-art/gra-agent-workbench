export const workspaceViews = {
  architect: 'GRA AI Architect',
  queryInbox: 'Query Inbox',
  runs: 'Runs',
  approvals: 'Approvals',
  settings: 'Settings',
  calendar: 'Calendar',
};

export function workspaceView(value) {
  return typeof value === 'string' && Object.hasOwn(workspaceViews, value) ? value : 'dashboard';
}

export function workspaceDestination(view) {
  return workspaceView(view) === 'dashboard' ? '/workspace' : `/workspace?view=${view}`;
}

const destinations = new Set(['/', '/workspace', '/workspace/migration', '/whatsapp', '/redactor', ...Object.keys(workspaceViews).map(workspaceDestination)]);

export function loginDestination(value) {
  return destinations.has(value) ? value : '/workspace';
}
