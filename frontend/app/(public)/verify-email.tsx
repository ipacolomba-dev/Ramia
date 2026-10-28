import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Notice } from "@/src/components/blocks";
import { Btn, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { homeFor } from "@/src/roles";
import { spacing } from "@/src/theme";

export default function VerifyEmail() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { user, refresh } = useAuth() as any;
  const { L } = useT();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!token) return setState("error");
    api("/auth/verify-email", { method: "POST", body: { token } })
      .then(() => { setState("ok"); refresh?.(); })
      .catch(() => setState("error"));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Verifica email", "Email verification")} />
      <View style={{ padding: spacing.xl }} testID="verify-email-screen">
        {state === "loading" ? <ActivityIndicator /> : state === "ok" ? (
          <Notice icon="checkmark-circle" text={L("Email confermata, grazie!", "Email confirmed, thank you!")} />
        ) : (
          <Notice icon="alert-circle" text={L("Link non valido o scaduto. Richiedine uno nuovo dal tuo profilo.", "Invalid or expired link. Request a new one from your profile.")} />
        )}
        <Btn title={L("Continua", "Continue")} testID="verify-continue" onPress={() => router.replace((user ? homeFor(user.role) : "/login") as any)} />
      </View>
    </Screen>
  );
}
