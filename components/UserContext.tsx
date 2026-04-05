"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type SessionUser = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  office_level: string;
  province: string | null;
  municipality: string | null;
  must_change_password: boolean;
};

type UserContextValue = {
  user: SessionUser | null;
  loading: boolean;
  isAdmin: boolean;
  isEditor: boolean;
};

const UserContext = createContext<UserContextValue>({
  user: null, loading: true, isAdmin: false, isEditor: false,
});

export function useUser() { return useContext(UserContext); }

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.user) setUser(d.user); })
      .finally(() => setLoading(false));
  }, []);

  const isAdmin  = !!user && ["super_admin", "admin"].includes(user.role);
  const isEditor = !!user && ["super_admin", "admin", "editor"].includes(user.role);

  return (
    <UserContext.Provider value={{ user, loading, isAdmin, isEditor }}>
      {children}
    </UserContext.Provider>
  );
}
