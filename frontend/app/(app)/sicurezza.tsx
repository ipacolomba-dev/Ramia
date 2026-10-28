import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Muted, Notice } from "@/src/components/blocks";
import { Btn, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";

/** Optional TOTP two-factor authentication (admin and professional buyers). */
export default function Security() {
  const { user } = useAuth();
  const { L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const [setup, setSetup] = useState<{ otpauth_uri: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [enabled, setEnabled] = useState(!!(user as any)?.totp_enabled);
  const err = (e: Error) => toast.show(e.message, "error");
  const start = useMutation({ mutationFn: () => api("/auth/2fa/setup", { method: "POST" }), onSuccess: setSetup, onError: err });
  const confirm = useMutation({ mutationFn: () => api("/auth/2fa/confirm", { method: "POST", body: { code } }), onSuccess: () => { setEnabled(true); setSetup(null); setCode(""); qc.invalidateQueries(); toast.show(L("Verifica in due passaggi attivata", "Two-step verification enabled")); }, onError: err });
  const disable = useMutation({ mutationFn: () => api("/auth/2fa/disable", { method: "POST", body: { code } }), onSuccess: () => { setEnabled(false); setCode(""); toast.show(L("Disattivata", "Disabled")); }, onError: err });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Sicurezza", "Security")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.xl }} bottomOffset={24} testID="security-screen">
        <Text style={styles.title}>{L("Verifica in due passaggi", "Two-step verification")}</Text>
        <Muted>{enabled ? L("Attiva: all'accesso ti chiederemo il codice dell'app di autenticazione.", "On: we'll ask for your authenticator code when you sign in.") : L("Facoltativa. Usa un'app come Google Authenticator o Authy.", "Optional. Use an app like Google Authenticator or Authy.")}</Muted>
        {!enabled && !setup && <Btn title={L("Attiva", "Enable")} testID="2fa-start" loading={start.isPending} onPress={() => start.mutate()} style={{ marginTop: spacing.lg }} />}
        {setup && (
          <>
            <Notice icon="key" text={L(`Aggiungi un account nell'app di autenticazione con questa chiave: ${setup.secret}`, `Add an account in your authenticator app with this key: ${setup.secret}`)} />
            <Btn title={L("Copia chiave", "Copy key")} variant="outline" size="sm" testID="2fa-copy" onPress={() => Clipboard.setStringAsync(setup.secret)} style={{ alignSelf: "flex-start", marginBottom: spacing.md }} />
          </>
        )}
        {(setup || enabled) && (
          <>
            <Field label={L("Codice a 6 cifre", "6-digit code")}><Input testID="2fa-code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} /></Field>
            {setup ? <Btn title={L("Conferma", "Confirm")} testID="2fa-confirm" disabled={code.length !== 6} loading={confirm.isPending} onPress={() => confirm.mutate()} />
              : <Btn title={L("Disattiva", "Disable")} variant="danger" testID="2fa-disable" disabled={code.length !== 6} loading={disable.isPending} onPress={() => disable.mutate()} />}
          </>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: spacing.xs },
}));
