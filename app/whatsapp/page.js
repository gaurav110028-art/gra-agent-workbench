import { headers } from 'next/headers';
import { authenticate, authConfig } from '../../lib/security/auth.mjs';
import { requireWhatsAppAdmin } from '../../lib/security/whatsapp.mjs';
import Manager from './Manager';

export default async function WhatsAppPage() {
  const requestHeaders = await headers();
  requireWhatsAppAdmin(await authenticate(new Request(authConfig().origin, { headers: requestHeaders })));
  return <Manager />;
}
