import { MAX_IMPORT_BYTES } from '../../../../lib/migration/legacy-schema.mjs';
import { createMigrationService } from '../../../../lib/migration/repository.mjs';
import { SecurityError } from '../../../../lib/security/errors.mjs';
import { secure } from '../../../../lib/security/route.mjs';
import { requireWhatsAppAdmin } from '../../../../lib/security/whatsapp.mjs';
import { getConfiguredPostgresRepository } from '../../../../lib/database/postgres-repository.mjs';

export const runtime = 'nodejs';

function migrationService() {
  return createMigrationService(getConfiguredPostgresRepository());
}

export const POST = secure({
  permission: 'workspace:migrate',
  limit: 10,
  maxBytes: MAX_IMPORT_BYTES,
  authorize: principal => {
    requireWhatsAppAdmin(principal);
    migrationService().requireRepository();
  },
}, async (request, principal) => {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new SecurityError(415, 'A JSON import batch is required.', 'INVALID_MIGRATION_TYPE');
  }
  return Response.json(await migrationService().importBatch(await request.json(), principal.id));
});
