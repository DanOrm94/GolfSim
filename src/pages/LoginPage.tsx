import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Alert } from "../components/ui";
import { ApiRequestError } from "../api/client";

interface LocationState {
  from?: { pathname?: string };
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    const dest = user.mustChangePassword
      ? "/account/password"
      : user.role === "admin"
        ? "/admin"
        : "/book";
    return <Navigate to={dest} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const u = await login(username, password);
      const from = (location.state as LocationState | null)?.from?.pathname;
      if (u.mustChangePassword) {
        navigate("/account/password", { replace: true });
      } else if (from) {
        navigate(from, { replace: true });
      } else {
        navigate(u.role === "admin" ? "/admin" : "/book", { replace: true });
      }
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Could not log in."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1 className="text-2xl font-extrabold text-fairway-900">Log in</h1>
        <p className="mt-1 text-sm text-fairway-600">
          Use the username and password provided by an administrator.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {error && <Alert kind="error">{error}</Alert>}
          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-xs text-fairway-500">
          No public sign-up. Accounts are managed by the facility administrator.
        </p>
      </div>
    </div>
  );
}
