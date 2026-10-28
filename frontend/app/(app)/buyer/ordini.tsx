import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ESCROW_LABELS, escrowTone, startCheckout } from "@/src/payments";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Order } from "@/src/types";

export default function Orders() {
  const { colors } = useTheme();
  const { t, L } = useT();
  const { user, loading } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [disputeFor, setDisputeFor] = useState<Order | null>(null);
  const [reason, setReason] = useState("");

  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => api<Order[]>("/orders/mine"),
    enabled: !!user,
  });
  const dispute = useMutation({
    mutationFn: () => api(`/orders/${disputeFor!.id}/dispute`, { method: "POST", body: { reason } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); setDisputeFor(null); setReason(""); toast.show(L("Segnalazione inviata", "Report sent")); },
    onError: (e: Error) => toast.show(e.message, "error"),
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
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="orders-list"
          refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => orders.refetch()} />}>
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
                <OrderBadge o={o} />
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
              <OrderActions o={o} onDispute={() => setDisputeFor(o)} />
            </View>
          ))}
        </ScrollView>
      )}
      <Sheet visible={!!disputeFor} onClose={() => setDisputeFor(null)} title={L("Segnala un problema", "Report a problem")}>
        <Text style={styles.itemLine}>{L("I fondi restano bloccati finché 'Ra mia non verifica la segnalazione.", "Funds stay blocked until 'Ra mia reviews your report.")}</Text>
        <Field label={L("Cosa è successo?", "What happened?")}>
          <Input testID="dispute-reason" value={reason} onChangeText={setReason} multiline placeholder={L("Merce danneggiata, mancante…", "Damaged, missing goods…")} />
        </Field>
        <Btn title={L("Invia segnalazione", "Send report")} variant="danger" testID="dispute-submit" loading={dispute.isPending}
          onPress={() => (reason.trim().length >= 5 ? dispute.mutate() : toast.show(L("Descrivi il problema (almeno 5 caratteri)", "Describe the problem"), "error"))} />
      </Sheet>
    </Screen>
  );
}

function OrderBadge({ o }: { o: Order }) {
  const { L } = useT();
  if (o.status === "awaiting_payment") return <Badge label={L("Da pagare", "To pay")} tone="warning" />;
  if (o.status === "cancelled") return <Badge label={L("Annullato", "Cancelled")} tone="neutral" />;
  if (o.escrow) return <Badge label={L(...(ESCROW_LABELS[o.escrow.status] ?? [o.escrow.status, o.escrow.status]))} tone={escrowTone(o.escrow.status) as any} />;
  return <Badge label={L("Pagato", "Paid")} tone="success" />;
}

function OrderActions({ o, onDispute }: { o: Order; onDispute: () => void }) {
  const { L } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const done = (msg: string) => { qc.invalidateQueries({ queryKey: ["orders"] }); toast.show(msg); };
  const pay = useMutation({ mutationFn: () => startCheckout("order", o.id), onError: (e: Error) => toast.show(e.message, "error") });
  const cancel = useMutation({ mutationFn: () => api(`/orders/${o.id}/cancel`, { method: "POST" }), onSuccess: () => done(L("Ordine annullato", "Order cancelled")), onError: (e: Error) => toast.show(e.message, "error") });
  const confirm = useMutation({ mutationFn: () => api(`/orders/${o.id}/confirm-delivery`, { method: "POST" }), onSuccess: () => done(L("Grazie! Il pagamento è stato girato al produttore", "Thanks! Payment released to the producer")), onError: (e: Error) => toast.show(e.message, "error") });

  if (o.status === "awaiting_payment") {
    return (
      <View style={styles.actions}>
        <Btn title={L("Paga ora", "Pay now")} icon="card" size="sm" testID={`order-pay-${o.id}`} loading={pay.isPending} onPress={() => pay.mutate()} style={{ flex: 1 }} />
        <Btn title={L("Annulla", "Cancel")} variant="outline" size="sm" testID={`order-cancel-${o.id}`} loading={cancel.isPending} onPress={() => cancel.mutate()} style={{ flex: 1 }} />
      </View>
    );
  }
  if (o.escrow?.status === "held") {
    return (
      <View>
        <Text style={styles.escrowNote}>{L(`Fondi in garanzia: confermali alla consegna. Rilascio automatico il ${o.escrow.auto_release_at ? new Date(o.escrow.auto_release_at).toLocaleDateString("it-IT") : "—"}.`, "Funds held: confirm on delivery.")}</Text>
        <View style={styles.actions}>
          <Btn title={L("Ho ricevuto la merce", "I received it")} icon="checkmark" size="sm" testID={`order-confirm-${o.id}`} loading={confirm.isPending} onPress={() => confirm.mutate()} style={{ flex: 1 }} />
          <Btn title={L("Segnala problema", "Report problem")} variant="outline" size="sm" testID={`order-dispute-${o.id}`} onPress={onDispute} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }
  if (o.escrow?.status === "disputed") return <Text style={styles.escrowNote}>{L("Segnalazione in verifica da parte di 'Ra mia.", "Report under review by 'Ra mia.")}</Text>;
  return null;
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
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  escrowNote: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: spacing.md, lineHeight: 17 },
}));
