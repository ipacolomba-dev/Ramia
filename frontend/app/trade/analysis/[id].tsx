import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { Btn, CenterLoader, ErrorBanner, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { MarketAnalysisView, ReliabilityBadge } from "@/src/components/trade";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { ExportPlan, TradeAnalysis } from "@/src/types";

export default function AnalysisDetail() {
  const { colors } = useTheme();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();

  const q = useQuery({
    queryKey: ["trade-analysis", id],
    queryFn: () => api<TradeAnalysis>(`/trade/analyses/${id}`),
    refetchInterval: (query: any) => (query.state.data?.status === "pending" ? 2500 : false),
  });

  const createPlan = useMutation({
    mutationFn: () => api<ExportPlan>("/trade/export-plan", { method: "POST", body: { product_id: q.data?.product_id, country: q.data?.country, analysis_id: id } }),
    onSuccess: (p) => router.push(`/trade/plan/${p.id}`),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (q.isLoading) return <CenterLoader />;
  if (q.isError || !q.data)
    return (
      <Screen>
        <ScreenHeader title="" onBack={() => router.back()} />
        <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} />
      </Screen>
    );

  const a = q.data;

  if (a.status === "pending")
    return (
      <Screen>
        <ScreenHeader title={`${a.country} · ${a.product_name}`} onBack={() => router.back()} />
        <CenterLoader />
      </Screen>
    );

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={`${a.country} · ${a.product_name}`} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="trade-analysis-detail">
        <View style={styles.topRow}>
          <Text style={styles.version}>{t("trade.version")} {a.version}</Text>
          <ReliabilityBadge reliability={a.live ? "verified" : "to_verify"} />
        </View>
        {!a.live && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{t("trade.reliabilityBanner")}</Text>
          </View>
        )}
        <MarketAnalysisView data={a.data} />
        <Btn title={t("trade.createPlan")} icon="map" variant="secondary" testID="analysis-create-plan" loading={createPlan.isPending} onPress={() => createPlan.mutate()} style={{ marginTop: spacing.xl }} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  version: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.muted },
  banner: { backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
  bannerText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onBrandTertiary, lineHeight: 16 },
}));
