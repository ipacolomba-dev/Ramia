import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/ui";
import { AuthProvider } from "@/src/auth";
import { CartProvider } from "@/src/cart";
import { LocaleProvider } from "@/src/i18n";
import { queryClient } from "@/src/query-client";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Push: foreground display behavior (module scope, native only)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Push: Android notification channel (module scope)
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

export default function RootLayout() {
  const router = useRouter();
  // One app level ErrorBoundary; a render crash shows a reload screen
  // instead of a blank app.
  const [fontsLoaded, fontError] = useFonts({
    "PlayfairDisplay-Bold": require("../assets/fonts/PlayfairDisplay-Bold.ttf"),
    "DMSans-Regular": require("../assets/fonts/DMSans-Regular.ttf"),
    "DMSans-Medium": require("../assets/fonts/DMSans-Medium.ttf"),
    "DMSans-Bold": require("../assets/fonts/DMSans-Bold.ttf"),
  });

  useEffect(() => {
    if (Platform.OS === "web") return;
    const openUrl = (data: any) => {
      const url = data?.deeplink || data?.action_url;
      if (!url) return;
      if (url.startsWith("http")) {
        Linking.openURL(url);
      } else {
        router.push(url);
      }
    };
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openUrl(response.notification.request.content.data || {});
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openUrl(response.notification.request.content.data || {});
    });
    return () => {
      tapSub.remove();
    };
  }, [router]);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LocaleProvider>
            <ToastProvider>
              <AuthProvider>
                <CartProvider>
                  <KeyboardProvider>
                    {fontsLoaded || fontError ? (
                      <Stack screenOptions={{ headerShown: false }} />
                    ) : null}
                  </KeyboardProvider>
                </CartProvider>
              </AuthProvider>
            </ToastProvider>
          </LocaleProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
