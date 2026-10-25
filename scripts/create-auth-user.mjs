import { emitKeypressEvents } from 'node:readline';
import { hashPassword } from '../lib/security/auth.mjs';
const [email, role = 'viewer', id = 'gra-user'] = process.argv.slice(2);
if (!email || !['admin', 'operator', 'viewer'].includes(role) || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Usage: node scripts/create-auth-user.mjs email role id (password is read from hidden input).');
let password = '';
if (process.stdin.isTTY) {
  process.stderr.write('Password (16–256 characters; hidden): ');
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  password = await new Promise(resolve => {
    const listener = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') { process.stdin.setRawMode(false); process.exit(130); }
      if (key.name === 'return') { process.stdin.off('keypress', listener); process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write('\n'); resolve(password); }
      else if (key.name === 'backspace') password = [...password].slice(0, -1).join('');
      else if (!key.ctrl && !key.meta && text && !/[\r\n\u0000-\u001f]/.test(text)) password += text;
    };
    process.stdin.on('keypress', listener);
  });
} else {
  for await (const chunk of process.stdin) password += chunk.toString();
  password = password.replace(/\r?\n$/, '');
}
const passwordHash = await hashPassword(password);
password = '';
console.log(JSON.stringify({ id, email, name: id, role, version: 1, passwordHash }));
