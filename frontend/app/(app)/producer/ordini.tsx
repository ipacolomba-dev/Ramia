import { useQuery } from "@tanstack/react-query";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, fmtDate, fmtEur } from "@/src/components/blocks";
import { Badge, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { ReceivedOrder } from "@/src/types";

export default function ProducerOrders() {
  const { t, L } = useT();
  const styles = useStyles();
  const orders = useQuery({ queryKey: ["orders-received"], queryFn: () => api<ReceivedOrder[]>("/orders/received") });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Ordini ricevuti", "Received orders")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="producer-orders"
        refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => orders.refetch()} />}>
        {orders.isLoading ? <CenterLoader /> : orders.isError ? <ErrorBanner message={t("common.error")} onRetry={() => orders.refetch()} /> :
          (orders.data ?? []).length === 0 ? (
            <EmptyState icon="receipt-outline" title={L("Nessun ordine ricevuto", "No orders received")} subtitle={L("Quando un cliente acquista i tuoi prodotti lo vedrai qui", "When a customer buys your products you'll see it here")} />
          ) : orders.data!.map((o) => (
            <Card key={o.id} testID={`received-order-${o.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={styles.id}>#{o.id.slice(0, 8)}</Text>
                  <Muted>{o.customer_name}{o.city ? ` · ${o.city}` : ""} · {fmtDate(o.created_at)}</Muted>
                </View>
                <Badge label={t("orders.paid")} tone="success" />
              </View>
              {o.items.map((it, i) => (
                <Text key={i} style={styles.line}>{it.qty} × {it.name} — {fmtEur(it.price * it.qty)}</Text>
              ))}
              <Text style={styles.total}>{t("common.total")}: {fmtEur(o.subtotal)}</Text>
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  id: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  line: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  total: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary, marginTop: spacing.sm, textAlign: "right" },
}));
