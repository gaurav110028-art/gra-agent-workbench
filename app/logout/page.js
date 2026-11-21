'use client';
import { useState } from 'react';
import { logoutUser } from '../../lib/auth-client';
export default function LogoutPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <main className="loginOverlay"><section className="loginCard">
    <h1 className="loginHeading">Sign out of GRA</h1>
    <p className="loginHint">This revokes the current server session. Existing workflow data remains in this browser.</p>
    {error && <p role="alert" className="loginError">{error}</p>}
    <button className="loginBtn" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await logoutUser(); window.location.replace('/'); }
      catch (e) { setError(e.message); setBusy(false); }
    }}>{busy ? 'Signing out…' : 'Confirm sign out'}</button>
    <a className="redactor-back" href="/">Return to workbench</a>
  </section></main>;
}
