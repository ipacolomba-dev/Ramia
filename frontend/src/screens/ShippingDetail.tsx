import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Btn, CenterLoader, ErrorBanner, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { ShippingRequest } from "@/src/types";
import { ESCROW_LABELS, escrowTone, startCheckout } from "@/src/payments";

/** Transport payment (escrow until proof of delivery) + POD details. */
function PaymentCard({ req, isCreator }: { req: ShippingRequest; isCreator: boolean }) {
  const { L } = useT();
  const toast = useToast();
  const styles = useStyles();
  const pay = useMutation({ mutationFn: () => startCheckout("shipment", req.id), onError: (e: Error) => toast.show(e.message, "error") });
  const quote = req.quotes.find((q) => q.id === req.selected_quote_id);
  if (!req.carrier_id || !quote) return null;
  const fee = req.commercial_snapshot?.producer_fee ?? 0;
  const total = quote.price + fee;
  return (
    <View style={styles.sectionCard} testID="shipping-payment">
      <View style={styles.payRow}>
        <Text style={styles.sectionTitle}>{L("Pagamento trasporto", "Transport payment")}</Text>
        {req.escrow ? <Badge label={L(...(ESCROW_LABELS[req.escrow.status] ?? [req.escrow.status, req.escrow.status]))} tone={escrowTone(req.escrow.status) as any} /> : <Badge label={L("Da pagare", "To pay")} tone="warning" />}
      </View>
      <Text style={styles.meta}>{L(`Vettore €${quote.price.toFixed(2)}`, `Carrier €${quote.price.toFixed(2)}`)}{fee > 0 ? L(` + commissione €${fee.toFixed(2)}`, ` + fee €${fee.toFixed(2)}`) : ""} = €{total.toFixed(2)}</Text>
      {req.pod ? (
        <Text style={styles.payNote} testID="shipping-pod">{L(`Consegnato il ${new Date(req.pod.at).toLocaleDateString("it-IT")} · ricevuto da ${req.pod.recipient}`, `Delivered ${new Date(req.pod.at).toLocaleDateString("en-GB")} · received by ${req.pod.recipient}`)}</Text>
      ) : (
        <Text style={styles.payNote}>{L("I soldi restano in garanzia e vanno al vettore solo con la prova di consegna.", "Funds are held and paid to the carrier only on proof of delivery.")}</Text>
      )}
      {isCreator && !req.escrow && (
        <Btn title={L("Paga trasporto", "Pay transport")} icon="card" testID="shipping-pay-button" loading={pay.isPending} onPress={() => pay.mutate()} style={{ marginTop: spacing.md }} />
      )}
    </View>
  );
}

