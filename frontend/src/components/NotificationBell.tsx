import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fonts, useTheme } from "@/src/theme";

/** Bell with an unread-alert badge; taps through to the regulatory alerts screen. */
export function NotificationBell({ testID = "notification-bell" }: { testID?: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const enabled = user?.role === "producer" || user?.role === "admin";

  const q = useQuery({
    queryKey: ["reg-alerts-unread"],
    queryFn: () => api<{ count: number }>("/regulatory/alerts/unread-count"),
    enabled,
    refetchInterval: 30000,
  });

  if (!enabled) return null;
  const count = q.data?.count ?? 0;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() => router.push("/trade/alerts")}
      hitSlop={10}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.onSurface} />
      {count > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.error,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        >
          <Text style={{ fontFamily: fonts.textBold, fontSize: 10, color: colors.onError }}>
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
