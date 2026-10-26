import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MeResponse } from "@shared/types";
import { api, setCsrfToken, ApiRequestError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert, PageHeader } from "../components/ui";
import { validatePassword } from "@shared/validation";

export default function ChangePasswordPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mustChange = user?.mustChangePassword ?? false;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    const check = validatePassword(newPassword);
    if (!check.ok) {
      setError(check.message!);
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<MeResponse>("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setCsrfToken(res.csrfToken);
      setUser(res.user);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      // After a forced change, send them on to booking.
      setTimeout(() => navigate(res.user.role === "admin" ? "/admin" : "/book"), 900);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not change password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change password" />
      {mustChange && (
        <div className="mb-4">
          <Alert kind="info">
            You are using a temporary password. Please set a new password to continue.
          </Alert>
        </div>
      )}
      <div className="card">
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && <Alert kind="error">{error}</Alert>}
          {success && <Alert kind="success">Password updated.</Alert>}
          <div>
            <label className="label" htmlFor="current">
              Current password
            </label>
            <input
              id="current"
              type="password"
              className="input"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="new">
              New password
            </label>
            <input
              id="new"
              type="password"
              className="input"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-fairway-500">
              Use 3 of: lowercase, uppercase, number, symbol.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              Confirm new password
            </label>
            <input
              id="confirm"
              type="password"
              className="input"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <button className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
