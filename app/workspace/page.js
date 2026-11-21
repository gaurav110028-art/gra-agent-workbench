import { headers } from 'next/headers';
import Workbench from '../Workbench';
import { workspaceView } from '../access-destinations';
import { authenticate, authConfig, can } from '../../lib/security/auth.mjs';
import { SecurityError } from '../../lib/security/errors.mjs';
import { requireWhatsAppAdmin } from '../../lib/security/whatsapp.mjs';

export default async function WorkspacePage({ searchParams }) {
  const requestHeaders = await headers();
  const principal = await authenticate(new Request(authConfig().origin, { headers: requestHeaders }));
  if (principal.role === 'service' || !can(principal, 'workbench:read')) throw new SecurityError(403, 'Browser access is not authorized.');
  let canManageWhatsApp = false;
  try {
    requireWhatsAppAdmin(principal);
    canManageWhatsApp = true;
  } catch (error) {
    if (!(error instanceof SecurityError)) throw error;
  }
  return <Workbench initialView={workspaceView((await searchParams).view)} canManageWhatsApp={canManageWhatsApp} />;
}
