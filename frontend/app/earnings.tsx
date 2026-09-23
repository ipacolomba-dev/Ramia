import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Earnings } from "@/src/types";

export default function EarningsScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const styles = useStyles();

  const earnings = useQuery({
    queryKey: ["admin-earnings"],
    queryFn: () => api<Earnings>("/admin/earnings"),
    enabled: user?.role === "admin",
  });

  if (user?.role !== "admin") {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <ScreenHeader title={t("earnings.title")} onBack={() => router.back()} />
        <EmptyState icon="lock-closed-outline" title={t("earnings.title")} subtitle={t("common.error")} />
      </Screen>
    );
  }

  const e = earnings.data;
  const money = (v?: number) => `€${(v ?? 0).toFixed(2)}`;

  const rows = e
    ? [
        { icon: "megaphone", label: t("earnings.advertising"), value: e.advertising, tone: colors.brandPrimary },
        { icon: "cart", label: t("earnings.salesCommission"), value: e.sales_commission, sub: `${t("earnings.volume")} ${money(e.sales_volume)}`, tone: colors.brandSecondary },
        { icon: "cube", label: t("earnings.logisticsCommission"), value: e.logistics_commission, sub: `${t("earnings.volume")} ${money(e.logistics_volume)}`, tone: colors.info },
        { icon: "pricetag", label: t("earnings.labelsCommission"), value: e.labels_commission, sub: `${t("earnings.volume")} ${money(e.labels_volume)}`, tone: colors.warning },
      ]
    : [];

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("earnings.title")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="earnings-panel">
        <Text style={styles.sub}>{t("earnings.sub")}</Text>
        {earnings.isLoading ? (
          <CenterLoader />
        ) : earnings.isError ? (
          <ErrorBanner message={t("common.error")} onRetry={() => earnings.refetch()} />
        ) : (
          <>
            <View style={styles.totalCard} testID="earnings-total">
              <Text style={styles.totalLabel}>{t("earnings.total")}</Text>
              <Text style={styles.totalValue}>{money(e?.total)}</Text>
            </View>
            {rows.map((r) => (
              <View key={r.label} style={styles.row} testID={`earnings-row-${r.label}`}>
                <View style={[styles.rowIcon, { backgroundColor: `${r.tone}22` }]}>
                  <Ionicons name={r.icon as any} size={18} color={r.tone} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  {r.sub ? <Text style={styles.rowSub}>{r.sub}</Text> : null}
                </View>
                <Text style={styles.rowValue}>{money(r.value)}</Text>
              </View>
            ))}
            <View style={styles.noteBox}>
              <Ionicons name="information-circle" size={15} color={colors.brandSecondary} />
              <Text style={styles.noteText}>{t("earnings.note")}</Text>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  sub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginTop: spacing.md, marginBottom: spacing.lg, lineHeight: 19 },
  totalCard: { backgroundColor: colors.surfaceInverse, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", marginBottom: spacing.lg },
  totalLabel: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurfaceInverse, opacity: 0.8 },
  totalValue: { fontFamily: fonts.display, fontSize: 40, color: colors.onSurfaceInverse, marginTop: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rowIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  rowLabel: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  rowSub: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginTop: 2 },
  rowValue: { fontFamily: fonts.textBold, fontSize: 17, color: colors.brandPrimary },
  noteBox: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  noteText: { flex: 1, fontFamily: fonts.text, fontSize: 12, color: colors.onBrandTertiary, lineHeight: 17 },
}));
