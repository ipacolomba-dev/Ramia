import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, CenterLoader, EmptyState, ErrorBanner, Screen } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { ShippingRequest, User } from "@/src/types";

interface Partner {
  id: string;
  company_name: string;
  region: string;
  fleet_info: string;
}

export default function LogisticsTab() {
  const { colors } = useTheme();
  const { t } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const requests = useQuery({
    queryKey: ["shipping-requests"],
    queryFn: () => api<ShippingRequest[]>("/logistics/requests"),
    enabled: !!user,
  });
  const partners = useQuery({
    queryKey: ["logistics-partners"],
    queryFn: () => api<Partner[]>("/logistics/partners"),
    enabled: !!user,
  });

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const canPropose = user?.role === "producer" || user?.role === "business";

  if (!user) {
    return (
      <Screen style={{ justifyContent: "center" }}>
        <EmptyState icon="cube-outline" title={t("logistics.title")} subtitle={t("logistics.sub")} />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={{ paddingBottom: bottomChrome + spacing.xl }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]} testID="logistics-tab">
        <Text style={styles.title}>{t("logistics.title")}</Text>
        <Text style={styles.subtitle}>{t("logistics.sub")}</Text>
      </View>

      {partners.isLoading ? null : (partners.data ?? []).length > 0 && (
        <View style={styles.partnersSection}>
          <Text style={styles.sectionTitle}>{t("logistics.partners")}</Text>
          <Text style={styles.sectionSub}>{t("logistics.partnersSub")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}
          >
            {partners.data!.map((p) => (
              <View key={p.id} style={styles.partnerCard} testID={`partner-${p.id}`}>
                <View style={styles.partnerIcon}>
                  <Ionicons name="car" size={20} color={colors.onBrandSecondary} />
                </View>
                <Text style={styles.partnerName} numberOfLines={1}>{p.company_name}</Text>
                <Text style={styles.partnerRegion} numberOfLines={1}>{p.region}</Text>
                <Text style={styles.partnerFleet} numberOfLines={2}>{p.fleet_info}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.requestsSection}>
        <Text style={styles.sectionTitle}>{t("logistics.requests")}</Text>
        {requests.isLoading ? (
          <CenterLoader />
        ) : requests.isError ? (
          <ErrorBanner message={t("common.error")} onRetry={() => requests.refetch()} />
        ) : (requests.data ?? []).length === 0 ? (
          <EmptyState icon="cube-outline" title={t("logistics.noRequests")} subtitle={t("logistics.sub")} />
        ) : (
          (requests.data ?? []).map((req) => (
            <Pressable
              key={req.id}
              testID={`shipping-request-${req.id}`}
              onPress={() => router.push(`/shipping/${req.id}`)}
              style={({ pressed }) => [styles.reqCard, pressed && { opacity: 0.88 }]}
            >
              <View style={styles.routeRow}>
                <View style={styles.routeBadge}>
                  <Ionicons name="arrow-up" size={12} color={colors.onBrandSecondary} />
                  <Text style={styles.routeText} numberOfLines={1}>{req.origin}</Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color={colors.muted} />
                <View style={styles.routeBadge}>
                  <Ionicons name="arrow-down" size={12} color={colors.onBrandPrimary} />
                  <Text style={styles.routeText} numberOfLines={1}>{req.destination}</Text>
                </View>
              </View>
              <Text style={styles.reqTitle} numberOfLines={1}>{req.title}</Text>
              <Text style={styles.reqMeta}>
                {req.cargo_type}
                {req.weight_kg ? ` · ${req.weight_kg} kg` : ""}
                {req.pallets ? ` · ${req.pallets} pallet` : ""}
              </Text>
              <View style={styles.reqFooter}>
                <View style={styles.fillRow}>
                  <Ionicons name="people" size={13} color={colors.brandSecondary} />
                  <Text style={styles.fillText}>
                    {t("logistics.participants")}: {req.participants.length}
                  </Text>
                </View>
                <View style={styles.fillRow}>
                  <Ionicons name="pricetag" size={13} color={colors.brandPrimary} />
                  <Text style={styles.fillText}>
                    {t("logistics.quotes")}: {req.quotes.length}
                  </Text>
                </View>
                {req.shared && <Badge label={t("logistics.shareHint").split(":")[0]} tone="info" />}
              </View>
            </Pressable>
          ))
        )}
      </View>

      {canPropose && (
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <Pressable
            testID="shipping-new-fab"
            onPress={() => router.push("/shipping-form")}
            style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
          >
            <Ionicons name="add-circle" size={22} color={colors.onBrandPrimary} />
            <Text style={styles.fabText}>{t("logistics.new")}</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  subtitle: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginTop: 2 },
  partnersSection: { marginTop: spacing.lg },
  sectionTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, paddingHorizontal: spacing.lg },
  sectionSub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, paddingHorizontal: spacing.lg, marginTop: 2, marginBottom: spacing.md },
  partnerCard: {
    width: 180,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
  },
  partnerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  partnerName: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  partnerRegion: { fontFamily: fonts.text, fontSize: 11, color: colors.brandPrimary, marginTop: 2 },
  partnerFleet: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginTop: spacing.xs, lineHeight: 15 },
  requestsSection: { marginTop: spacing.xl },
  reqCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  routeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  routeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    gap: 4,
    maxWidth: "45%",
  },
  routeText: { fontFamily: fonts.textBold, fontSize: 11, color: colors.onSurfaceTertiary },
  reqTitle: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  reqMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  reqFooter: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, flexWrap: "wrap" },
  fillRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  fillText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  fabText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 15 },
}));
