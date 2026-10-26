import { useEffect, useState } from "react";

// The facility timezone is public-ish config needed for display. We derive it from
// the availability endpoint (which returns it) and cache it in sessionStorage so
// booking-history pages can format times without an extra settings round-trip.
//
// If nothing is cached yet, we fall back to Europe/London (the documented default).
const KEY = "gs_facility_tz";
const DEFAULT_TZ = "Europe/London";

export function cacheTimezone(tz: string): void {
  try {
    sessionStorage.setItem(KEY, tz);
  } catch {
    /* ignore */
  }
}

export function useTimezone(): string {
  const [tz, setTz] = useState<string>(() => {
    try {
      return sessionStorage.getItem(KEY) ?? DEFAULT_TZ;
    } catch {
      return DEFAULT_TZ;
    }
  });

  useEffect(() => {
    // Keep in sync if another page updates the cache.
    const onStorage = () => {
      try {
        const v = sessionStorage.getItem(KEY);
        if (v) setTz(v);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return tz;
}
