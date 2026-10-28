import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { Platform } from "react-native";

import { api } from "@/src/api";

export type PayKind = "order" | "shipment" | "visibility";

/** Where Stripe sends the user back: the web app origin (same host serves the app and the API). */
export const appOrigin = () =>
  Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : (process.env.EXPO_PUBLIC_BACKEND_URL as string);

/** Opens Stripe Checkout. The amount is always computed by the server from the order/shipment/plan. */
export async function startCheckout(kind: PayKind, ref_id: string) {
  const { url, session_id } = await api<{ url: string; session_id: string }>("/payments/checkout", {
    method: "POST",
    body: { kind, ref_id, origin_url: appOrigin() },
  });
  if (Platform.OS === "web") {
    window.location.href = url;
    return;
  }
  await WebBrowser.openBrowserAsync(url);
  router.push({ pathname: "/pagamento", params: { session_id } } as any);
}

export async function startConnectOnboarding() {
  const { url } = await api<{ url: string }>("/payments/connect/onboard", { method: "POST", body: { origin_url: appOrigin() } });
  if (Platform.OS === "web") window.location.href = url;
  else await WebBrowser.openBrowserAsync(url);
}

export const ESCROW_LABELS: Record<string, [string, string]> = {
  held: ["In garanzia", "Held in escrow"],
  disputed: ["Contestato", "Disputed"],
  released: ["Rilasciato", "Released"],
  refunded: ["Rimborsato", "Refunded"],
  refund_manual: ["Rimborso da completare", "Refund to complete"],
};

export const escrowTone = (s?: string) =>
  s === "released" ? "success" : s === "disputed" || s === "refund_manual" ? "error" : s === "refunded" ? "neutral" : "info";
