import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Img } from "@/src/components/Img";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { LabelRequest } from "@/src/types";

export default function LabelRequestDetail() {
  const { colors } = useTheme();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const [offerSheet, setOfferSheet] = useState(false);
  const [oPrice, setOPrice] = useState("");
  const [oDays, setODays] = useState("");
  const [oMessage, setOMessage] = useState("");

  const request = useQuery({ queryKey: ["label-request", id], queryFn: () => api<LabelRequest>(`/labels/requests/${id}`) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["label-requests"] });

  const sendOffer = useMutation({
    mutationFn: () =>
      api<LabelRequest>(`/labels/requests/${id}/offers`, {
        method: "POST",
        body: { price: parseFloat(oPrice.replace(",", ".")), days: parseInt(oDays, 10), message: oMessage || null },
      }),
    onSuccess: () => {
      setOfferSheet(false);
      setOPrice(""); setODays(""); setOMessage("");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["label-request", id] });
      toast.show(t("toast.sent"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const acceptOffer = useMutation({
    mutationFn: (collaboratorId: string) =>
      api<LabelRequest>(`/labels/requests/${id}/accept`, { method: "POST", body: { collaborator_id: collaboratorId } }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["label-request", id] });
      toast.show(t("toast.saved"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const markDone = useMutation({
    mutationFn: () => api(`/labels/requests/${id}/status`, { method: "PATCH", body: { status: "done" } }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["label-request", id] });
      toast.show(t("toast.saved"));
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
  const isOwner = user?.id === req.producer_id;
  const isAssignedCollaborator = user?.role === "collaborator" && user?.id === req.assigned_collaborator_id;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("label.title")} onBack={() => router.back()} />
      <View style={{ flex: 1 }}>
        <View style={styles.card} testID="label-request-detail">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
            <Img uri={req.image_url} style={styles.cardImg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{req.product_name}</Text>
              <Text style={styles.producer}>{req.producer_name}</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" }}>
                <Badge label={req.target_market} tone="brand" icon="globe" />
                <Badge
                  label={t(req.status === "open" ? "label.open" : req.status === "in_progress" ? "label.inProgress" : "label.done")}
                  tone={req.status === "open" ? "warning" : req.status === "in_progress" ? "info" : "success"}
                />
              </View>
            </View>
          </View>
          <Text style={styles.needs}>{req.needs}</Text>
          {req.assigned_collaborator_name && (
            <View style={styles.assignedRow}>
              <Ionicons name="person-check" size={15} color={colors.onBrandSecondary} />
              <Text style={styles.assignedText}>
                {t("label.assigned")}: {req.assigned_collaborator_name}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>{t("label.offers")}</Text>
        {req.offers.length === 0 ? (
          <EmptyState icon="document-text-outline" title={t("label.noOffers")} />
        ) : (
          req.offers.map((o) => (
            <View key={o.id} style={styles.offerRow} testID={`label-offer-${o.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.offerName}>{o.collaborator_name}</Text>
                {o.specialty ? <Text style={styles.offerSpecialty}>{o.specialty}</Text> : null}
                {o.message ? <Text style={styles.offerMessage}>{o.message}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
                <Text style={styles.offerPrice}>€{o.price.toFixed(2)}</Text>
                <Text style={styles.offerDays}>
                  {o.days} {t("label.days")}
                </Text>
                {o.status === "accepted" ? (
                  <Badge label={t("label.accept")} tone="success" />
                ) : isOwner && req.status === "open" ? (
                  <Btn title={t("label.accept")} size="sm" variant="secondary" testID={`label-accept-${o.id}`} onPress={() => acceptOffer.mutate(o.collaborator_id)} />
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      {user?.role === "collaborator" && req.status === "open" && (
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Btn title={t("label.sendOffer")} icon="document" size="lg" testID="label-send-offer-button" style={{ flex: 1 }} onPress={() => setOfferSheet(true)} />
        </View>
      )}
      {(isAssignedCollaborator || isOwner) && req.status === "in_progress" && (
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Btn title={t("label.markDone")} variant="secondary" size="lg" testID="label-mark-done-button" style={{ flex: 1 }} onPress={() => markDone.mutate()} />
        </View>
      )}

      <Sheet visible={offerSheet} onClose={() => setOfferSheet(false)} title={t("label.sendOffer")}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t("common.price")}>
              <Input testID="label-offer-price-input" value={oPrice} onChangeText={setOPrice} keyboardType="decimal-pad" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={`${t("label.days")}`}>
              <Input testID="label-offer-days-input" value={oDays} onChangeText={setODays} keyboardType="number-pad" />
            </Field>
          </View>
        </View>
        <Field label={t("b2b.message")}>
          <Input testID="label-offer-message-input" value={oMessage} onChangeText={setOMessage} multiline />
        </Field>
        <Btn title={t("common.send")} testID="label-offer-submit" loading={sendOffer.isPending} onPress={() => {
          if (!oPrice || !oDays) return;
          sendOffer.mutate();
        }} />
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  card: { padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, marginHorizontal: spacing.lg },
  cardImg: { width: 72, height: 72, borderRadius: radius.sm },
  productName: { fontFamily: fonts.display, fontSize: 19, color: colors.onSurface },
  producer: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandSecondary, marginTop: 2 },
  needs: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 20, marginTop: spacing.md },
  assignedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md },
  assignedText: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onBrandTertiary, flex: 1 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.onSurface, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  offerRow: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, padding: spacing.lg, marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.md },
  offerName: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  offerSpecialty: { fontFamily: fonts.text, fontSize: 12, color: colors.brandPrimary, marginTop: 2 },
  offerMessage: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  offerPrice: { fontFamily: fonts.textBold, fontSize: 17, color: colors.brandPrimary },
  offerDays: { fontFamily: fonts.text, fontSize: 11, color: colors.muted },
  ctaBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary },
}));
