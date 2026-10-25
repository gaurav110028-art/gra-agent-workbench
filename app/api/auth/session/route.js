import { secure } from '../../../../lib/security/route.mjs';
import { publicUser } from '../../../../lib/security/auth.mjs';
export const runtime = 'nodejs';
export const GET = secure({ permission: 'workbench:read', limit: 120 }, (_request, principal) => Response.json({ user: publicUser(principal) }));
