import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { CenterLoader, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { TradeDashboard } from "@/src/types";

export default function TradeDashboardScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const styles = useStyles();

  const dash = useQuery({ queryKey: ["trade-dashboard"], queryFn: () => api<TradeDashboard>("/trade/dashboard") });

  if (dash.isLoading) return <CenterLoader />;
  if (dash.isError || !dash.data)
    return (
      <Screen>
        <ScreenHeader title={t("trade.dashboard")} onBack={() => router.back()} />
        <ErrorBanner message={t("common.error")} onRetry={() => dash.refetch()} />
      </Screen>
    );

  const d = dash.data;
  const cards = [
    { icon: "earth", label: t("trade.dash.markets"), value: d.markets_monitored, tone: colors.brandPrimary },
    { icon: "cube", label: t("trade.dash.products"), value: d.products_analyzed, tone: colors.brandSecondary },
    { icon: "checkmark-done", label: t("trade.dash.analyses"), value: d.analyses_completed, tone: colors.info },
    { icon: "list", label: t("trade.dash.actions"), value: d.open_actions, tone: colors.warning },
    { icon: "notifications", label: t("trade.dash.alerts"), value: d.alerts, tone: colors.error },
    { icon: "pricetag", label: t("trade.dash.labels"), value: d.labels_todo, tone: colors.brandSecondary },
    { icon: "document", label: t("trade.dash.docs"), value: d.docs_missing, tone: colors.muted },
  ];

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("trade.dashboard")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="trade-dashboard">
        <View style={styles.grid}>
          {cards.map((c) => (
            <View key={c.label} style={styles.card} testID={`dash-${c.label}`}>
              <View style={[styles.cardIcon, { backgroundColor: `${c.tone}22` }]}>
                <Ionicons name={c.icon as any} size={18} color={c.tone} />
              </View>
              <Text style={styles.cardValue}>{c.value}</Text>
              <Text style={styles.cardLabel}>{c.label}</Text>
            </View>
          ))}
        </View>

        {d.activities.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t("trade.dash.recent")}</Text>
            {d.activities.map((a, i) => (
              <View key={i} style={styles.activity}>
                <Ionicons name="location" size={16} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityTitle}>{a.country} · {a.product_name}</Text>
                  {a.summary ? <Text style={styles.activitySub} numberOfLines={2}>{a.summary}</Text> : null}
                </View>
              </View>
            ))}
          </>
        )}

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={15} color={colors.brandSecondary} />
          <Text style={styles.disclaimerText}>{d.disclaimer}</Text>
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  card: { width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg },
  cardIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  cardValue: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  cardLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  activity: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  activityTitle: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },
  activitySub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  disclaimer: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.xl },
  disclaimerText: { flex: 1, fontFamily: fonts.text, fontSize: 11, color: colors.onBrandTertiary, lineHeight: 15 },
}));
