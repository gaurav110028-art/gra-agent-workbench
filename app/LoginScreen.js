"use client";
import { useState, useEffect } from "react";
import { loginUser, getSession } from "./calendarStore";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (session) onLogin(session);
  }, [onLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = loginUser(email.trim(), password);
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loginOverlay">
      <div className="loginCard">
        <div className="loginBrand">
          <div className="loginLogo">GRA</div>
          <p className="loginSubtitle">Agent Workbench</p>
        </div>
        <h2 className="loginHeading">Welcome back</h2>
        <p className="loginHint">Sign in to your workspace</p>
        <form className="loginForm" onSubmit={handleSubmit}>
          <div className="loginField">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="admin@gra.in"
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
                tabIndex={-1}
              >
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {error && <div className="loginError">{error}</div>}
          <button
            id="login-submit"
            type="submit"
            className="loginBtn"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="loginDefaultHint">
          Default: admin@gra.in / gra2024admin
        </p>
      </div>
    </div>
  );
}
