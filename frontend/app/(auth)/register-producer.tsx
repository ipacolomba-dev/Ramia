import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import type { User } from "@/src/types";

const CATEGORIES = ["olio", "formaggi", "frutta_secca", "agrumi", "dolci", "pasta", "vino", "conserve"];
const COMPANY_TYPES = ["Frantoio", "Caseificio", "Cantina", "Pastificio", "Cooperativa", "Lab. artigianale", "Industria", "Altro"];
const ACTIVITIES = ["produzione", "trasformazione", "cooperativa", "altro"];
const CERTS = ["BIO", "DOP", "IGP", "HACCP", "ISO 22000", "BRC", "IFS", "Kosher", "Halal"];

const IT_NAMES = ["italia", "italy", "it"];
const isItaly = (c: string) => IT_NAMES.includes((c || "").trim().toLowerCase());

type Addr = { street: string; zip: string; city: string; region: string; country: string };
const emptyAddr: Addr = { street: "", zip: "", city: "", region: "", country: "Italia" };

const STEPS = ["A", "B", "C", "D", "E", "F", "G"];

export default function RegisterProducer() {
  const { colors } = useTheme();
  const { t } = useT();
  const { signIn } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();
  const consents = useConsents();

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  // A - company
  const [company, setCompany] = useState({ legal_name: "", legal_form: "", brand_name: "", country_incorp: "Italia", vat_id: "", tax_code: "", registry_no: "", website: "", email: "", phone: "" });
  // B - locations
  const [legalAddr, setLegalAddr] = useState<Addr>({ ...emptyAddr });
  const [prodSame, setProdSame] = useState(true);
  const [prodAddr, setProdAddr] = useState<Addr>({ ...emptyAddr });
  // C - contact
  const [contact, setContact] = useState({ first_name: "", last_name: "", role_title: "", email: "", phone: "" });
  // D - billing
  const [billSame, setBillSame] = useState(true);
  const [billing, setBilling] = useState({ billing_name: "", vat_id: "", sdi_code: "", pec: "" });
  const [billAddr, setBillAddr] = useState<Addr>({ ...emptyAddr });
  // E - commercial
  const [commercial, setCommercial] = useState({ company_type: "", activity: "", domestic_markets: "", intl_markets: "", min_quantities: "", packaging: "" });
  const [cats, setCats] = useState<string[]>([]);
  // F - documents
  const [certs, setCerts] = useState<string[]>([]);
  const [docsNote, setDocsNote] = useState("");
  // G - credentials
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const italy = isItaly(company.country_incorp);
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const buildProfile = () => ({
    company: { ...company, tax_code: italy ? company.tax_code : "" },
    legal_address: legalAddr,
    production_same_as_legal: prodSame,
    production_address: prodSame ? null : prodAddr,
    contact,
    billing: {
      billing_name: billing.billing_name,
      vat_id: billing.vat_id,
      sdi_code: italy ? billing.sdi_code : "",
      pec: italy ? billing.pec : "",
      same_as_legal: billSame,
      address: billSame ? legalAddr : billAddr,
    },
    commercial: { ...commercial, product_categories: cats },
    certifications: certs,
    documents_note: docsNote || null,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api<{ access_token: string; refresh_token: string; user: User }>("/auth/register", {
        method: "POST",
        body: {
          email, password, name: name || company.brand_name || company.legal_name, role: "producer", locale: "it",
          company_name: company.brand_name || company.legal_name,
          region: legalAddr.region || legalAddr.city || null,
          profile: buildProfile(),
          consents: { terms: consents.terms, privacy: consents.privacy, marketing: consents.marketing },
        },
      }),
    onSuccess: async (data) => {
      await signIn(data.access_token, data.user, data.refresh_token);
      toast.show(`${t("common.confirm")} ✓`);
      router.replace(homeFor(data.user.role) as any);
    },
    onError: (e: Error) => setError(e.message),
  });

  const canNext = useMemo(() => {
    if (step === 0) return !!company.legal_name && !!company.vat_id;
    if (step === 6) return !!email && password.length >= 8 && consents.terms && consents.privacy;
    return true;
  }, [step, company, email, password, consents.terms, consents.privacy]);

  const next = () => {
    setError("");
    if (!canNext) { setError(t("common.error")); return; }
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  const back = () => {
    setError("");
    if (step === 0) router.back();
    else setStep(step - 1);
  };

  const addrFields = (a: Addr, set: (v: Addr) => void, prefix: string, showCountry = true) => (
    <>
      <Field label={t("reg.f.street")}><Input testID={`${prefix}-street`} value={a.street} onChangeText={(v) => set({ ...a, street: v })} /></Field>
      <View style={styles.rowGap}>
        <View style={{ flex: 1 }}><Field label={t("reg.f.zip")}><Input testID={`${prefix}-zip`} value={a.zip} onChangeText={(v) => set({ ...a, zip: v })} /></Field></View>
        <View style={{ flex: 2 }}><Field label={t("reg.f.city")}><Input testID={`${prefix}-city`} value={a.city} onChangeText={(v) => set({ ...a, city: v })} /></Field></View>
      </View>
      <Field label={t("reg.f.region")}><Input testID={`${prefix}-region`} value={a.region} onChangeText={(v) => set({ ...a, region: v })} /></Field>
      {showCountry ? <Field label={t("reg.f.country")}><Input testID={`${prefix}-country`} value={a.country} onChangeText={(v) => set({ ...a, country: v })} /></Field> : null}
    </>
  );

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("reg.cat.producer.title")} onBack={back} />
      <View style={styles.progressWrap}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.progressSeg, i <= step && { backgroundColor: colors.brandPrimary }]} />
        ))}
      </View>
      <Text style={styles.stepLabel}>{t(`reg.step.${STEPS[step]}`)} · {step + 1}/{STEPS.length}</Text>

      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl }} bottomOffset={16} testID={`reg-prod-step-${STEPS[step]}`}>
        {step === 0 && (
          <>
            <Field label={t("reg.f.legalName") + " *"}><Input testID="rp-legal-name" value={company.legal_name} onChangeText={(v) => setCompany({ ...company, legal_name: v })} placeholder="Olivicola Rossi Srl" /></Field>
            <Field label={t("reg.f.legalForm")}><Input testID="rp-legal-form" value={company.legal_form} onChangeText={(v) => setCompany({ ...company, legal_form: v })} placeholder="Srl, Snc, Cooperativa…" /></Field>
            <Field label={t("reg.f.brand")}><Input testID="rp-brand" value={company.brand_name} onChangeText={(v) => setCompany({ ...company, brand_name: v })} placeholder="Marchio commerciale" /></Field>
            <Field label={t("reg.f.countryIncorp")}><Input testID="rp-country-incorp" value={company.country_incorp} onChangeText={(v) => setCompany({ ...company, country_incorp: v })} /></Field>
            <Field label={t("reg.f.vat") + " *"}><Input testID="rp-vat" value={company.vat_id} onChangeText={(v) => setCompany({ ...company, vat_id: v })} autoCapitalize="characters" placeholder={italy ? "IT01234567890" : "VAT / Tax ID"} /></Field>
            {italy && <Field label={t("reg.f.taxCode")}><Input testID="rp-tax-code" value={company.tax_code} onChangeText={(v) => setCompany({ ...company, tax_code: v })} autoCapitalize="characters" /></Field>}
            <Field label={t("reg.f.registryNo")}><Input testID="rp-registry" value={company.registry_no} onChangeText={(v) => setCompany({ ...company, registry_no: v })} /></Field>
            <Field label={t("reg.f.website")}><Input testID="rp-website" value={company.website} onChangeText={(v) => setCompany({ ...company, website: v })} autoCapitalize="none" keyboardType="url" placeholder="https://" /></Field>
            <Field label={t("reg.f.companyEmail")}><Input testID="rp-company-email" value={company.email} onChangeText={(v) => setCompany({ ...company, email: v })} autoCapitalize="none" keyboardType="email-address" /></Field>
            <Field label={t("reg.f.companyPhone")}><Input testID="rp-company-phone" value={company.phone} onChangeText={(v) => setCompany({ ...company, phone: v })} keyboardType="phone-pad" /></Field>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.sub}>{t("reg.sub.legalAddr")}</Text>
            {addrFields(legalAddr, setLegalAddr, "rp-legal")}
            <Pressable style={styles.toggle} onPress={() => setProdSame(!prodSame)} testID="rp-prod-same">
              <View style={[styles.box, prodSame && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>{prodSame ? <Ionicons name="checkmark" size={13} color={colors.onBrandPrimary} /> : null}</View>
              <Text style={styles.toggleText}>{t("reg.prodSameAsLegal")}</Text>
            </Pressable>
            {!prodSame && (<><Text style={styles.sub}>{t("reg.sub.prodAddr")}</Text>{addrFields(prodAddr, setProdAddr, "rp-prod")}</>)}
          </>
        )}

        {step === 2 && (
          <>
            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}><Field label={t("reg.f.firstName")}><Input testID="rp-c-first" value={contact.first_name} onChangeText={(v) => setContact({ ...contact, first_name: v })} /></Field></View>
              <View style={{ flex: 1 }}><Field label={t("reg.f.lastName")}><Input testID="rp-c-last" value={contact.last_name} onChangeText={(v) => setContact({ ...contact, last_name: v })} /></Field></View>
            </View>
            <Field label={t("reg.f.roleTitle")}><Input testID="rp-c-role" value={contact.role_title} onChangeText={(v) => setContact({ ...contact, role_title: v })} placeholder="Titolare, Export manager…" /></Field>
            <Field label={t("reg.f.contactEmail")}><Input testID="rp-c-email" value={contact.email} onChangeText={(v) => setContact({ ...contact, email: v })} autoCapitalize="none" keyboardType="email-address" /></Field>
            <Field label={t("reg.f.contactPhone")}><Input testID="rp-c-phone" value={contact.phone} onChangeText={(v) => setContact({ ...contact, phone: v })} keyboardType="phone-pad" /></Field>
          </>
        )}

        {step === 3 && (
          <>
            <Pressable style={styles.toggle} onPress={() => setBillSame(!billSame)} testID="rp-bill-same">
              <View style={[styles.box, billSame && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>{billSame ? <Ionicons name="checkmark" size={13} color={colors.onBrandPrimary} /> : null}</View>
              <Text style={styles.toggleText}>{t("reg.billSameAsLegal")}</Text>
            </Pressable>
            <Field label={t("reg.f.billingName")}><Input testID="rp-b-name" value={billing.billing_name} onChangeText={(v) => setBilling({ ...billing, billing_name: v })} /></Field>
            <Field label={t("reg.f.vat")}><Input testID="rp-b-vat" value={billing.vat_id} onChangeText={(v) => setBilling({ ...billing, vat_id: v })} autoCapitalize="characters" /></Field>
            {!billSame && (<><Text style={styles.sub}>{t("reg.sub.billAddr")}</Text>{addrFields(billAddr, setBillAddr, "rp-bill")}</>)}
            {italy && (
              <>
                <Field label={t("reg.f.sdi")}><Input testID="rp-b-sdi" value={billing.sdi_code} onChangeText={(v) => setBilling({ ...billing, sdi_code: v })} autoCapitalize="characters" placeholder="Codice destinatario" /></Field>
                <Field label={t("reg.f.pec")}><Input testID="rp-b-pec" value={billing.pec} onChangeText={(v) => setBilling({ ...billing, pec: v })} autoCapitalize="none" keyboardType="email-address" /></Field>
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <Field label={t("reg.f.companyType")}>
              <View style={styles.chips}>{COMPANY_TYPES.map((ct) => (
                <Pressable key={ct} testID={`rp-ctype-${ct}`} onPress={() => setCommercial({ ...commercial, company_type: ct })} style={[styles.chip, commercial.company_type === ct && styles.chipOn]}><Text style={[styles.chipText, commercial.company_type === ct && styles.chipTextOn]}>{ct}</Text></Pressable>
              ))}</View>
            </Field>
            <Field label={t("reg.f.categories")}>
              <View style={styles.chips}>{CATEGORIES.map((c) => (
                <Pressable key={c} testID={`rp-cat-${c}`} onPress={() => toggle(cats, c, setCats)} style={[styles.chip, cats.includes(c) && styles.chipOn]}><Text style={[styles.chipText, cats.includes(c) && styles.chipTextOn]}>{t(`category.${c}`)}</Text></Pressable>
              ))}</View>
            </Field>
            <Field label={t("reg.f.activity")}>
              <View style={styles.chips}>{ACTIVITIES.map((a) => (
                <Pressable key={a} testID={`rp-act-${a}`} onPress={() => setCommercial({ ...commercial, activity: a })} style={[styles.chip, commercial.activity === a && styles.chipOn]}><Text style={[styles.chipText, commercial.activity === a && styles.chipTextOn]}>{a}</Text></Pressable>
              ))}</View>
            </Field>
            <Field label={t("reg.f.domesticMarkets")}><Input testID="rp-dom" value={commercial.domestic_markets} onChangeText={(v) => setCommercial({ ...commercial, domestic_markets: v })} placeholder="Sicilia, Italia…" /></Field>
            <Field label={t("reg.f.intlMarkets")}><Input testID="rp-intl" value={commercial.intl_markets} onChangeText={(v) => setCommercial({ ...commercial, intl_markets: v })} placeholder="Germania, USA…" /></Field>
            <Field label={t("reg.f.minQty")}><Input testID="rp-minqty" value={commercial.min_quantities} onChangeText={(v) => setCommercial({ ...commercial, min_quantities: v })} /></Field>
            <Field label={t("reg.f.packaging")}><Input testID="rp-pack" value={commercial.packaging} onChangeText={(v) => setCommercial({ ...commercial, packaging: v })} /></Field>
          </>
        )}

        {step === 5 && (
          <>
            <Text style={styles.sub}>{t("reg.sub.docs")}</Text>
            <Field label={t("reg.f.certifications")}>
              <View style={styles.chips}>{CERTS.map((c) => (
                <Pressable key={c} testID={`rp-cert-${c}`} onPress={() => toggle(certs, c, setCerts)} style={[styles.chip, certs.includes(c) && styles.chipOn]}><Text style={[styles.chipText, certs.includes(c) && styles.chipTextOn]}>{c}</Text></Pressable>
              ))}</View>
            </Field>
            <Field label={t("reg.f.docsNote")}><Input testID="rp-docsnote" value={docsNote} onChangeText={setDocsNote} multiline placeholder={t("reg.f.docsNotePh")} /></Field>
            <View style={styles.infoBox}><Ionicons name="cloud-upload-outline" size={15} color={colors.brandSecondary} /><Text style={styles.infoText}>{t("reg.docsUploadSoon")}</Text></View>
          </>
        )}

        {step === 6 && (
          <>
            <View style={styles.summary} testID="rp-summary">
              <Text style={styles.summaryTitle}>{t("reg.summary")}</Text>
              <SummaryRow label={t("reg.f.legalName")} value={company.legal_name} />
              <SummaryRow label={t("reg.f.vat")} value={company.vat_id} />
              <SummaryRow label={t("reg.f.city")} value={[legalAddr.city, legalAddr.country].filter(Boolean).join(", ")} />
              <SummaryRow label={t("reg.f.categories")} value={cats.map((c) => t(`category.${c}`)).join(", ")} />
              <SummaryRow label={t("reg.f.certifications")} value={certs.join(", ")} />
            </View>
            <Field label={t("auth.name")}><Input testID="rp-name" value={name} onChangeText={setName} placeholder={company.brand_name || company.legal_name} /></Field>
            <Field label={t("reg.f.loginEmail") + " *"}><Input testID="rp-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="tu@esempio.it" /></Field>
            <Field label={t("auth.password") + " *"}><Input testID="rp-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="min. 8 caratteri" /></Field>
            <ConsentsBlock state={consents} />
          </>
        )}

        {error ? <Text style={styles.error} testID="rp-error">{error}</Text> : null}

        {step < STEPS.length - 1 ? (
          <Btn title={t("common.next")} size="lg" icon="arrow-forward" testID="rp-next" disabled={!canNext} onPress={next} />
        ) : (
          <Btn title={t("auth.register")} size="lg" testID="rp-submit" loading={mutation.isPending} disabled={!canNext} onPress={() => mutation.mutate()} />
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  const styles = useStyles();
  if (!value) return null;
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  progressWrap: { flexDirection: "row", gap: 4, paddingHorizontal: spacing.xl, marginTop: spacing.xs },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary },
  stepLabel: { fontFamily: fonts.textBold, fontSize: 13, color: colors.brandPrimary, paddingHorizontal: spacing.xl, marginTop: spacing.sm, marginBottom: spacing.sm },
  sub: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginTop: spacing.sm, marginBottom: spacing.sm },
  rowGap: { flexDirection: "row", gap: spacing.md },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.md },
  toggleText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurfaceSecondary },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surfaceSecondary },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary },
  chipTextOn: { color: colors.onBrandPrimary },
  infoBox: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
  infoText: { flex: 1, fontFamily: fonts.text, fontSize: 12, color: colors.onBrandTertiary, lineHeight: 16 },
  summary: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, padding: spacing.lg, marginBottom: spacing.lg },
  summaryTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, marginBottom: spacing.sm },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.xs },
  summaryLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  summaryValue: { flex: 1, fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurface, textAlign: "right" },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
}));
