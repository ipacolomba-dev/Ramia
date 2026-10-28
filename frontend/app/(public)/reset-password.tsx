import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";

import { api } from "@/src/api";
import { Notice } from "@/src/components/blocks";
import { Btn, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { spacing } from "@/src/theme";

export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { L } = useT();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const m = useMutation({ mutationFn: () => api("/auth/reset-password", { method: "POST", body: { token, new_password: pw } }) });
  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Nuova password", "New password")} onBack={() => router.replace("/login")} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.xl }} bottomOffset={24}>
        {!token ? <Notice icon="alert-circle" text={L("Link non valido.", "Invalid link.")} /> : m.isSuccess ? (
          <>
            <Notice icon="checkmark-circle" text={L("Password aggiornata. Accedi di nuovo su tutti i dispositivi.", "Password updated. Sign in again on all devices.")} />
            <Btn title={L("Vai al login", "Go to login")} testID="reset-go-login" onPress={() => router.replace("/login")} />
          </>
        ) : (
          <>
            <Field label={L("Nuova password (min. 8 caratteri)", "New password (min. 8 characters)")}><Input testID="reset-pw" value={pw} onChangeText={setPw} secureTextEntry /></Field>
            <Field label={L("Ripeti password", "Repeat password")}><Input testID="reset-pw2" value={pw2} onChangeText={setPw2} secureTextEntry /></Field>
            {m.isError ? <Notice icon="alert-circle" text={L("Link non valido o scaduto: richiedine uno nuovo.", "Invalid or expired link: request a new one.")} /> : null}
            <Btn title={L("Salva password", "Save password")} testID="reset-submit" loading={m.isPending} disabled={pw.length < 8 || pw !== pw2} onPress={() => m.mutate()} />
          </>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
