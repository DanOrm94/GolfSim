import { Link, NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";

function navClass({ isActive }: { isActive: boolean }): string {
  return [
    "rounded-lg px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-fairway-600 text-white"
      : "text-fairway-100 hover:bg-fairway-700/60",
  ].join(" ");
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="bg-fairway-800 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span aria-hidden className="text-xl">⛳</span>
            <span>Fairway Indoor Golf</span>
          </Link>
          <nav className="ml-auto flex flex-wrap items-center gap-1" aria-label="Main">
            {user && (
              <>
                <NavLink to="/book" className={navClass}>
                  Book
                </NavLink>
                <NavLink to="/bookings" className={navClass}>
                  My bookings
                </NavLink>
                {user.role === "admin" && (
                  <NavLink to="/admin" className={navClass}>
                    Admin
                  </NavLink>
                )}
                <NavLink to="/account/password" className={navClass}>
                  Password
                </NavLink>
                <span className="ml-2 hidden text-sm text-fairway-200 sm:inline">
                  {user.username}
                </span>
                <button onClick={onLogout} className="btn-secondary ml-1">
                  Log out
                </button>
              </>
            )}
            {!user && (
              <NavLink to="/login" className={navClass}>
                Log in
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-fairway-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-fairway-600">
          Open 24 hours a day, 7 days a week. One simulator, booked by the hour.
        </div>
      </footer>
    </div>
  );
}
