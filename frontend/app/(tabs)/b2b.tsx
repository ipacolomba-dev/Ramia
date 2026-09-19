import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import {
  Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Screen, Sheet, useToast,
} from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { B2BOffer, LabelRequest, Negotiation, User } from "@/src/types";

export default function B2BTab() {
  const { colors } = useTheme();
  const { t } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const [segment, setSegment] = useState<"offers" | "labels">("offers");

  const isProducer = user?.role === "producer";
  const isBusiness = user?.role === "business" || user?.role === "admin";
  const isCollaborator = user?.role === "collaborator";
  const canSeeOffers = isProducer || isBusiness || isCollaborator || user?.role === "logistics";

  const offers = useQuery({
    queryKey: ["b2b-offers", isProducer],
    queryFn: () => api<B2BOffer[]>(`/b2b/offers${isProducer ? "?mine=1" : ""}`),
    enabled: !!user && canSeeOffers && segment === "offers",
  });
  const negotiations = useQuery({
    queryKey: ["negotiations"],
    queryFn: () => api<Negotiation[]>("/b2b/negotiations/mine"),
    enabled: !!user && (isProducer || isBusiness) && segment === "offers",
  });
  const labels = useQuery({
    queryKey: ["label-requests", user?.role, user?.id],
    queryFn: () => api<LabelRequest[]>(`/labels/requests${isProducer ? "?mine=1" : ""}`),
    enabled: !!user && (isProducer || isCollaborator || user.role === "admin") && segment === "labels",
  });

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  if (!user) {
    return (
      <Screen style={{ justifyContent: "center" }}>
        <EmptyState icon="business-outline" title={t("b2b.title")} subtitle={t("b2b.consumerHint")} />
        <Btn title={t("auth.login")} onPress={() => router.push("/auth/login")} testID="b2b-login-cta" style={{ marginHorizontal: spacing.xl }} />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={{ paddingBottom: bottomChrome + spacing.xl }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]} testID="b2b-tab">
        <Text style={styles.title}>{t("b2b.title")}</Text>
        <View style={styles.segment}>
          {(["offers", "labels"] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSegment(s)}
              testID={`b2b-segment-${s}`}
              style={[styles.segmentBtn, segment === s && { backgroundColor: colors.brandPrimary }]}
              accessibilityRole="button"
            >
              <Text style={[styles.segmentText, segment === s && { color: colors.onBrandPrimary }]}>
                {t(s === "offers" ? "b2b.offers" : "b2b.labels")}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {segment === "offers" && (
        <View>
          {isProducer && (
            <View style={styles.topActions}>
              <Btn
                title={t("b2b.newOffer")}
                icon="add"
                testID="b2b-new-offer-button"
                onPress={() => router.push("/b2b-offer-form")}
              />
            </View>
          )}

          {isProducer && (
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.sectionTitle}>{t("b2b.negotiations")}</Text>
              {(negotiations.data ?? []).length === 0 ? (
                <Text style={styles.muted}>{t("b2b.noNegotiations")}</Text>
              ) : (
                negotiations.data!.map((n) => (
                  <Pressable
                    key={n.id}
                    testID={`negotiation-item-${n.id}`}
                    onPress={() => router.push({ pathname: `/b2b/${n.offer_id}`, params: { negotiation: n.id } })}
                    style={styles.negotiationRow}
                  >
                    <Ionicons name="chatbubbles-outline" size={20} color={colors.brandPrimary} />
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Text style={styles.negotiationTitle} numberOfLines={1}>{n.offer_title}</Text>
                      <Text style={styles.muted}>{n.business_name}</Text>
                    </View>
                    <Badge label={n.status === "agreed" ? t("b2b.agreed") : t("b2b.inNegotiation")} tone={n.status === "agreed" ? "success" : "warning"} />
                  </Pressable>
                ))
              )}
            </View>
          )}

          {isBusiness && (negotiations.data ?? []).length > 0 && (
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.sectionTitle}>{t("b2b.negotiations")}</Text>
              {negotiations.data!.map((n) => (
                <Pressable
                  key={n.id}
                  testID={`negotiation-item-${n.id}`}
                  onPress={() => router.push({ pathname: `/b2b/${n.offer_id}`, params: { negotiation: n.id } })}
                  style={styles.negotiationRow}
                >
                  <Ionicons name="chatbubbles-outline" size={20} color={colors.brandPrimary} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.negotiationTitle} numberOfLines={1}>{n.offer_title}</Text>
                    <Text style={styles.muted}>{n.producer_name}</Text>
                  </View>
                  <Badge label={n.status === "agreed" ? t("b2b.agreed") : t("b2b.inNegotiation")} tone={n.status === "agreed" ? "success" : "warning"} />
                </Pressable>
              ))}
            </View>
          )}

          {offers.isLoading ? (
            <CenterLoader />
          ) : offers.isError ? (
            <ErrorBanner message={t("common.error")} onRetry={() => offers.refetch()} />
          ) : (offers.data ?? []).length === 0 ? (
            <EmptyState icon="file-tray-outline" title={t("b2b.noOffers")} />
          ) : (
            <View style={{ paddingHorizontal: spacing.lg }}>
              {offers.data!.map((offer) => (
                <OfferCard key={offer.id} offer={offer} onPress={() => router.push(`/b2b/${offer.id}`)} />
              ))}
            </View>
          )}
        </View>
      )}

      {segment === "labels" && (
        <View>
          {isProducer && (
            <View style={styles.topActions}>
              <Btn title={t("label.new")} icon="add" testID="label-new-button" onPress={() => router.push("/label-form")} />
            </View>
          )}
          {isProducer || isCollaborator || user.role === "admin" ? (
            labels.isLoading ? (
              <CenterLoader />
            ) : labels.isError ? (
              <ErrorBanner message={t("common.error")} onRetry={() => labels.refetch()} />
            ) : (labels.data ?? []).length === 0 ? (
              <EmptyState icon="document-text-outline" title={t("label.noRequests")} subtitle={t("label.sub")} />
            ) : (
              <View style={{ paddingHorizontal: spacing.lg }}>
                {labels.data!.map((req) => (
                  <Pressable
                    key={req.id}
                    testID={`label-request-${req.id}`}
                    onPress={() => router.push(`/label/${req.id}`)}
                    style={styles.labelCard}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.labelProduct}>{req.product_name}</Text>
                      <Text style={styles.muted}>
                        {req.target_market} · {req.producer_name}
                      </Text>
                      <Text style={styles.needsPreview} numberOfLines={2}>{req.needs}</Text>
                    </View>
                    <Badge
                      label={t(req.status === "open" ? "label.open" : req.status === "in_progress" ? "label.inProgress" : "label.done")}
                      tone={req.status === "open" ? "warning" : req.status === "in_progress" ? "info" : "success"}
                    />
                  </Pressable>
                ))}
              </View>
            )
          ) : (
            <EmptyState icon="document-text-outline" title={t("label.noRequests")} />
          )}
        </View>
      )}
    </Screen>
  );
}

