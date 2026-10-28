import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "auth_token";
export const REFRESH_KEY = "auth_refresh";
const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let authListener: ((token: string | null) => void) | null = null;
export function setAuthListener(fn: (token: string | null) => void) {
  authListener = fn;
}

let refreshing: Promise<string | null> | null = null;
/** Exchanges the stored refresh token for a new pair (one shared request for concurrent 401s). */
async function refreshAccess(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = await storage.secureGet(REFRESH_KEY, "");
      if (!rt) return null;
      const r = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      }).catch(() => null);
      if (!r || !r.ok) {
        if (r && r.status === 401) {
          await storage.secureRemove(REFRESH_KEY);
          await storage.secureRemove(TOKEN_KEY);
          authListener?.(null);
        }
        return null;
      }
      const data = await r.json();
      await storage.secureSet(TOKEN_KEY, data.access_token);
      await storage.secureSet(REFRESH_KEY, data.refresh_token);
      authListener?.(data.access_token);
      return data.access_token as string;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; token?: string } = {},
): Promise<T> {
  const token = opts.token ?? (await storage.secureGet(TOKEN_KEY, ""));
  const send = (tk: string | null) =>
    fetch(`${BASE}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  let res = await send(token);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const fresh = await refreshAccess();
    if (fresh) res = await send(fresh);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : `Errore ${res.status}`;
    throw new ApiError(detail, res.status);
  }
  return data as T;
}

export function fullImgUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/")) return `${process.env.EXPO_PUBLIC_BACKEND_URL}${url}`;
  return url;
}

/** Platform-correct PDF upload for catalog import. */
export async function uploadPdf(uri: string, name = "catalogo.pdf"): Promise<{ imported: number; products: any[] }> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: "application/pdf" } as any);
  }
  const res = await fetch(`${BASE}/products/import-pdf`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : "Import non riuscito";
    throw new ApiError(detail, res.status);
  }
  return data as { imported: number; products: any[] };
}

/** Platform-correct multipart image upload (web needs a real Blob, native needs {uri,name,type}). */
export async function uploadImage(uri: string, name = "foto.jpg"): Promise<{ url: string }> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: "image/jpeg" } as any);
  }
  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : "Upload non riuscito";
    throw new ApiError(detail, res.status);
  }
  return data as { url: string };
}
