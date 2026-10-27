import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";

import { ApiError, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

/** Cross-platform multipart upload: reads the local file as a Blob (web + native) and posts it with extra fields. */
export async function uploadForm<T = any>(
  path: string,
  file: { uri: string; name: string; type?: string },
  fields: Record<string, string | null | undefined> = {},
): Promise<T> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const blob = Platform.OS === "web" ? await (await fetch(file.uri)).blob() : await (await expoFetch(file.uri)).blob();
  const form = new FormData();
  form.append("file", blob as any, file.name);
  for (const [k, v] of Object.entries(fields)) if (v != null && v !== "") form.append(k, v);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof data?.detail === "string" ? data.detail : "Caricamento non riuscito", res.status);
  return data as T;
}
