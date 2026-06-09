import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role?: string;
  status?: string;
  credits?: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "brand_os_auth_token";

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function getAuthToken(): string | null {
  return getStoredToken();
}

async function authFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getStoredToken();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(url, { ...init, headers, credentials: "include" });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
        if (res.status === 401) setStoredToken(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await authFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Sign in failed");
    if (data.token) setStoredToken(data.token);
    setUser(data.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const res = await authFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Sign up failed");
    if (data.token) setStoredToken(data.token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setStoredToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
