import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Role, User } from "@/src/types";

const ROLES: { role: Role; icon: string }[] = [
  { role: "consumer", icon: "person" },
  { role: "producer", icon: "leaf" },
  { role: "business", icon: "briefcase" },
  { role: "collaborator", icon: "document-text" },
  { role: "logistics", icon: "car" },
];

const BUSINESS_TYPES = ["agente", "distributore", "grossista", "gdo", "export"];

export default function Register() {
  const { colors } = useTheme();
  const { t } = useT();
  const { signIn } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();

  const [role, setRole] = useState<Role>("consumer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [region, setRegion] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [fleet, setFleet] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api<{ access_token: string; user: User }>("/auth/register", {
        method: "POST",
        body: {
          email,
          password,
          name,
          role,
          locale: "it",
          company_name: company || null,
          region: region || null,
          business_type: role === "business" ? businessType : null,
          specialty: role === "collaborator" ? specialty : null,
          fleet_info: role === "logistics" ? fleet : null,
        },
      }),
    onSuccess: async (data) => {
      await signIn(data.access_token, data.user);
      toast.show(`${t("common.confirm")} ✓`);
      router.replace("/(tabs)");
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError("");
    if (!name || !email || password.length < 8) {
      setError(t("common.error"));
      return;
    }
    mutation.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("auth.registerTitle")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl }} bottomOffset={16}>
        <Text style={styles.sectionLabel}>{t("auth.chooseRole")}</Text>
        {ROLES.map(({ role: r, icon }) => (
          <Pressable
            key={r}
            testID={`register-role-${r}`}
            onPress={() => setRole(r)}
            style={[styles.roleCard, role === r && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
            accessibilityRole="button"
          >
            <View style={[styles.roleIcon, role === r && { backgroundColor: colors.brandPrimary }]}>
              <Ionicons name={icon as any} size={18} color={role === r ? colors.onBrandPrimary : colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.roleTitle}>{t(`role.${r}`)}</Text>
              <Text style={styles.roleDesc}>{t(`role.${r}.desc`)}</Text>
            </View>
            {role === r && <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />}
          </Pressable>
        ))}

        <Field label={t("auth.name")}>
          <Input testID="register-name-input" value={name} onChangeText={setName} placeholder="Mario Rossi" />
        </Field>
        {(role === "producer" || role === "business" || role === "logistics") && (
          <Field label={t("auth.company")}>
            <Input testID="register-company-input" value={company} onChangeText={setCompany} placeholder="Azienda Srl" />
          </Field>
        )}
        {(role === "producer" || role === "logistics") && (
          <Field label={t("auth.region")}>
            <Input testID="register-region-input" value={region} onChangeText={setRegion} placeholder="Ragusa, Sicilia" />
          </Field>
        )}
        {role === "business" && (
          <Field label={t("auth.businessType")}>
            <View style={styles.chipsRow}>
              {BUSINESS_TYPES.map((bt) => (
                <Pressable
                  key={bt}
                  testID={`register-biztype-${bt}`}
                  onPress={() => setBusinessType(bt)}
                  style={[styles.typeChip, businessType === bt && { backgroundColor: colors.brandPrimary }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.typeChipText, businessType === bt && { color: colors.onBrandPrimary }]}>{bt.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
        )}
        {role === "collaborator" && (
          <Field label={t("auth.specialty")}>
            <Input testID="register-specialty-input" value={specialty} onChangeText={setSpecialty} placeholder="Conformità etichette EU/USA" />
          </Field>
        )}
        {role === "logistics" && (
          <Field label={t("auth.fleet")}>
            <Input testID="register-fleet-input" value={fleet} onChangeText={setFleet} multiline placeholder="10 furgoni, isotermici, tratte settimanali verso…" />
          </Field>
        )}
        <Field label={t("auth.email")}>
          <Input testID="register-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="tu@esempio.it" />
        </Field>
        <Field label={t("auth.password")}>
          <Input testID="register-password-input" value={password} onChangeText={setPassword} secureTextEntry placeholder="min. 8 caratteri" />
        </Field>

        {error ? (
          <Text style={styles.error} testID="register-error-text">
            {error}
          </Text>
        ) : null}
        <Btn title={t("auth.register")} size="lg" testID="register-submit-button" loading={mutation.isPending} onPress={submit} />
        <Pressable testID="go-to-login-button" onPress={() => router.push("/auth/login")} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkText}>
            {t("auth.haveAccount")} <Text style={{ fontFamily: fonts.textBold, color: colors.brandPrimary }}>{t("auth.login")}</Text>
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  sectionLabel: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, marginBottom: spacing.md },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  roleIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  roleTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  roleDesc: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 1 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surfaceSecondary },
  typeChipText: { fontFamily: fonts.textBold, fontSize: 11, color: colors.onSurfaceTertiary },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
  link: { alignItems: "center", marginTop: spacing.lg },
  linkText: { fontFamily: fonts.text, fontSize: 14, color: colors.muted },
}));
