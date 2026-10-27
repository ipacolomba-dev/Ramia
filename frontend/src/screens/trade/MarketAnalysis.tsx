import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { Btn, CenterLoader, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { CountryChips, MarketAnalysisView, ProductPicker, ReliabilityBadge } from "@/src/components/trade";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { ExportPlan, Product, TradeAnalysis } from "@/src/types";

export default function TradeMarket() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();
  const params = useLocalSearchParams<{ productId?: string; country?: string }>();

  const [productId, setProductId] = useState<string | null>(params.productId ?? null);
  const [country, setCountry] = useState<string | null>(params.country ?? null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => api<{ id: string }>("/trade/market-analysis", { method: "POST", body: { product_id: productId, country } }),
    onSuccess: (d) => setAnalysisId(d.id),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const poll = useQuery({
    queryKey: ["trade-analysis-poll", analysisId],
    queryFn: () => api<TradeAnalysis>(`/trade/analyses/${analysisId}`),
    enabled: !!analysisId,
    refetchInterval: (q: any) => (q.state.data?.status === "pending" ? 2500 : false),
  });

  const result = poll.data && poll.data.status === "ready" ? poll.data : null;
  const running = start.isPending || (!!analysisId && poll.data?.status === "pending") || (!!analysisId && !poll.data);
  const failed = poll.data?.status === "error";

  const createPlan = useMutation({
    mutationFn: () => api<ExportPlan>("/trade/export-plan", { method: "POST", body: { product_id: productId, country, analysis_id: analysisId } }),
    onSuccess: (p) => router.push(`/producer/export/plan/${p.id}`),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const monitor = useMutation({
    mutationFn: () => api("/regulatory/monitors", { method: "POST", body: { product_id: productId, country } }),
    onSuccess: () => toast.show(t("alerts.monitorAdded")),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const runAnalysis = () => {
    setAnalysisId(null);
    start.mutate();
  };

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("trade.action.sell")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="trade-market">
        <ProductPicker value={productId} onChange={(p: Product) => setProductId(p.id)} />
        <CountryChips value={country} onChange={setCountry} />
        <Btn
          title={running ? t("trade.running") : t("trade.run")}
          icon="analytics"
          size="lg"
          testID="trade-run-analysis"
          loading={running}
          disabled={!productId || !country || running}
          onPress={runAnalysis}
        />

        {running && <CenterLoader />}
        {failed && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{t("common.error")}</Text>
          </View>
        )}

        {result && (
          <View style={{ marginTop: spacing.lg }}>
            <View style={styles.topRow}>
              <Text style={styles.country}>{result.country}</Text>
              <ReliabilityBadge reliability={result.live ? "verified" : "to_verify"} />
            </View>
            {!result.live && (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{t("trade.reliabilityBanner")}</Text>
              </View>
            )}
            {result.missing_info && result.missing_info.length > 0 && (
              <View style={styles.missing}>
                <Text style={styles.missingTitle}>{t("trade.missingInfo")}</Text>
                <Text style={styles.missingText}>{result.missing_info.join(", ")}</Text>
              </View>
            )}
            <MarketAnalysisView data={result.data} />
            <Btn
              title={t("alerts.monitor")}
              icon="notifications-outline"
              variant="outline"
              testID="trade-monitor"
              loading={monitor.isPending}
              onPress={() => monitor.mutate()}
              style={{ marginTop: spacing.lg }}
            />
            <Btn
              title={t("trade.createPlan")}
              icon="map"
              variant="secondary"
              testID="trade-create-plan"
              loading={createPlan.isPending}
              onPress={() => createPlan.mutate()}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  country: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  banner: { backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
  bannerText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onBrandTertiary, lineHeight: 16 },
  missing: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
  missingTitle: { fontFamily: fonts.textBold, fontSize: 12, color: colors.onSurface },
  missingText: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
}));