export default function ShippingDetail() {
  const { colors } = useTheme();
  const { t, L } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const [quoteSheet, setQuoteSheet] = useState(false);
  const [qPrice, setQPrice] = useState("");
  const [qDays, setQDays] = useState("");
  const [qMessage, setQMessage] = useState("");

  const request = useQuery({ queryKey: ["shipping-request", id], queryFn: () => api<ShippingRequest>(`/logistics/requests/${id}`) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shipping-request", id] });
    queryClient.invalidateQueries({ queryKey: ["shipping-requests"] });
  };

  const join = useMutation({
    mutationFn: () => api<ShippingRequest>(`/logistics/requests/${id}/join`, { method: "POST", body: {} }),
    onSuccess: () => {
      invalidate();
      toast.show(t("toast.saved"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const sendQuote = useMutation({
    mutationFn: () =>
      api<ShippingRequest>(`/logistics/requests/${id}/quotes`, {
        method: "POST",
        body: { price: parseFloat(qPrice.replace(",", ".")), transit_days: parseInt(qDays, 10), message: qMessage || null },
      }),
    onSuccess: () => {
      setQuoteSheet(false);
      setQPrice(""); setQDays(""); setQMessage("");
      invalidate();
      toast.show(t("toast.sent"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const select = useMutation({
    mutationFn: (quote_id: string) => api(`/logistics/requests/${id}/select-quote`, { method: "POST", body: { quote_id } }),
    onSuccess: () => {
      invalidate();
      toast.show(L("Trasportatore scelto", "Carrier selected"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (request.isLoading) return <CenterLoader />;
  if (request.isError || !request.data)
    return (
      <Screen>
        <ScreenHeader title="" onBack={() => router.back()} />
        <ErrorBanner message={t("common.error")} onRetry={() => request.refetch()} />
      </Screen>
    );

  const req = request.data;
  const isParticipant = req.participants.some((p) => p.user_id === user?.id) || req.creator_id === user?.id;
  const canJoin = (user?.role === "producer" || user?.role === "business") && !isParticipant;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("logistics.title")} onBack={() => router.back()} />
      <View style={{ flex: 1 }}>
        <View style={styles.card} testID="shipping-detail">
          <View style={styles.routeRow}>
            <View style={styles.routeBadge}>
              <Ionicons name="arrow-up" size={12} color={colors.onBrandSecondary} />
              <Text style={styles.routeText}>{req.origin}</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color={colors.muted} />
            <View style={[styles.routeBadge, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="arrow-down" size={12} color={colors.onBrandTertiary} />
              <Text style={[styles.routeText, { color: colors.onBrandTertiary }]}>{req.destination}</Text>
            </View>
            {req.shared && <Badge label="SHARED" tone="info" />}
            {req.cold_chain && <Badge label={t("logistics.coldChain")} tone="info" icon="snow" />}
          </View>
          <Text style={styles.title}>{req.title}</Text>
          <Text style={styles.meta}>
            {req.cargo_type}
            {req.weight_kg ? ` · ${req.weight_kg} kg` : ""}
            {req.pallets ? ` · ${req.pallets} pallet` : ""}
          </Text>
          {req.ready_date ? <Text style={styles.meta}>{req.ready_date}</Text> : null}
          {req.notes ? <Text style={styles.notes}>{req.notes}</Text> : null}
          <Text style={styles.creator}>
            {req.creator_name} · {new Date(req.created_at).toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.sectionCard} testID="shipping-participants">
          <Text style={styles.sectionTitle}>{t("logistics.participants")} ({req.participants.length})</Text>
          {req.participants.map((p) => (
            <View key={p.user_id} style={styles.participantRow}>
              <Ionicons name="person" size={14} color={colors.brandSecondary} />
              <Text style={styles.participantName}>{p.name}</Text>
            </View>
          ))}
          {canJoin && (
            <Btn title={t("logistics.join")} icon="people" testID="shipping-join-button" onPress={() => join.mutate()} loading={join.isPending} style={{ marginTop: spacing.md }} />
          )}
          {isParticipant && (
            <View style={[styles.joinedBadge, { marginTop: spacing.md }]}>
              <Ionicons name="checkmark-circle" size={15} color={colors.onSuccess} />
              <Text style={styles.joinedText}>{t("logistics.joined")}</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionCard} testID="shipping-quotes">
          <Text style={styles.sectionTitle}>{t("logistics.quotes")}</Text>
          {req.quotes.length === 0 ? (
            <Text style={styles.noQuotes}>{t("logistics.noQuotes")}</Text>
          ) : (
            req.quotes
              .slice()
              .sort((a, b) => a.price - b.price)
              .map((q) => (
                <View key={q.id} style={[styles.quoteRow, q.price === Math.min(...req.quotes.map((x) => x.price)) && { borderColor: colors.brandSecondary, borderWidth: 1.5 }]} testID={`shipping-quote-${q.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quoteCompany}>{q.company_name}</Text>
                    <Text style={styles.quoteMeta}>
                      {q.transit_days} {t("logistics.transitDays")}
                    </Text>
                    {q.message ? <Text style={styles.quoteMessage}>{q.message}</Text> : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
                    <Text style={styles.quotePrice}>€{q.price.toFixed(2)}</Text>
                    {req.carrier_id === q.company_id ? (
                      <Badge label={L("Scelto", "Selected")} tone="success" />
                    ) : req.creator_id === user?.id && !req.carrier_id ? (
                      <Btn title={L("Scegli", "Choose")} size="sm" testID={`shipping-select-quote-${q.id}`} loading={select.isPending} onPress={() => select.mutate(q.id)} />
                    ) : null}
                  </View>
                </View>
              ))
          )}
        </View>

        <PaymentCard req={req} isCreator={req.creator_id === user?.id} />
      </View>

      {user?.role === "logistics" && (
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Btn title={t("logistics.sendQuote")} icon="pricetag" size="lg" testID="shipping-send-quote-button" style={{ flex: 1 }} onPress={() => setQuoteSheet(true)} />
        </View>
      )}

      <Sheet visible={quoteSheet} onClose={() => setQuoteSheet(false)} title={t("logistics.sendQuote")}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t("common.price")}>
              <Input testID="quote-price-input" value={qPrice} onChangeText={setQPrice} keyboardType="decimal-pad" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={`${t("logistics.transitDays")}`}>
              <Input testID="quote-days-input" value={qDays} onChangeText={setQDays} keyboardType="number-pad" />
            </Field>
          </View>
        </View>
        <Field label={t("b2b.message")}>
          <Input testID="quote-message-input" value={qMessage} onChangeText={setQMessage} multiline />
        </Field>
        <Btn title={t("common.send")} testID="quote-submit" loading={sendQuote.isPending} onPress={() => {
          if (!qPrice || !qDays) return;
          sendQuote.mutate();
        }} />
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  payRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  payNote: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: spacing.sm, lineHeight: 17 },
  card: { padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, marginHorizontal: spacing.lg },
  routeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" },
  routeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, gap: 4 },
  routeText: { fontFamily: fonts.textBold, fontSize: 12, color: colors.onSurfaceTertiary },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
  meta: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: spacing.xs },
  notes: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginTop: spacing.md, lineHeight: 19 },
  creator: { fontFamily: fonts.textMedium, fontSize: 11, color: colors.brandPrimary, marginTop: spacing.md },
  sectionCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.lg },
  sectionTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.onSurface, marginBottom: spacing.md },
  participantRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  participantName: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  joinedBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  joinedText: { fontFamily: fonts.textBold, fontSize: 12, color: colors.success },
  noQuotes: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  quoteRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  quoteCompany: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  quoteMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  quoteMessage: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginTop: spacing.xs },
  quotePrice: { fontFamily: fonts.textBold, fontSize: 18, color: colors.brandPrimary },
  ctaBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary },
}));
