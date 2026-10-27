import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Muted, Section, Stat, StatRow, fmtEur } from "@/src/components/blocks";
import { CenterLoader, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing } from "@/src/theme";
import type { BuyerAnalytics } from "@/src/types";

function Bars({ rows }: { rows: { name: string; amount: number }[] }) {
  const { L } = useT();
  const styles = useStyles();
  const max = Math.max(1, ...rows.map((r) => r.amount));
  if (rows.length === 0) return <Muted>{L("Nessun dato ancora.", "No data yet.")}</Muted>;
  return (
    <>
      {rows.map((r) => (
        <View key={r.name} style={{ marginBottom: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.barLabel} numberOfLines={1}>{r.name}</Text>
            <Text style={styles.barLabel}>{fmtEur(r.amount)}</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${(r.amount / max) * 100}%` }]} /></View>
        </View>
      ))}
    </>
  );
}

export default function BuyerAnalyticsScreen() {
  const { user } = useAuth();
  const { t, L } = useT();
  const router = useRouter();
  const q = useQuery({ queryKey: ["buyer-analytics"], queryFn: () => api<BuyerAnalytics>("/buyer/analytics") });
  const a = q.data;
  const isBusiness = user?.role === "business" || user?.role === "admin";

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Analisi acquisti", "Purchase analytics")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="buyer-analytics">
        {q.isLoading ? <CenterLoader /> : q.isError || !a ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> : (
          <>
            <StatRow>
              <Stat value={a.orders_count} label={L("Ordini", "Orders")} />
              <Stat value={fmtEur(a.orders_spend)} label={L("Spesa ordini", "Order spend")} />
              {isBusiness && <Stat value={a.b2b_agreements} label={L("Accordi B2B", "B2B deals")} />}
              {isBusiness && <Stat value={fmtEur(a.b2b_spend)} label={L("Valore B2B", "B2B value")} />}
              {isBusiness && <Stat value={a.negotiations} label={L("Trattative", "Negotiations")} />}
              {isBusiness && <Stat value={a.open_requests} label={L("Richieste aperte", "Open requests")} />}
            </StatRow>
            <Section title={L("Produttori principali", "Top producers")} />
            <Bars rows={a.top_producers} />
            <Section title={L("Prodotti più acquistati", "Top products")} />
            <Bars rows={a.top_products} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  barLabel: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, flexShrink: 1 },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, marginTop: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.brandPrimary },
}));
