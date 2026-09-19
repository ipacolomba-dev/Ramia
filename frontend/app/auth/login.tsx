import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { User } from "@/src/types";

const DEMOS = [
  { label: "Produttore", email: "produttore@demo.it" },
  { label: "Business", email: "business@demo.it" },
  { label: "Consumatore", email: "consumatore@demo.it" },
  { label: "Admin", email: "admin@saporidisicilia.it" },
];

export default function Login() {
  const { colors } = useTheme();
  const { t } = useT();
  const { signIn } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => api<{ access_token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } }),
    onSuccess: async (data) => {
      await signIn(data.access_token, data.user);
      router.replace("/(tabs)");
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("auth.loginTitle")} onBack={() => router.back()} />
      <View style={[styles.form, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Field label={t("auth.email")}>
          <Input
            testID="login-email-input"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="tu@esempio.it"
          />
        </Field>
        <Field label={t("auth.password")}>
          <Input testID="login-password-input" value={password} onChangeText={setPassword} secureTextEntry />
        </Field>
        {error ? (
          <Text style={styles.error} testID="login-error-text">
            {error}
          </Text>
        ) : null}
        <Btn
          title={t("auth.login")}
          size="lg"
          testID="login-submit-button"
          loading={mutation.isPending}
          onPress={() => {
            setError("");
            mutation.mutate();
          }}
        />
        <Pressable testID="go-to-register-button" onPress={() => router.push("/auth/register")} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkText}>
            {t("auth.noAccount")} <Text style={{ fontFamily: fonts.textBold, color: colors.brandPrimary }}>{t("auth.register")}</Text>
          </Text>
        </Pressable>

        <View style={styles.demoBox}>
          <Text style={styles.demoLabel}>{t("auth.demoHint")}</Text>
          <View style={styles.demoRow}>
            {DEMOS.map((d) => (
              <Pressable
                key={d.email}
                testID={`demo-fill-${d.email}`}
                onPress={() => {
                  setEmail(d.email);
                  setPassword(d.email.includes("admin") ? "SaporiAdmin2026!" : "Demo1234!");
                }}
                style={styles.demoChip}
                accessibilityRole="button"
              >
                <Text style={styles.demoChipText}>{d.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  form: { flex: 1, paddingHorizontal: spacing.xl },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
  link: { alignItems: "center", marginTop: spacing.lg },
  linkText: { fontFamily: fonts.text, fontSize: 14, color: colors.muted },
  demoBox: { marginTop: spacing.xl, backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: spacing.lg },
  demoLabel: { fontFamily: fonts.textBold, fontSize: 12, color: colors.onSurfaceTertiary, marginBottom: spacing.sm },
  demoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  demoChip: { backgroundColor: colors.surfaceSecondary, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  demoChipText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary },
}));
