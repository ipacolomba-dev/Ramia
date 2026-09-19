import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Purchase, VisibilityPlan } from "@/src/types";

export default function Visibility() {
  const { colors } = useTheme();
  const { t, lang } = useT();
  const { user, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const [selected, setSelected] = useState<VisibilityPlan | null>(null);

  const plans = useQuery({
    queryKey: ["visibility-plans"],
    queryFn: () => api<VisibilityPlan[]>("/visibility/plans"),
    enabled: !!user,
  });
  const purchases = useQuery({
    queryKey: ["purchases"],
    queryFn: () => api<Purchase[]>("/visibility/purchases/mine"),
    enabled: !!user && user.role === "producer",
  });

  const purchase = useMutation({
    mutationFn: (plan: VisibilityPlan) => api<Purchase>("/visibility/purchase", { method: "POST", body: { plan_id: plan.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["my-products"] });
      setSelected(null);
      toast.show(t("visibility.purchased"));
      refresh();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (!user || user.role !== "producer") {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <ScreenHeader title={t("visibility.title")} onBack={() => router.back()} />
        <EmptyState icon="rocket-outline" title={t("visibility.title")} subtitle={t("role.producer.desc")} />
      </Screen>
    );
  }

  const featuredUntil = user.featured_until ? new Date(user.featured_until) : null;
  const isActive = featuredUntil && featuredUntil > new Date();

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("visibility.title")} onBack={() => router.back()} />
      <View style={{ flex: 1 }}>
        <View style={styles.statusCard} testID="visibility-status-card">
          <Ionicons name={isActive ? "rocket" : "rocket-outline"} size={22} color={isActive ? colors.brandSecondary : colors.muted} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.statusText}>
              {isActive ? t("visibility.active", { date: featuredUntil!.toLocaleDateString(t("common.language") === "en" ? "en-GB" : "it-IT") }) : t("producer.noFeatured")}
            </Text>
          </View>
        </View>
        <Text style={styles.sub}>{t("visibility.sub")}</Text>

        {plans.isLoading ? (
          <CenterLoader />
        ) : plans.isError ? (
          <ErrorBanner message={t("common.error")} onRetry={() => plans.refetch()} />
        ) : (
          <View style={{ padding: spacing.lg }}>
            {plans.data!.map((plan) => (
              <View key={plan.id} style={styles.planCard} testID={`visibility-plan-${plan.id}`}>
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{t("common.language") === "en" ? plan.name_en : plan.name}</Text>
                  <Text style={styles.planPrice}>€{plan.price.toFixed(2)}</Text>
                </View>
                <Text style={styles.planPerDay}>{t("visibility.perDay", { price: (plan.price / plan.days).toFixed(2) })}</Text>
                {(lang === "en" ? plan.perks_en : plan.perks_it).map((perk, i) => (
                  <View key={i} style={styles.perkRow}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.brandSecondary} />
                    <Text style={styles.perkText}>{perk}</Text>
                  </View>
                ))}
                <Btn
                  title={t("visibility.buy")}
                  testID={`visibility-buy-${plan.id}`}
                  onPress={() => setSelected(plan)}
                  style={{ marginTop: spacing.md }}
                />
              </View>
            ))}
          </View>
        )}
      </View>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected ? (lang === "en" ? selected.name_en : selected.name) : ""}>
        {selected && (
          <View>
            <Text style={styles.sheetPrice}>€{selected.price.toFixed(2)} — {t("visibility.simulatedNote")}</Text>
            <Btn
              title={t("checkout.pay")}
              size="lg"
              icon="card"
              testID="visibility-confirm-button"
              loading={purchase.isPending}
              onPress={() => purchase.mutate(selected)}
            />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
  },
  statusText: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  sub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, paddingHorizontal: spacing.lg, marginTop: spacing.md, lineHeight: 19 },
  planCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { fontFamily: fonts.display, fontSize: 19, color: colors.onSurface },
  planPrice: { fontFamily: fonts.textBold, fontSize: 22, color: colors.brandPrimary },
  planPerDay: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginBottom: spacing.md },
  perkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  perkText: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, flex: 1 },
  sheetPrice: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface, marginBottom: spacing.md },
}));
