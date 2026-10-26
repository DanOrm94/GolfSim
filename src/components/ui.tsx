import type { ReactNode } from "react";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-fairway-600" role="status">
      <span
        aria-hidden
        className="h-5 w-5 animate-spin rounded-full border-2 border-fairway-300 border-t-fairway-600"
      />
      <span>{label}</span>
    </div>
  );
}

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "success" | "info";
  children: ReactNode;
}) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-fairway-200 bg-fairway-50 text-fairway-800",
    info: "border-sand-200 bg-sand-50 text-fairway-900",
  }[kind];
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${styles}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="card text-center">
      <p className="font-semibold text-fairway-800">{title}</p>
      {description && <p className="mt-1 text-sm text-fairway-600">{description}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: "active" | "cancelled" }) {
  const cls =
    status === "active"
      ? "bg-fairway-100 text-fairway-800"
      : "bg-red-100 text-red-700";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-fairway-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-fairway-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
