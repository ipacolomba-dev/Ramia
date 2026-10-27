import { Redirect, Stack } from "expo-router";
import React from "react";

import { useAuth } from "@/src/auth";
import { homeFor } from "@/src/roles";

export default function AuthLayout() {
  const { user, loading } = useAuth();
  // Already signed in: skip login/registration and go to the role area.
  if (!loading && user) return <Redirect href={homeFor(user.role) as any} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
