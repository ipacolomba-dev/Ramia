import { Redirect, Stack } from "expo-router";
import React from "react";

import { FullScreenLoader, useAuth } from "@/src/auth";

/** Protected area: every route below requires a signed-in user. Role checks live in each area layout. */
export default function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
