import { Redirect, Stack } from "expo-router";
import React from "react";

import { useAuth } from "@/src/auth";

/** B2B deals are for professional buyers only (consumers are sent back to the market). */
export default function DealsLayout() {
  const { user } = useAuth();
  if (user && user.role === "consumer") return <Redirect href="/buyer/mercato" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
