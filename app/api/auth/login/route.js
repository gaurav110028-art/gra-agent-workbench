import { secure } from '../../../../lib/security/route.mjs';
import { login } from '../../../../lib/security/auth.mjs';
export const runtime = 'nodejs';
export const POST = secure({ publicRoute: true, maxBytes: 4096 }, request => login(request));
