"use client";
import { useState, useEffect } from "react";
import { loginUser, getSession } from "../lib/auth-client";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    let active = true;
    getSession().then(session => { if (active && session) onLogin(session); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [onLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await loginUser(email.trim(), password);
      setPassword('');
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="loginOverlay">
      <section className="loginCard" aria-labelledby="login-title">
        <div className="loginBrand">
          <div className="loginLogo">GRA</div>
          <p className="loginSubtitle">Agent Workbench</p>
        </div>
        <h1 className="loginHeading" id="login-title">Welcome back</h1>
        <p className="loginHint">Sign in to your workspace</p>
        <form className="loginForm" onSubmit={handleSubmit}>
          <div className="loginField">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="Your configured account email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
          </div>
          <div className="loginField">
            <label htmlFor="login-password">Password</label>
            <div className="loginPasswordWrap">
              <input
                id="login-password"
                type={showPass ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="loginShowPass"
                onClick={() => setShowPass((s) => !s)}
                aria-pressed={showPass}
              >
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {error && <div role="alert" className="loginError">{error}</div>}
          <button
            id="login-submit"
            type="submit"
            className="loginBtn"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="loginDefaultHint">Server accounts are provisioned by your administrator. There is no default password.</p>
        <a className="graLoginReturn" href="/">Return to public demo</a>
      </section>
    </main>
  );
}
