import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ConsentsBlock, useConsents } from "@/src/components/consents";
import { Btn, Chip, Field, Input, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { homeFor } from "@/src/roles";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Category, User } from "@/src/types";

const BUYER_TYPES = ["distributore", "grossista", "importatore", "gdo", "horeca", "agente", "e-commerce"];
const CERTS = ["BIO", "DOP", "IGP", "IFS", "BRC", "Halal", "Kosher"];
const STEPS: [string, string][] = [["Azienda", "Company"], ["Referente", "Contact"], ["Acquisti", "Purchasing"], ["Accesso", "Access"]];

export default function RegisterBuyer() {
  const { colors } = useTheme();
  const { t, L } = useT();
  const { signIn } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const consents = useConsents();
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    legal_name: "", vat_id: "", country: "Italia", city: "", street: "", website: "",
    first_name: "", last_name: "", role_title: "", phone: "",
    buyer_type: "", volume: "", markets: "", notes: "", email: "", password: "",
  });
  const [catSel, setCatSel] = useState<string[]>([]);
  const [certSel, setCertSel] = useState<string[]>([]);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (list: string[], setList: (v: string[]) => void, v: string) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const isIT = f.country.trim().toLowerCase().startsWith("ital");

  const mutation = useMutation({
    mutationFn: () => api<{ access_token: string; user: User }>("/auth/register", {
      method: "POST",
      body: {
        email: f.email, password: f.password, name: `${f.first_name} ${f.last_name}`.trim(), role: "business", locale: "it",
        company_name: f.legal_name, business_type: f.buyer_type || null,
        consents: { terms: consents.terms, privacy: consents.privacy, marketing: consents.marketing },
        profile: {
          company: { legal_name: f.legal_name, vat_id: f.vat_id, country_incorp: f.country, website: f.website || null, phone: f.phone || null },
          legal_address: { street: f.street, city: f.city, country: f.country },
          contact: { first_name: f.first_name, last_name: f.last_name, role_title: f.role_title, email: f.email, phone: f.phone },
          buyer: { buyer_type: f.buyer_type, product_categories: catSel, annual_volume: f.volume, destination_markets: f.markets, required_certifications: certSel, notes: f.notes || null },
        },
      },
    }),
    onSuccess: async (data) => { await signIn(data.access_token, data.user); router.replace(homeFor(data.user.role) as any); },
    onError: (e: Error) => setError(e.message),
  });

  const validate = (): string => {
    if (step === 0) {
      if (!f.legal_name.trim() || !f.city.trim() || !f.country.trim()) return L("Ragione sociale, città e Paese sono obbligatori", "Company name, city and country are required");
      if (isIT && !/^(IT)?\d{11}$/i.test(f.vat_id.replace(/\s/g, ""))) return L("Partita IVA italiana: 11 cifre", "Italian VAT number: 11 digits");
      if (!isIT && f.vat_id.trim().length < 4) return L("Inserisci il numero fiscale/VAT del tuo Paese", "Enter your country's tax/VAT number");
    }
    if (step === 1 && (!f.first_name.trim() || !f.last_name.trim())) return L("Nome e cognome del referente obbligatori", "Contact first and last name required");
    if (step === 2 && (!f.buyer_type || catSel.length === 0)) return L("Scegli tipo di acquirente e almeno una categoria", "Pick buyer type and at least one category");
    if (step === 3) {
      if (!/^\S+@\S+\.\S+$/.test(f.email)) return L("Email non valida", "Invalid email");
      if (f.password.length < 8) return L("Password di almeno 8 caratteri", "Password of at least 8 characters");
      if (!consents.terms || !consents.privacy) return t("reg.consentRequired");
    }
    return "";
  };
  const next = () => {
    const e = validate();
    setError(e);
    if (e) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else mutation.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("reg.cat.business.title")} onBack={() => (step === 0 ? router.back() : setStep(step - 1))} />
      <View style={styles.progress}>
        {STEPS.map((s, i) => <View key={s[0]} style={[styles.bar, i <= step && { backgroundColor: colors.brandPrimary }]} />)}
      </View>
      <Text style={styles.stepLabel}>{L(`Passo ${step + 1} di ${STEPS.length}`, `Step ${step + 1} of ${STEPS.length}`)} · {L(...STEPS[step])}</Text>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl }} bottomOffset={16} testID="register-buyer">
        {step === 0 && (
          <>
            <Field label={L("Ragione sociale", "Legal name")}><Input testID="rb-legal-name" value={f.legal_name} onChangeText={set("legal_name")} placeholder="Delikatessen GmbH" /></Field>
            <Field label={L("Paese", "Country")}><Input testID="rb-country" value={f.country} onChangeText={set("country")} /></Field>
            <Field label={isIT ? L("Partita IVA", "VAT number") : L("Numero fiscale / VAT", "Tax / VAT number")}><Input testID="rb-vat" value={f.vat_id} onChangeText={set("vat_id")} autoCapitalize="characters" placeholder={isIT ? "01234567890" : "DE123456789"} /></Field>
            <Field label={L("Città", "City")}><Input testID="rb-city" value={f.city} onChangeText={set("city")} /></Field>
            <Field label={L("Indirizzo", "Address")}><Input testID="rb-street" value={f.street} onChangeText={set("street")} /></Field>
            <Field label={L("Sito web", "Website")} hint={t("common.optional")}><Input testID="rb-website" value={f.website} onChangeText={set("website")} autoCapitalize="none" /></Field>
          </>
        )}
        {step === 1 && (
          <>
            <Field label={L("Nome", "First name")}><Input testID="rb-first" value={f.first_name} onChangeText={set("first_name")} /></Field>
            <Field label={L("Cognome", "Last name")}><Input testID="rb-last" value={f.last_name} onChangeText={set("last_name")} /></Field>
            <Field label={L("Ruolo in azienda", "Job title")}><Input testID="rb-role" value={f.role_title} onChangeText={set("role_title")} placeholder={L("Responsabile acquisti", "Head of purchasing")} /></Field>
            <Field label={L("Telefono", "Phone")}><Input testID="rb-phone" value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" /></Field>
          </>
        )}
        {step === 2 && (
          <>
            <Text style={styles.label}>{L("Tipo di acquirente", "Buyer type")}</Text>
            <View style={styles.chips}>{BUYER_TYPES.map((b) => <Chip key={b} label={b.toUpperCase()} selected={f.buyer_type === b} testID={`rb-type-${b}`} onPress={() => set("buyer_type")(b)} />)}</View>
            <Text style={styles.label}>{L("Categorie di interesse", "Categories of interest")}</Text>
            <View style={styles.chips}>{(cats.data ?? []).map((c) => <Chip key={c.slug} label={L(c.name, c.name_en)} selected={catSel.includes(c.slug)} testID={`rb-cat-${c.slug}`} onPress={() => toggle(catSel, setCatSel, c.slug)} />)}</View>
            <Field label={L("Volume annuo stimato", "Estimated yearly volume")}><Input testID="rb-volume" value={f.volume} onChangeText={set("volume")} placeholder="50.000 € / 20 pallet" /></Field>
            <Field label={L("Mercati di destinazione", "Destination markets")}><Input testID="rb-markets" value={f.markets} onChangeText={set("markets")} placeholder="Germania, Austria" /></Field>
            <Text style={styles.label}>{L("Certificazioni richieste", "Required certifications")}</Text>
            <View style={styles.chips}>{CERTS.map((c) => <Chip key={c} label={c} selected={certSel.includes(c)} testID={`rb-cert-${c}`} onPress={() => toggle(certSel, setCertSel, c)} />)}</View>
            <Field label={L("Note", "Notes")} hint={t("common.optional")}><Input testID="rb-notes" value={f.notes} onChangeText={set("notes")} multiline /></Field>
          </>
        )}
        {step === 3 && (
          <>
            <Field label={t("auth.email")}><Input testID="rb-email" value={f.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" /></Field>
            <Field label={t("auth.password")}><Input testID="rb-password" value={f.password} onChangeText={set("password")} secureTextEntry placeholder="min. 8 caratteri" /></Field>
            <ConsentsBlock state={consents} />
            <View style={styles.note}>
              <Ionicons name="time-outline" size={14} color={colors.muted} />
              <Text style={styles.noteText}>{t("reg.approvalNote")}</Text>
            </View>
          </>
        )}
        {error ? <Text style={styles.error} testID="rb-error">{error}</Text> : null}
        <Btn title={step < STEPS.length - 1 ? L("Continua", "Continue") : t("auth.register")} size="lg" testID="rb-next" loading={mutation.isPending} onPress={next} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  progress: { flexDirection: "row", gap: 4, paddingHorizontal: spacing.xl },
  bar: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  stepLabel: { fontFamily: fonts.textBold, fontSize: 12, color: colors.muted, paddingHorizontal: spacing.xl, marginVertical: spacing.md },
  label: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
  note: { flexDirection: "row", gap: spacing.xs, alignItems: "center", marginBottom: spacing.md },
  noteText: { flex: 1, fontFamily: fonts.text, fontSize: 12, color: colors.muted },
}));
