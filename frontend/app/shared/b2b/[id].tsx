import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Btn, CenterLoader, ErrorBanner, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { B2BOffer, B2BMessage, Negotiation } from "@/src/types";

export default function B2BOfferDetail() {
  const { colors } = useTheme();
  const { t } = useT();
  const { id, negotiation } = useLocalSearchParams<{ id: string; negotiation?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const [message, setMessage] = useState("");
  const [agreementSheet, setAgreementSheet] = useState(false);
  const [aPrice, setAPrice] = useState("");
  const [aQty, setAQty] = useState("");
  const [aTerms, setATerms] = useState("");

  const offer = useQuery({ queryKey: ["b2b-offer", id], queryFn: () => api<B2BOffer>(`/b2b/offers/${id}`) });
  const negotiations = useQuery({ queryKey: ["negotiations"], queryFn: () => api<Negotiation[]>("/b2b/negotiations/mine") });

  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (negotiation) {
      setActiveId(negotiation);
      return;
    }
    const mine = (negotiations.data ?? []).filter((n) => n.offer_id === id);
    if (mine.length > 0 && !activeId) setActiveId(mine[0].id);
  }, [negotiation, negotiations.data, id]);

  const active = (negotiations.data ?? []).find((n) => n.id === activeId) ?? null;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["negotiations"] });

  const startNegotiation = useMutation({
    mutationFn: () =>
      api<Negotiation>(`/b2b/offers/${id}/negotiations`, {
        method: "POST",
        body: { message: `${user?.company_name || user?.name} — prima trattativa` },
      }),
    onSuccess: (data) => {
      setActiveId(data.id);
      invalidate();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const sendMessage = useMutation({
    mutationFn: (body: { text?: string; price?: number; qty?: number }) =>
      api<Negotiation>(`/b2b/negotiations/${activeId}/messages`, { method: "POST", body }),
    onSuccess: () => {
      setMessage("");
      invalidate();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const proposeAgreement = useMutation({
    mutationFn: () =>
      api<Negotiation>(`/b2b/negotiations/${activeId}/agreements`, {
        method: "POST",
        body: { price: parseFloat(aPrice.replace(",", ".")), qty: parseFloat(aQty.replace(",", ".")), terms: aTerms || null },
      }),
    onSuccess: () => {
      setAgreementSheet(false);
      setAPrice(""); setAQty(""); setATerms("");
      invalidate();
      toast.show(t("toast.sent"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const respond = useMutation({
    mutationFn: (action: "accept" | "reject") =>
      api<Negotiation>(`/b2b/negotiations/${activeId}/agreement`, { method: "PATCH", body: { action } }),
    onSuccess: () => {
      invalidate();
      toast.show(t("toast.saved"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (offer.isLoading) return <CenterLoader />;
  if (offer.isError || !offer.data)
    return (
      <Screen>
        <ScreenHeader title="" onBack={() => router.back()} />
        <ErrorBanner message={t("common.error")} onRetry={() => offer.refetch()} />
      </Screen>
    );

  const o = offer.data;
  const isParticipant = !!active;
  const lastProposal: B2BMessage | undefined = active?.messages.filter((m) => m.kind === "agreement" && m.agreement_status === "proposed").at(-1);
  const canRespond = !!lastProposal && lastProposal.sender_id !== user?.id;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("b2b.title")} onBack={() => router.back()} />
      <View style={{ flex: 1 }}>
        <View style={styles.offerBox} testID="b2b-offer-detail">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.offerTitle}>{o.title}</Text>
              <Text style={styles.offerProducer}>{o.company_name}</Text>
            </View>
            <Badge
              label={t(o.status === "open" ? "b2b.open" : o.status === "in_negotiation" ? "b2b.inNegotiation" : "b2b.closed")}
              tone={o.status === "open" ? "success" : o.status === "in_negotiation" ? "warning" : "neutral"}
            />
          </View>
          <Text style={styles.offerDesc}>{o.description}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>€{o.unit_price.toFixed(2)}</Text>
              <Text style={styles.statLabel}>/ {o.unit}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{o.moq}</Text>
              <Text style={styles.statLabel}>{o.unit} — MOQ</Text>
            </View>
            {o.origin_region ? (
              <View style={styles.statBox}>
                <Text style={styles.statValue} numberOfLines={1}>{o.origin_region}</Text>
                <Text style={styles.statLabel}>origine</Text>
              </View>
            ) : null}
          </View>
        </View>

        {active && (
          <View style={styles.negotiationHeader} testID="b2b-negotiation-view">
            <Ionicons name="people-outline" size={20} color={colors.brandSecondary} />
            <Text style={styles.negotiationTitle}>
              {t("b2b.negotiations")} — {user?.role === "producer" ? active.business_name : active.producer_name}
            </Text>
          </View>
        )}

        {active?.status === "agreed" && (
          <View style={styles.agreedBanner} testID="b2b-agreed-banner">
            <Ionicons name="ribbon" size={18} color={colors.onSuccess} />
            <Text style={styles.agreedText}>{t("b2b.agreed")}</Text>
          </View>
        )}

        {active && (
          <View style={{ flex: 1 }} testID="b2b-message-list">
            {active.messages.map((m) => (
              <MessageBubble key={m.id} message={m} mine={m.sender_id === user?.id} />
            ))}
          </View>
        )}

        {canRespond && lastProposal && (
          <View style={styles.respondBar} testID="b2b-respond-bar">
            <Text style={styles.respondText}>
              {t("b2b.proposedBy", { name: lastProposal.sender_name })}: €{lastProposal.price?.toFixed(2)}/{o.unit} × {lastProposal.qty} {o.unit}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Btn title={t("b2b.accept")} size="sm" variant="secondary" testID="b2b-accept-agreement" onPress={() => respond.mutate("accept")} />
              <Btn title={t("b2b.reject")} size="sm" variant="danger" testID="b2b-reject-agreement" onPress={() => respond.mutate("reject")} />
            </View>
          </View>
        )}
      </View>

      {!active && user?.role === "business" && o.status !== "closed" && (
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Btn
            title={t("b2b.startNegotiation")}
            icon="chatbubbles"
            size="lg"
            testID="b2b-start-negotiation-button"
            loading={startNegotiation.isPending}
            style={{ flex: 1 }}
            onPress={() => startNegotiation.mutate()}
          />
        </View>
      )}

      {isParticipant && active?.status !== "agreed" && (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
            <Pressable testID="b2b-propose-agreement-button" onPress={() => setAgreementSheet(true)} style={styles.proposalBtn} accessibilityRole="button">
              <Ionicons name="briefcase" size={19} color={colors.onBrandSecondary} />
            </Pressable>
            <Input
              testID="b2b-message-input"
              value={message}
              onChangeText={setMessage}
              placeholder={t("b2b.messagePlaceholder")}
              style={{ flex: 1 }}
            />
            <Pressable
              testID="b2b-send-message-button"
              onPress={() => message.trim() && sendMessage.mutate({ text: message.trim() })}
              style={[styles.proposalBtn, { backgroundColor: colors.brandPrimary }]}
              accessibilityRole="button"
            >
              <Ionicons name="send" size={18} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      <Sheet visible={agreementSheet} onClose={() => setAgreementSheet(false)} title={t("b2b.proposeAgreement")}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={`${t("common.price")} (€/${o.unit})`}>
              <Input testID="agreement-price-input" value={aPrice} onChangeText={setAPrice} keyboardType="decimal-pad" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={`${t("common.qty")} (${o.unit})`}>
              <Input testID="agreement-qty-input" value={aQty} onChangeText={setAQty} keyboardType="decimal-pad" />
            </Field>
          </View>
        </View>
        <Field label={t("b2b.terms")}>
          <Input testID="agreement-terms-input" value={aTerms} onChangeText={setATerms} multiline placeholder="Consegna, pagamento, imballo…" />
        </Field>
        <Btn title={t("b2b.proposeAgreement")} testID="agreement-submit" loading={proposeAgreement.isPending} onPress={() => {
          if (!aPrice || !aQty) return;
          proposeAgreement.mutate();
        }} />
      </Sheet>
    </Screen>
  );
}

function MessageBubble({ message, mine }: { message: B2BMessage; mine: boolean }) {
  const { colors } = useTheme();
  const { t } = useT();
  const styles = useStyles();

  if (message.kind === "system") {
    return (
      <Text style={styles.systemMsg} testID="b2b-system-message">
        {message.text}
      </Text>
    );
  }

  if (message.kind === "agreement") {
    return (
      <View style={[styles.agreementBubble, { alignSelf: "center" }]} testID="b2b-agreement-message">
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Ionicons name="briefcase" size={18} color={colors.brandSecondary} />
          <Text style={styles.agreementTitle}>{t("b2b.proposeAgreement")}</Text>
          <Badge
            label={message.agreement_status === "accepted" ? t("b2b.agreed") : message.agreement_status === "rejected" ? t("b2b.reject") : t("b2b.inNegotiation")}
            tone={message.agreement_status === "accepted" ? "success" : message.agreement_status === "rejected" ? "error" : "warning"}
          />
        </View>
        <Text style={styles.agreementTerms}>
          €{message.price?.toFixed(2)} × {message.qty}
        </Text>
        {message.text ? <Text style={styles.agreementTerms}>{message.text}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]} testID={`b2b-message-${message.id}`}>
      <Text style={[styles.bubbleText, mine && { color: colors.onBrandPrimary }]}>{message.text}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  offerBox: { padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, marginHorizontal: spacing.lg },
  offerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
  offerProducer: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.brandSecondary, marginTop: 2 },
  offerDesc: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: spacing.md, lineHeight: 19 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  statBox: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, padding: spacing.md },
  statValue: { fontFamily: fonts.textBold, fontSize: 14, color: colors.brandPrimary },
  statLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.muted },
  negotiationHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  negotiationTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, flex: 1 },
  agreedBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.success, marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  agreedText: { color: colors.onSuccess, fontFamily: fonts.textBold, fontSize: 13, flex: 1 },
  bubble: { maxWidth: "80%", borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginHorizontal: spacing.lg, marginVertical: spacing.xs },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider },
  bubbleText: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurface, lineHeight: 19 },
  agreementBubble: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.xs, marginHorizontal: spacing.lg, alignSelf: "stretch" },
  agreementTitle: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onBrandTertiary, flex: 1 },
  agreementTerms: { fontFamily: fonts.text, fontSize: 13, color: colors.onBrandTertiary, marginTop: spacing.xs },
  systemMsg: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, textAlign: "center", marginVertical: spacing.sm },
  respondBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.divider, padding: spacing.lg },
  respondText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurface },
  ctaBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary },
  proposalBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
}));
