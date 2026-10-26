import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Booking, PublicUser, Role, ResetPasswordResult } from "@shared/types";
import { api, ApiRequestError } from "../../api/client";
import { Alert, PageHeader, Spinner, StatusBadge } from "../../components/ui";
import TempPasswordReveal from "../../components/TempPasswordReveal";
import { formatDateTime } from "../../lib/format";
import { useTimezone } from "../../lib/useTimezone";
import AdminNav from "./AdminNav";

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const tz = useTimezone();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editUsername, setEditUsername] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, bookingsRes] = await Promise.all([
        api.get<{ users: PublicUser[] }>(`/api/admin/users`),
        api.get<{ bookings: Booking[] }>(`/api/admin/users/${id}/bookings`),
      ]);
      const found = usersRes.users.find((u) => String(u.id) === id) ?? null;
      setUser(found);
      setEditUsername(found?.username ?? "");
      setBookings(bookingsRes.bookings);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not load user.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.patch<{ user: PublicUser }>(`/api/admin/users/${id}`, body);
      setUser(res.user);
      setEditUsername(res.user.username);
      setNotice(msg);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!window.confirm("Generate a new temporary password? This logs the user out everywhere.")) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setTempPassword(null);
    try {
      const res = await api.post<ResetPasswordResult>(
        `/api/admin/users/${id}/reset-password`
      );
      setTempPassword(res.temporaryPassword);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  };

  const forceChange = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/users/${id}/force-change-password`);
      setNotice("User will be required to change their password at next login.");
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  if (!user) return <Alert kind="error">{error ?? "User not found."}</Alert>;

  return (
    <div>
      <PageHeader
        title={user.username}
        subtitle={`${user.role} · ${user.status}`}
        actions={
          <Link to="/admin/users" className="btn-secondary">
            Back
          </Link>
        }
      />
      <AdminNav />

      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}
        {tempPassword && (
          <TempPasswordReveal username={user.username} password={tempPassword} />
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card space-y-3">
            <h2 className="font-bold text-fairway-900">Account</h2>

            <div>
              <label className="label" htmlFor="uname">
                Username
              </label>
              <div className="flex gap-2">
                <input
                  id="uname"
                  className="input"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                />
                <button
                  className="btn-secondary"
                  disabled={busy || editUsername === user.username}
                  onClick={() => patch({ username: editUsername }, "Username updated.")}
                >
                  Save
                </button>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="role">
                Role
              </label>
              <select
                id="role"
                className="input"
                value={user.role}
                disabled={busy}
                onChange={(e) =>
                  patch({ role: e.target.value as Role }, "Role updated.")
                }
              >
                <option value="customer">Customer</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {user.status === "active" ? (
                <button
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => patch({ status: "disabled" }, "Account disabled.")}
                >
                  Disable account
                </button>
              ) : (
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => patch({ status: "active" }, "Account enabled.")}
                >
                  Enable account
                </button>
              )}
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold text-fairway-900">Password</h2>
            <p className="text-sm text-fairway-600">
              Passwords are never shown. A reset generates a new temporary password
              (displayed once) and forces a change at next login.
            </p>
            <p className="text-sm">
              Status:{" "}
              <strong>{user.mustChangePassword ? "Must change at next login" : "Set"}</strong>
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy} onClick={resetPassword}>
                Reset password
              </button>
              <button
                className="btn-secondary"
                disabled={busy || user.mustChangePassword}
                onClick={forceChange}
              >
                Force change
              </button>
            </div>
          </div>
        </div>

        <section>
          <h2 className="mb-2 font-bold text-fairway-900">Booking history</h2>
          {bookings.length === 0 ? (
            <Alert kind="info">No bookings for this user.</Alert>
          ) : (
            <ul className="space-y-2">
              {bookings.map((b) => (
                <li key={b.id} className="card flex items-center justify-between py-3">
                  <div>
                    <span className="font-semibold text-fairway-900">
                      {formatDateTime(b.startUtc, tz)}
                    </span>
                    <span className="ml-2 text-xs text-fairway-500">{b.reference}</span>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
