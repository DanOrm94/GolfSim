import { useState } from "react";
import { Alert } from "./ui";

// Shows a newly generated temporary password ONCE. It exists only in memory here;
// the server never stores or returns it again.
export default function TempPasswordReveal({
  password,
  username,
}: {
  password: string;
  username: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Alert kind="info">
      <p className="font-semibold">Temporary password for {username}</p>
      <p className="mt-1 text-xs">
        Shown once only. Share it securely with the customer. They must change it at
        first login.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded bg-white px-3 py-2 font-mono text-base tracking-wider text-fairway-900 ring-1 ring-fairway-200">
          {password}
        </code>
        <button className="btn-secondary" onClick={copy} type="button">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </Alert>
  );
}
