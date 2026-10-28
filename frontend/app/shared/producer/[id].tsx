import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Img } from "@/src/components/Img";
import { CenterLoader, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { CompanyProfile, ProfileItem } from "@/src/types";

export default function ProducerPage() {
  const { colors } = useTheme();
  const { t, L, lang } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const styles = useStyles();

  const q = useQuery({ queryKey: ["producer", id], queryFn: () => api<CompanyProfile>(`/producers/${id}`) });

  if (q.isLoading) return <CenterLoader />;
  if (q.isError || !q.data)
    return (
      <Screen>
        <ScreenHeader title="" onBack={() => router.back()} />
        <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} />
      </Screen>
    );

  const p = q.data;
  const bio = lang === "en" && p.bio_en ? p.bio_en : p.bio;
  const products = p.products ?? [];

  return (
    <Screen scroll style={{ paddingBottom: 0 }} contentStyle={{ paddingBottom: spacing.xxl }}>
      <ScreenHeader title={t("producerPage.title")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="producer-page">
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Ionicons name="leaf" size={26} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.company}>{p.company_name}</Text>
          {(p as any).verified_badge ? (
            <View style={styles.verified} testID="verified-badge" accessibilityLabel={L("Verificato da 'Ra mia", "Verified by 'Ra mia")}>
              <Ionicons name="shield-checkmark" size={14} color={colors.onBrandSecondary} />
              <Text style={styles.verifiedText}>{L("Verificato da ’Ra mia", "Verified by ’Ra mia")}</Text>
            </View>
          ) : null}
          {p.region ? <Text style={styles.region}>{p.region}</Text> : null}
        </View>

        {bio ? <Text style={styles.bio}>{bio}</Text> : null}

        <ItemSection title={t("producerPage.certifications")} icon="ribbon" items={p.certifications} />
        <ItemSection title={t("producerPage.awards")} icon="trophy" items={p.awards} />
        <ItemSection title={t("producerPage.fairs")} icon="business" items={p.fairs} />

        {(p.website || p.phone || p.city) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("producerPage.contacts")}</Text>
            {p.city ? <ContactRow icon="location" text={p.city} /> : null}
            {p.phone ? <ContactRow icon="call" text={p.phone} onPress={() => Linking.openURL(`tel:${p.phone}`)} /> : null}
            {p.website ? <ContactRow icon="globe" text={p.website} onPress={() => Linking.openURL(p.website!.startsWith("http") ? p.website! : `https://${p.website}`)} /> : null}
          </View>
        )}

        {products.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("producerPage.products")} ({products.length})</Text>
            {products.map((pr) => (
              <Pressable key={pr.id} testID={`producer-product-${pr.id}`} onPress={() => router.push(`/shared/product/${pr.id}`)} style={({ pressed }) => [styles.prodRow, pressed && { opacity: 0.85 }]}>
                <Img uri={pr.image_url} style={styles.prodImg} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.prodName} numberOfLines={1}>{lang === "en" && pr.name_en ? pr.name_en : pr.name}</Text>
                  <Text style={styles.prodMeta}>€{Number(pr.price).toFixed(2)} / {pr.unit}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

function ItemSection({ title, icon, items }: { title: string; icon: string; items: ProfileItem[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: spacing.sm }}>
        {items.map((it, i) => (
          <View key={i} style={styles.itemRow}>
            <Ionicons name={icon as any} size={16} color={colors.brandSecondary} />
            <Text style={styles.itemName}>
              {it.name}
              {it.year ? ` · ${it.year}` : ""}
              {it.place ? ` · ${it.place}` : ""}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ContactRow({ icon, text, onPress }: { icon: string; text: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.contactRow}>
      <Ionicons name={icon as any} size={16} color={colors.brandPrimary} />
      <Text style={[styles.contactText, onPress && { color: colors.info }]} numberOfLines={1}>{text}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  verified: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: colors.brandSecondary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  verifiedText: { fontFamily: fonts.textBold, fontSize: 12, color: colors.onBrandSecondary },
  hero: { alignItems: "center", paddingVertical: spacing.lg },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  company: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface, textAlign: "center" },
  region: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.brandSecondary, marginTop: 2 },
  bio: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 22, marginTop: spacing.sm },
  section: { marginTop: spacing.xl },
  sectionTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemName: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  contactRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  contactText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  prodRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  prodImg: { width: 56, height: 56, borderRadius: radius.sm },
  prodName: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  prodMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
}));
