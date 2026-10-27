import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, Notice, Section, Stat, StatRow, fmtEur } from "@/src/components/blocks";
import { CenterLoader, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { ProducerEarnings } from "@/src/types";

export default function ProducerEarningsScreen() {
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["producer-earnings"], queryFn: () => api<ProducerEarnings>("/producer/earnings") });
  const e = q.data;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Incassi", "Earnings")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="producer-earnings">
        {q.isLoading ? <CenterLoader /> : q.isError || !e ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> : (
          <>
            <Card>
              <Muted>{L("Netto stimato", "Estimated net")}</Muted>
              <Text style={styles.big} testID="earnings-net">{fmtEur(e.net)}</Text>
              <Muted>{L(`Lordo ${fmtEur(e.gross)} − commissione ${Math.round(e.rate * 100)}% (${fmtEur(e.commission)})`, `Gross ${fmtEur(e.gross)} − ${Math.round(e.rate * 100)}% fee (${fmtEur(e.commission)})`)}</Muted>
            </Card>
            <StatRow>
              <Stat value={fmtEur(e.orders_total)} label={L("Vendite al dettaglio", "Retail sales")} />
              <Stat value={fmtEur(e.b2b_total)} label={L("Accordi B2B", "B2B deals")} />
            </StatRow>
            <Section title={L("Per mese", "By month")} />
            {e.monthly.length === 0 ? <Muted>{L("Nessuna vendita ancora.", "No sales yet.")}</Muted> : e.monthly.map((m) => (
              <View key={m.month} style={styles.row}>
                <Text style={styles.month}>{m.month}</Text>
                <Text style={styles.amount}>{fmtEur(m.amount)}</Text>
              </View>
            ))}
            <Notice text={L("Pagamenti simulati: al momento non avviene alcun movimento di denaro reale.", "Simulated payments: no real money moves yet.")} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  big: { fontFamily: fonts.display, fontSize: 32, color: colors.brandPrimary, marginVertical: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  month: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  amount: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
}));
