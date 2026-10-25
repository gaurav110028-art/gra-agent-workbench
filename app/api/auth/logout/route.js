import { secure } from '../../../../lib/security/route.mjs';
import { logout } from '../../../../lib/security/auth.mjs';
export const runtime = 'nodejs';
export const POST = secure({ permission: 'workbench:read', maxBytes: 1024 }, request => logout(request));
