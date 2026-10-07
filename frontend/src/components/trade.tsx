import { useQuery } from "@tanstack/react-query";
import React from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Img } from "@/src/components/Img";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { MarketData, Product, TradeSource } from "@/src/types";

export const COUNTRIES = [
  "Germania", "Francia", "Spagna", "Regno Unito", "USA", "Canada",
  "Giappone", "Emirati Arabi Uniti", "Australia", "Svizzera",
];

export function ProductPicker({ value, onChange }: { value: string | null; onChange: (p: Product) => void }) {
  const { t } = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["my-products-trade"], queryFn: () => api<Product[]>("/products/mine") });

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.pickerLabel}>{t("trade.selectProduct")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
        {(q.data ?? []).map((p) => {
          const sel = value === p.id;
          return (
            <Pressable
              key={p.id}
              testID={`trade-product-${p.id}`}
              onPress={() => onChange(p)}
              style={[styles.prodChip, sel && { borderColor: colors.brandPrimary, borderWidth: 2 }]}
            >
              <Img uri={p.image_url} style={styles.prodChipImg} />
              <Text style={styles.prodChipName} numberOfLines={2}>{p.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function CountryChips({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  const { t } = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.pickerLabel}>{t("trade.selectCountry")}</Text>
      <View style={styles.chipsWrap}>
        {COUNTRIES.map((c) => {
          const sel = value === c;
          return (
            <Pressable
              key={c}
              testID={`trade-country-${c}`}
              onPress={() => onChange(c)}
              style={[styles.countryChip, sel && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
            >
              <Text style={[styles.countryChipText, sel && { color: colors.onBrandPrimary }]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ReliabilityBadge({ reliability }: { reliability?: string }) {
  const { t } = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  const verified = reliability === "verified";
  return (
    <View style={[styles.relBadge, { backgroundColor: verified ? colors.success : colors.warning }]}>
      <Ionicons name={verified ? "shield-checkmark" : "alert-circle"} size={12} color={verified ? colors.onSuccess : colors.onWarning} />
      <Text style={[styles.relBadgeText, { color: verified ? colors.onSuccess : colors.onWarning }]}>
        {verified ? t("trade.sourceVerified") : t("trade.sourceToVerify")}
      </Text>
    </View>
  );
}

function Section({ title, value }: { title: string; value?: string }) {
  const styles = useStyles();
  if (!value) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{value}</Text>
    </View>
  );
}

function ListSection({ title, items, icon }: { title: string; items?: string[]; icon?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((it, i) => (
        <View key={i} style={styles.liRow}>
          <Ionicons name={(icon as any) || "ellipse"} size={icon ? 14 : 6} color={colors.brandSecondary} style={{ marginTop: icon ? 2 : 7 }} />
          <Text style={styles.liText}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

export function SourceList({ sources }: { sources?: TradeSource[] }) {
  const { t } = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  if (!sources || sources.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("trade.sec.sources")}</Text>
      {sources.map((s, i) => (
        <Pressable key={i} testID={`trade-source-${i}`} onPress={() => s.url && Linking.openURL(s.url)} style={styles.sourceRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sourceTitle, s.url ? { color: colors.info } : null]} numberOfLines={2}>{s.title}</Text>
            {s.authority ? <Text style={styles.sourceMeta}>{s.authority}{s.date ? ` · ${s.date}` : ""}</Text> : null}
          </View>
          <ReliabilityBadge reliability={s.reliability} />
        </Pressable>
      ))}
    </View>
  );
}

export function MarketAnalysisView({ data }: { data: MarketData }) {
  const { t } = useT();
  const styles = useStyles();
  const lab = data.labeling || {};
  return (
    <View testID="trade-analysis-view">
      <Section title={t("trade.sec.summary")} value={data.summary} />
      <Section title={t("trade.sec.accessibility")} value={data.accessibility} />
      <Section title={t("trade.sec.hsCode")} value={data.hs_code} />
      <Section title={t("trade.sec.customs")} value={data.customs} />
      <Section title={t("trade.sec.duties")} value={data.duties} />
      <Section title={t("trade.sec.taxes")} value={data.taxes} />
      <Section title={t("trade.sec.health")} value={data.health} />
      <Section title={t("trade.sec.foodSafety")} value={data.food_safety} />
      <Section title={t("trade.sec.importReq")} value={data.import_requirements} />
      {(lab.language || lab.allergens || lab.packaging || lab.shelf_life || (lab.mandatory && lab.mandatory.length)) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("trade.sec.labeling")}</Text>
          {lab.language ? <Text style={styles.sectionBody}>{t("trade.labeling.language")}: {lab.language}</Text> : null}
          {lab.allergens ? <Text style={styles.sectionBody}>{t("trade.labeling.allergens")}: {lab.allergens}</Text> : null}
          {lab.packaging ? <Text style={styles.sectionBody}>{t("trade.labeling.packaging")}: {lab.packaging}</Text> : null}
          {lab.shelf_life ? <Text style={styles.sectionBody}>{t("trade.labeling.shelfLife")}: {lab.shelf_life}</Text> : null}
          {lab.mandatory && lab.mandatory.length ? (
            <ListSection title={t("trade.labeling.mandatory")} items={lab.mandatory} icon="checkmark-circle-outline" />
          ) : null}
        </View>
      ) : null}
      <ListSection title={t("trade.sec.documents")} items={data.documents} icon="document-text-outline" />
      <ListSection title={t("trade.sec.certifications")} items={data.certifications} icon="ribbon-outline" />
      <Section title={t("trade.sec.importerReq")} value={data.importer_requirements} />
      <Section title={t("trade.sec.logistics")} value={data.logistics} />
      <Section title={t("trade.sec.controls")} value={data.controls} />
      <ListSection title={t("trade.sec.risks")} items={data.risks} icon="warning-outline" />
      <ListSection title={t("trade.sec.actions")} items={data.actions} icon="arrow-forward-circle-outline" />
      <SourceList sources={data.sources} />
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  pickerLabel: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm },
  prodChip: { width: 110, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  prodChipImg: { width: "100%", height: 64, borderRadius: radius.sm, marginBottom: spacing.xs },
  prodChipName: { fontFamily: fonts.textMedium, fontSize: 11, color: colors.onSurface },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  countryChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 7, backgroundColor: colors.surfaceSecondary },
  countryChipText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary },
  relBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  relBadgeText: { fontFamily: fonts.textBold, fontSize: 9 },
  section: { marginTop: spacing.lg },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface, marginBottom: spacing.xs },
  sectionBody: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 20, marginTop: 2 },
  liRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs, alignItems: "flex-start" },
  liText: { flex: 1, fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
  sourceTitle: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurface },
  sourceMeta: { fontFamily: fonts.text, fontSize: 10, color: colors.muted, marginTop: 1 },
}));
