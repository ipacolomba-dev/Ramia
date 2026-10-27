import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, fmtDate, fmtEur } from "@/src/components/blocks";
import { Badge, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { MyQuote } from "@/src/types";

export default function LogisticsQuotes() {
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["my-quotes"], queryFn: () => api<MyQuote[]>("/logistics/quotes/mine") });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("I miei preventivi", "My quotes")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="logistics-quotes"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        {q.isLoading ? <CenterLoader /> : q.isError ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> :
          (q.data ?? []).length === 0 ? (
            <EmptyState icon="pricetags-outline" title={L("Nessun preventivo inviato", "No quotes sent")} subtitle={L("Apri una spedizione e proponi il tuo prezzo", "Open a shipment and propose your price")} />
          ) : q.data!.map((x) => (
            <Card key={x.id} testID={`quote-${x.id}`} onPress={() => router.push(`/logistics/spedizioni/${x.request_id}`)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <Text style={styles.title} numberOfLines={1}>{x.request_title}</Text>
                <Text style={styles.price}>{fmtEur(x.price)}</Text>
              </View>
              <Muted>{x.origin} → {x.destination} · {x.transit_days} {L("giorni", "days")} · {fmtDate(x.created_at)}</Muted>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                <Badge label={x.status === "open" ? L("Spedizione aperta", "Open shipment") : x.status} tone="info" />
                {x.selected && <Badge label={L("In carico a te", "Assigned to you")} tone="success" />}
              </View>
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { flex: 1, fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  price: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary },
}));
