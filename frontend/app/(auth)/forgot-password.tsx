import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { Notice } from "@/src/components/blocks";
import { Btn, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { spacing } from "@/src/theme";

export default function ForgotPassword() {
  const { L } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const m = useMutation({ mutationFn: () => api("/auth/request-password-reset", { method: "POST", body: { email } }) });
  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Password dimenticata", "Forgot password")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.xl }} bottomOffset={24}>
        {m.isSuccess ? (
          <Notice icon="mail" text={L("Se l'indirizzo è registrato, riceverai un'email con il link per reimpostare la password (valido 30 minuti).", "If the address is registered you'll get an email with a reset link (valid 30 minutes).")} />
        ) : (
          <View>
            <Text style={{ marginBottom: spacing.md }}>{L("Inserisci l'email del tuo account.", "Enter your account email.")}</Text>
            <Field label="Email"><Input testID="forgot-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /></Field>
            <Btn title={L("Invia link", "Send link")} testID="forgot-submit" loading={m.isPending} disabled={!/^\S+@\S+\.\S+$/.test(email)} onPress={() => m.mutate()} />
          </View>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
