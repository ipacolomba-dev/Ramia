import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { homeFor } from "@/src/roles";
import { Btn, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { ConsentsBlock, useConsents } from "@/src/components/consents";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Role, User } from "@/src/types";

const BUSINESS_TYPES = ["agente", "distributore", "grossista", "gdo", "export"];
const VALID: Role[] = ["business", "consumer", "logistics", "collaborator"];

export default function RegisterSimple() {
  const { colors } = useTheme();
  const { t } = useT();
  const { signIn } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();
  const params = useLocalSearchParams<{ role?: string }>();
  const role: Role = (VALID.includes(params.role as Role) ? params.role : "consumer") as Role;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [fleet, setFleet] = useState("");
  const [error, setError] = useState("");
  const consents = useConsents();

  const needsCompany = role === "business" || role === "logistics" || role === "collaborator";

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
          region: region || country || null,
          business_type: role === "business" ? businessType : null,
          specialty: role === "collaborator" ? specialty : null,
          fleet_info: role === "logistics" ? fleet : null,
          consents: { terms: consents.terms, privacy: consents.privacy, marketing: consents.marketing },
        },
      }),
    onSuccess: async (data) => {
      await signIn(data.access_token, data.user);
      toast.show(`${t("common.confirm")} ✓`);
      router.replace(homeFor(data.user.role) as any);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError("");
    if (!name || !email || password.length < 8) {
      setError(t("common.error"));
      return;
    }
    if (!consents.terms || !consents.privacy) {
      setError(t("reg.consentRequired"));
      return;
    }
    mutation.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t(`reg.cat.${role}.title`)} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl }} bottomOffset={16} testID="register-simple">
        <Text style={styles.desc}>{t(`reg.cat.${role}.desc`)}</Text>

        <Field label={needsCompany ? t("reg.f.contactName") : t("auth.name")}>
          <Input testID="rs-name" value={name} onChangeText={setName} placeholder="Mario Rossi" />
        </Field>
        {needsCompany && (
          <Field label={role === "collaborator" ? t("reg.f.labName") : t("auth.company")}>
            <Input testID="rs-company" value={company} onChangeText={setCompany} placeholder="Azienda Srl" />
          </Field>
        )}
        {role === "consumer" && (
          <Field label={t("reg.f.country")}>
            <Input testID="rs-country" value={country} onChangeText={setCountry} placeholder="Italia" />
          </Field>
        )}
        {role === "logistics" && (
          <Field label={t("auth.region")}>
            <Input testID="rs-region" value={region} onChangeText={setRegion} placeholder="Catania, Sicilia" />
          </Field>
        )}
        {role === "business" && (
          <Field label={t("auth.businessType")}>
            <View style={styles.chipsRow}>
              {BUSINESS_TYPES.map((bt) => (
                <Pressable key={bt} testID={`rs-biztype-${bt}`} onPress={() => setBusinessType(bt)} style={[styles.typeChip, businessType === bt && { backgroundColor: colors.brandPrimary }]} accessibilityRole="button">
                  <Text style={[styles.typeChipText, businessType === bt && { color: colors.onBrandPrimary }]}>{bt.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
        )}
        {role === "collaborator" && (
          <Field label={t("auth.specialty")}>
            <Input testID="rs-specialty" value={specialty} onChangeText={setSpecialty} placeholder="Conformità etichette EU/USA" />
          </Field>
        )}
        {role === "logistics" && (
          <Field label={t("auth.fleet")}>
            <Input testID="rs-fleet" value={fleet} onChangeText={setFleet} multiline placeholder="10 furgoni isotermici, tratte verso…" />
          </Field>
        )}
        <Field label={t("auth.email")}>
          <Input testID="rs-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="tu@esempio.it" />
        </Field>
        <Field label={t("auth.password")}>
          <Input testID="rs-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="min. 8 caratteri" />
        </Field>

        <ConsentsBlock state={consents} />

        {error ? <Text style={styles.error} testID="rs-error">{error}</Text> : null}
        {needsCompany ? (
          <View style={styles.note}>
            <Ionicons name="time-outline" size={14} color={colors.muted} />
            <Text style={styles.noteText}>{t("reg.approvalNote")}</Text>
          </View>
        ) : null}
        <Btn title={t("auth.register")} size="lg" testID="rs-submit" loading={mutation.isPending} onPress={submit} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  desc: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.lg, lineHeight: 18 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surfaceSecondary },
  typeChipText: { fontFamily: fonts.textBold, fontSize: 11, color: colors.onSurfaceTertiary },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
  note: { flexDirection: "row", gap: spacing.xs, alignItems: "center", marginBottom: spacing.md },
  noteText: { flex: 1, fontFamily: fonts.text, fontSize: 12, color: colors.muted },
}));
