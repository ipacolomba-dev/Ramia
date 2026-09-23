import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { CompanyProfile, ProfileItem } from "@/src/types";

const SERVICE_SIZES = ["piccoli", "grandi", "entrambi"];

export default function CompanyProfileScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const styles = useStyles();

  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [service, setService] = useState("");
  const [certs, setCerts] = useState<ProfileItem[]>([]);
  const [awards, setAwards] = useState<ProfileItem[]>([]);
  const [fairs, setFairs] = useState<ProfileItem[]>([]);
  const [legalName, setLegalName] = useState("");
  const [billAddress, setBillAddress] = useState("");
  const [country, setCountry] = useState("");
  const [vat, setVat] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [sdi, setSdi] = useState("");
  const [pec, setPec] = useState("");

  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => api<CompanyProfile>("/profiles/me") });

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setBio(p.bio ?? "");
    setWebsite(p.website ?? "");
    setPhone(p.phone ?? "");
    setCity(p.city ?? "");
    setService(p.logistics_service ?? "");
    setCerts(p.certifications ?? []);
    setAwards(p.awards ?? []);
    setFairs(p.fairs ?? []);
    const b = p.billing ?? {};
    setLegalName(b.legal_name ?? "");
    setBillAddress(b.billing_address ?? "");
    setCountry(b.billing_country ?? "");
    setVat(b.vat_number ?? "");
    setTaxCode(b.tax_code ?? "");
    setSdi(b.sdi_code ?? "");
    setPec(b.pec_email ?? "");
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      api<CompanyProfile>("/profiles/me", {
        method: "PUT",
        body: {
          bio: bio || null,
          website: website || null,
          phone: phone || null,
          city: city || null,
          logistics_service: user?.role === "logistics" ? service || null : null,
          certifications: certs.filter((c) => c.name.trim()),
          awards: awards.filter((c) => c.name.trim()),
          fairs: fairs.filter((c) => c.name.trim()),
          billing: {
            legal_name: legalName || null,
            billing_address: billAddress || null,
            billing_country: country || null,
            vat_number: vat || null,
            tax_code: taxCode || null,
            sdi_code: sdi || null,
            pec_email: pec || null,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["producers"] });
      toast.show(t("companyProfile.saved"));
      router.back();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const isProducer = user?.role === "producer";

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("companyProfile.title")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 120 }} bottomOffset={90}>
        <Text style={styles.sub}>{t("companyProfile.sub")}</Text>

        <Field label={t("companyProfile.bio")}>
          <Input testID="profile-bio" value={bio} onChangeText={setBio} multiline placeholder="…" />
        </Field>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t("companyProfile.city")}><Input testID="profile-city" value={city} onChangeText={setCity} /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("companyProfile.phone")}><Input testID="profile-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /></Field>
          </View>
        </View>
        <Field label={t("companyProfile.website")}>
          <Input testID="profile-website" value={website} onChangeText={setWebsite} autoCapitalize="none" placeholder="https://…" />
        </Field>

        {user?.role === "logistics" && (
          <Field label={t("companyProfile.serviceSize")}>
            <View style={styles.chipsWrap}>
              {SERVICE_SIZES.map((s) => (
                <Pressable key={s} testID={`profile-service-${s}`} onPress={() => setService(s)} style={[styles.chip, service === s && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                  <Text style={[styles.chipText, service === s && { color: colors.onBrandPrimary }]}>{t(`svc.${s}`)}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
        )}

        {isProducer && (
          <>
            <ItemEditor title={t("companyProfile.certifications")} items={certs} setItems={setCerts} withYear testIDBase="cert" />
            <ItemEditor title={t("companyProfile.awards")} items={awards} setItems={setAwards} withYear testIDBase="award" />
            <ItemEditor title={t("companyProfile.fairs")} items={fairs} setItems={setFairs} withPlace testIDBase="fair" />
          </>
        )}

        <View style={styles.billingHead}>
          <Text style={styles.sectionTitle}>{t("companyProfile.billing")}</Text>
          <Text style={styles.billingSub}>{t("companyProfile.billingSub")}</Text>
        </View>
        <Field label={t("companyProfile.legalName")}><Input testID="billing-legal" value={legalName} onChangeText={setLegalName} /></Field>
        <Field label={t("companyProfile.address")}><Input testID="billing-address" value={billAddress} onChangeText={setBillAddress} /></Field>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field label={t("companyProfile.country")}><Input testID="billing-country" value={country} onChangeText={setCountry} /></Field></View>
          <View style={{ flex: 1 }}><Field label={t("companyProfile.vat")}><Input testID="billing-vat" value={vat} onChangeText={setVat} autoCapitalize="characters" /></Field></View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field label={t("companyProfile.taxCode")}><Input testID="billing-tax" value={taxCode} onChangeText={setTaxCode} /></Field></View>
          <View style={{ flex: 1 }}><Field label={t("companyProfile.sdi")}><Input testID="billing-sdi" value={sdi} onChangeText={setSdi} autoCapitalize="characters" /></Field></View>
        </View>
        <Field label={t("companyProfile.pec")}><Input testID="billing-pec" value={pec} onChangeText={setPec} autoCapitalize="none" keyboardType="email-address" /></Field>
      </KeyboardAwareScrollView>

      <KeyboardStickyView bottomOffset={0}>
        <View style={styles.submitBar}>
          <Btn title={t("common.save")} size="lg" testID="profile-save" loading={save.isPending} onPress={() => save.mutate()} />
        </View>
      </KeyboardStickyView>
    </Screen>
  );
}

function ItemEditor({
  title, items, setItems, withYear, withPlace, testIDBase,
}: {
  title: string;
  items: ProfileItem[];
  setItems: (v: ProfileItem[]) => void;
  withYear?: boolean;
  withPlace?: boolean;
  testIDBase: string;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const styles = useStyles();
  const update = (i: number, patch: Partial<ProfileItem>) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={styles.itemHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable testID={`${testIDBase}-add`} onPress={() => setItems([...items, { name: "" }])} hitSlop={8}>
          <Ionicons name="add-circle" size={24} color={colors.brandPrimary} />
        </Pressable>
      </View>
      {items.map((it, i) => (
        <View key={i} style={styles.itemRow} testID={`${testIDBase}-row-${i}`}>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Input testID={`${testIDBase}-name-${i}`} value={it.name} onChangeText={(v) => update(i, { name: v })} placeholder={t("companyProfile.itemName")} />
            {withYear && <Input testID={`${testIDBase}-year-${i}`} value={it.year ?? ""} onChangeText={(v) => update(i, { year: v })} placeholder={t("companyProfile.itemYear")} />}
            {withPlace && <Input testID={`${testIDBase}-place-${i}`} value={it.place ?? ""} onChangeText={(v) => update(i, { place: v })} placeholder={t("companyProfile.itemPlace")} />}
          </View>
          <Pressable testID={`${testIDBase}-remove-${i}`} onPress={() => setItems(items.filter((_, idx) => idx !== i))} style={styles.removeBtn} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  sub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.lg, marginTop: spacing.md, lineHeight: 19 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surfaceSecondary },
  chipText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary },
  sectionTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },
  itemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.md },
  removeBtn: { width: 40, height: 48, alignItems: "center", justifyContent: "center" },
  billingHead: { marginTop: spacing.md, marginBottom: spacing.md },
  billingSub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  submitBar: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
}));
