import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { FullScreenLoader, useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { homeFor } from "@/src/roles";
import { useTheme } from "@/src/theme";
import type { Role } from "@/src/types";

export interface AreaTab {
  name: string;
  label: [string, string]; // [it, en]
  icon: string;
  roles?: Role[]; // visible only for these roles (admin always sees all)
}

/** Bottom tabs for a role area + role guard. Routes in `hidden` stay reachable but get no tab. */
export function AreaTabs({ roles, tabs, hidden }: { roles: Role[]; tabs: AreaTab[]; hidden: string[] }) {
  const { colors } = useTheme();
  const { L } = useT();
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "admin" && !roles.includes(user.role)) return <Redirect href={homeFor(user.role) as any} />;

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.divider,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      {tabs.map((tab) => {
        const visible = !tab.roles || user.role === "admin" || tab.roles.includes(user.role);
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: L(tab.label[0], tab.label[1]),
              href: visible ? undefined : null,
              tabBarButtonTestID: `tab-${tab.name}`,
              tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon as any} size={size} color={color} />,
            }}
          />
        );
      })}
      {hidden.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
