import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, fmtDate } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { Lot } from "@/src/types";

const isExpiring = (d?: string | null) => !!d && new Date(d).getTime() - Date.now() < 30 * 864e5;

export default function Lots() {
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const lots = useQuery({ queryKey: ["lots"], queryFn: () => api<Lot[]>("/lots") });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Lotti", "Lots")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="lots-list"
        refreshControl={<RefreshControl refreshing={lots.isRefetching} onRefresh={() => lots.refetch()} />}>
        <Btn title={L("Registra lotto", "Record lot")} icon="add" testID="lots-new" onPress={() => router.push("/producer/lotti/form")} style={{ marginBottom: spacing.md }} />
        {lots.isLoading ? <CenterLoader /> : lots.isError ? <ErrorBanner message={t("common.error")} onRetry={() => lots.refetch()} /> :
          (lots.data ?? []).length === 0 ? (
            <EmptyState icon="barcode-outline" title={L("Nessun lotto", "No lots")} subtitle={L("Registra i lotti per tracciabilità, scadenze e giacenze", "Record lots for traceability, expiry and stock")} />
          ) : lots.data!.map((l) => (
            <Card key={l.id} testID={`lot-${l.id}`} onPress={() => router.push({ pathname: "/producer/lotti/form", params: { id: l.id } })}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.code}>{l.lot_code}</Text>
                  <Muted>{l.product_name}</Muted>
                </View>
                <Badge label={`${l.quantity} ${l.unit}`} tone="info" />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "center" }}>
                <Muted>{L("Prodotto il", "Produced")} {fmtDate(l.production_date)} · {L("Scade", "Expires")} {fmtDate(l.expiry_date)}</Muted>
                {isExpiring(l.expiry_date) && <Badge label={L("In scadenza", "Expiring")} tone="warning" />}
              </View>
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  code: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
}));
