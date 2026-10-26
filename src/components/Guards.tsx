import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Spinner } from "./ui";

// NOTE: These guards are a UX convenience only. Every protected API endpoint
// independently enforces authentication and role on the server. A user cannot gain
// access by manipulating client state.

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <CenteredSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // Force temporary-password change before anything else.
  if (user.mustChangePassword && location.pathname !== "/account/password") {
    return <Navigate to="/account/password" replace />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <CenteredSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/account/password" replace />;
  if (user.role !== "admin") return <Navigate to="/book" replace />;
  return <>{children}</>;
}

function CenteredSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
