import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { CenterLoader, EmptyState, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { PlanSummary, TradeAnalysis } from "@/src/types";

export default function TradeHistory() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const styles = useStyles();

  const analyses = useQuery({ queryKey: ["trade-analyses"], queryFn: () => api<TradeAnalysis[]>("/trade/analyses") });
  const plans = useQuery({ queryKey: ["export-plans"], queryFn: () => api<PlanSummary[]>("/trade/export-plans") });

  const loading = analyses.isLoading || plans.isLoading;
  const emptyAll = (analyses.data ?? []).length === 0 && (plans.data ?? []).length === 0;

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("trade.history")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="trade-history">
        {loading ? (
          <CenterLoader />
        ) : emptyAll ? (
          <EmptyState icon="time-outline" title={t("trade.noAnalyses")} />
        ) : (
          <>
            {(analyses.data ?? []).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>{t("trade.history")}</Text>
                {analyses.data!.map((a) => (
                  <Pressable key={a.id} testID={`history-analysis-${a.id}`} onPress={() => router.push(`/producer/export/analysis/${a.id}`)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
                    <Ionicons name="earth" size={20} color={colors.brandPrimary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{a.country} · {a.product_name}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{t("trade.version")} {a.version} · {a.summary}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </>
            )}
            {(plans.data ?? []).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>{t("trade.plansTitle")}</Text>
                {plans.data!.map((p) => (
                  <Pressable key={p.id} testID={`history-plan-${p.id}`} onPress={() => router.push(`/producer/export/plan/${p.id}`)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
                    <Ionicons name="map" size={20} color={colors.brandSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{p.country} · {p.product_name}</Text>
                      <Text style={styles.rowSub}>{p.done}/{p.total}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  sectionTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.md },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
  rowTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  rowSub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
}));
