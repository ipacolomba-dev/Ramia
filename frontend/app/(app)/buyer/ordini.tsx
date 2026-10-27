import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Order } from "@/src/types";

export default function Orders() {
  const { colors } = useTheme();
  const { t } = useT();
  const { user, loading } = useAuth();
  const router = useRouter();
  const styles = useStyles();

  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => api<Order[]>("/orders/mine"),
    enabled: !!user,
  });

  if (loading) return <CenterLoader />;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("orders.title")} />
      {!user ? (
        <EmptyState icon="log-in-outline" title={t("auth.login")} subtitle={t("welcome.guestHint")} />
      ) : orders.isLoading ? (
        <CenterLoader />
      ) : orders.isError ? (
        <ErrorBanner message={t("common.error")} onRetry={() => orders.refetch()} />
      ) : (orders.data ?? []).length === 0 ? (
        <EmptyState icon="receipt-outline" title={t("orders.empty")} subtitle={t("orders.emptySub")} />
      ) : (
        <View style={{ padding: spacing.lg }} testID="orders-list">
          {orders.data!.map((o) => (
            <View key={o.id} style={styles.card} testID={`order-${o.id}`}>
              <View style={styles.cardTop}>
                <View style={styles.orderIcon}>
                  <Ionicons name="receipt" size={18} color={colors.onBrandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderId}>#{o.id.slice(0, 8)}</Text>
                  <Text style={styles.orderDate}>
                    {new Date(o.created_at).toLocaleDateString(t("common.language") === "en" ? "en-GB" : "it-IT")}
                  </Text>
                </View>
                <Badge label={t("orders.paid")} tone="success" />
              </View>
              {o.items.map((it, idx) => (
                <Text key={idx} style={styles.itemLine} numberOfLines={1}>
                  {it.qty} × {it.name} — €{(it.price * it.qty).toFixed(2)}
                </Text>
              ))}
              {o.package_id && <Text style={styles.itemLine}>{t("home.packages")}</Text>}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t("common.total")}</Text>
                <Text style={styles.totalValue}>€{o.total.toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  orderIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  orderId: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  orderDate: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  itemLine: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  totalLabel: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  totalValue: { fontFamily: fonts.textBold, fontSize: 18, color: colors.brandPrimary },
}));
