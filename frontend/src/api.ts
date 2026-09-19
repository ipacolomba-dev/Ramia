import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "auth_token";
const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; token?: string } = {},
): Promise<T> {
  const token = opts.token ?? (await storage.secureGet(TOKEN_KEY, ""));
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
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

/** Platform-correct multipart upload (web needs a real Blob, native needs {uri,name,type}). */
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
