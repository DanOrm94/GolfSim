import { NavLink } from "react-router-dom";

const links = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/bookings", label: "Bookings" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/settings", label: "Settings" },
];

export default function AdminNav() {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 rounded-xl bg-fairway-100 p-1" aria-label="Admin">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) =>
            [
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              isActive ? "bg-white text-fairway-900 shadow-sm" : "text-fairway-600 hover:text-fairway-900",
            ].join(" ")
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
