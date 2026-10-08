import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

/**
 * Register the device for Emergent managed push. Permission is requested first, then the
 * native device token is sent to the backend. Never blocks the app flow on denial.
 * Only runs on native (no-op on web). Only works in a dev-client/standalone build.
 */
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${BASE}/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, platform: Platform.OS, device_token: tokenResp.data }),
    });
  } catch {
    // push is best-effort; ignore failures (e.g. Expo Go, no credentials)
  }
}
