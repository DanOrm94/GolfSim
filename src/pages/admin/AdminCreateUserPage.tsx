import { useState } from "react";
import { Link } from "react-router-dom";
import type { CreateUserResult, Role } from "@shared/types";
import { api, ApiRequestError } from "../../api/client";
import { Alert, PageHeader } from "../../components/ui";
import TempPasswordReveal from "../../components/TempPasswordReveal";
import AdminNav from "./AdminNav";
import { validateUsername, validatePassword } from "@shared/validation";

export default function AdminCreateUserPage() {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("customer");
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateUserResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const uCheck = validateUsername(username);
    if (!uCheck.ok) {
      setError(uCheck.message!);
      return;
    }
    if (mode === "manual") {
      const pCheck = validatePassword(password);
      if (!pCheck.ok) {
        setError(pCheck.message!);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.post<CreateUserResult>("/api/admin/users", {
        username,
        role,
        generatePassword: mode === "generate",
        password: mode === "manual" ? password : undefined,
        mustChangePassword: mode === "manual" ? mustChange : true,
      });
      setResult(res);
      setUsername("");
      setPassword("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not create user.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Create user"
        actions={
          <Link to="/admin/users" className="btn-secondary">
            Back to users
          </Link>
        }
      />
      <AdminNav />

      {result && (
        <div className="mb-4 space-y-3">
          <Alert kind="success">
            Account <strong>{result.user.username}</strong> created ({result.user.role}).
          </Alert>
          {result.temporaryPassword && (
            <TempPasswordReveal
              username={result.user.username}
              password={result.temporaryPassword}
            />
          )}
        </div>
      )}

      <div className="card max-w-lg">
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && <Alert kind="error">{error}</Alert>}

          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-fairway-500">
              3–32 chars: lowercase letters, numbers, dot, underscore, hyphen. Stored
              normalised (lowercase).
            </p>
          </div>

          <div>
            <label className="label" htmlFor="role">
              Role
            </label>
            <select
              id="role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="customer">Customer</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="label">Initial password</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={mode === "generate"}
                onChange={() => setMode("generate")}
              />
              Generate a strong temporary password (recommended)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
              />
              Set an initial password manually
            </label>
          </fieldset>

          {mode === "manual" && (
            <div className="space-y-3 rounded-lg bg-fairway-50 p-3">
              <div>
                <label className="label" htmlFor="password">
                  Initial password
                </label>
                <input
                  id="password"
                  type="text"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mustChange}
                  onChange={(e) => setMustChange(e.target.checked)}
                />
                Require password change at next login
              </label>
            </div>
          )}

          <button className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
