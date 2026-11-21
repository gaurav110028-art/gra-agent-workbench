import { SecurityError } from './errors.mjs';

// Use the authenticated server principal. Client profile fields never grant access.
export function requireWhatsAppAdmin(principal, env = process.env) {
  if (principal?.role !== 'admin') throw new SecurityError(403, 'WhatsApp administrator access is required.', 'FORBIDDEN');
  const adminId = env.GRA_WHATSAPP_ADMIN_ID;
  if (!principal.config.users.some(user => user.id === adminId && user.role === 'admin')) {
    throw new SecurityError(503, 'WhatsApp administrator access is not configured.', 'WHATSAPP_NOT_CONFIGURED');
  }
  if (principal.id !== adminId) throw new SecurityError(403, 'WhatsApp administrator access is required.', 'FORBIDDEN');
}
