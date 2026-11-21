import { headers } from 'next/headers';
import { authenticate, authConfig } from '../../../lib/security/auth.mjs';
import { requireWhatsAppAdmin } from '../../../lib/security/whatsapp.mjs';
import MigrationPreview from './MigrationPreview';

export default async function MigrationPage() {
  const requestHeaders = await headers();
  requireWhatsAppAdmin(await authenticate(new Request(authConfig().origin, { headers: requestHeaders })));
  return <MigrationPreview />;
}
