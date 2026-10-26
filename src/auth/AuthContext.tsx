import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { LoginResponse, MeResponse, PublicUser } from "@shared/types";
import { api, setCsrfToken, ApiRequestError } from "../api/client";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: PublicUser) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>("/api/auth/me");
      setCsrfToken(me.csrfToken);
      setUserState(me.user);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) {
        setUserState(null);
        setCsrfToken(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<LoginResponse>("/api/auth/login", {
      username,
      password,
    });
    setCsrfToken(res.csrfToken);
    setUserState(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setCsrfToken(null);
      setUserState(null);
    }
  }, []);

  const setUser = useCallback((u: PublicUser) => setUserState(u), []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, setUser }),
    [user, loading, login, logout, refresh, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