export function OfferCard({ offer, onPress }: { offer: B2BOffer; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useT();
  const styles = useStyles();
  return (
    <Pressable testID={`b2b-offer-${offer.id}`} onPress={onPress} style={({ pressed }) => [styles.offerCard, pressed && { opacity: 0.88 }]}>
      <View style={styles.offerTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
          <Text style={styles.muted}>{offer.company_name}</Text>
        </View>
        <Badge
          label={t(offer.status === "open" ? "b2b.open" : offer.status === "in_negotiation" ? "b2b.inNegotiation" : "b2b.closed")}
          tone={offer.status === "open" ? "success" : offer.status === "in_negotiation" ? "warning" : "neutral"}
        />
      </View>
      <Text style={styles.offerDesc} numberOfLines={2}>{offer.description}</Text>
      <View style={styles.offerStats}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>€{offer.unit_price.toFixed(2)}</Text>
          <Text style={styles.statLabel}>/ {offer.unit}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{offer.moq}</Text>
          <Text style={styles.statLabel}>{offer.unit} — {t("b2b.moq").toLowerCase()}</Text>
        </View>
        {offer.origin_region ? (
          <View style={styles.statBox}>
            <Text style={styles.statValue} numberOfLines={1}>{offer.origin_region}</Text>
            <Text style={styles.statLabel}>origine</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    padding: 3,
    marginTop: spacing.md,
  },
  segmentBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: "center" },
  segmentText: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurfaceTertiary },
  topActions: { paddingHorizontal: spacing.lg },
  sectionTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  muted: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  negotiationRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  negotiationTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  labelCard: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
    gap: spacing.md,
  },
  labelProduct: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  needsPreview: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: spacing.xs },
  offerCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  offerTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  offerTitle: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  offerDesc: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 18 },
  offerStats: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  statBox: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, padding: spacing.md },
  statValue: { fontFamily: fonts.textBold, fontSize: 14, color: colors.brandPrimary },
  statLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.muted },
}));
