import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PublicUser } from "@shared/types";
import { api, ApiRequestError } from "../../api/client";
import { Alert, EmptyState, PageHeader, Spinner } from "../../components/ui";
import AdminNav from "./AdminNav";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ users: PublicUser[] }>(
        `/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`
      );
      setUsers(res.users);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load(q.trim());
  };

  return (
    <div>
      <PageHeader
        title="Users"
        actions={
          <Link to="/admin/users/new" className="btn-primary">
            Create user
          </Link>
        }
      />
      <AdminNav />

      <form className="mb-4 flex gap-2" onSubmit={onSearch}>
        <input
          className="input max-w-xs"
          placeholder="Search username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search username"
        />
        <button className="btn-secondary">Search</button>
      </form>

      {error && <Alert kind="error">{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-fairway-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-fairway-50 text-fairway-700">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Password</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-fairway-100">
                  <td className="px-4 py-3 font-semibold text-fairway-900">{u.username}</td>
                  <td className="px-4 py-3 capitalize">{u.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${
                        u.status === "active"
                          ? "bg-fairway-100 text-fairway-800"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-fairway-600">
                    {u.mustChangePassword ? "Must change" : "OK"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/users/${u.id}`} className="text-fairway-700 hover:underline">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
