import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, View } from "react-native";

import { REFRESH_KEY, TOKEN_KEY, api, setAuthListener } from "@/src/api";
import { registerForPush } from "@/src/push";
import { useTheme } from "@/src/theme";
import type { User } from "@/src/types";
import { storage } from "@/src/utils/storage";

interface AuthCtx {
  token: string | null;
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User, refreshToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  token: null,
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    (async () => {
      const t = await storage.secureGet(TOKEN_KEY, "");
      if (t) {
        try {
          const u = await api<User>("/auth/me");
          setToken((await storage.secureGet(TOKEN_KEY, "")) || t);
          setUser(u);
          registerForPush(u.id);
        } catch {
          await storage.secureRemove(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    // api() rotated the tokens or the session expired
    setAuthListener((t) => {
      setToken(t);
      if (!t) setUser(null);
    });
  }, []);

  const signIn = useCallback(async (t: string, u: User, refreshToken?: string) => {
    await storage.secureSet(TOKEN_KEY, t);
    if (refreshToken) await storage.secureSet(REFRESH_KEY, refreshToken);
    setToken(t);
    setUser(u);
    registerForPush(u.id);
  }, []);

  const signOut = useCallback(async () => {
    const rt = await storage.secureGet(REFRESH_KEY, "");
    if (rt) api("/auth/logout", { method: "POST", body: { refresh_token: rt } }).catch(() => {});
    await storage.secureRemove(REFRESH_KEY);
    await storage.secureRemove(TOKEN_KEY);
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const u = await api<User>("/auth/me", { token });
      setUser(u);
    } catch {}
  }, [token]);

  const value = useMemo(
    () => ({ token, user, loading, signIn, signOut, refresh }),
    [token, user, loading, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function FullScreenLoader() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}
