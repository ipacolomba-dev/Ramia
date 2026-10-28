import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { LinkRow } from "@/src/components/blocks";
import { VerificationBanner } from "@/src/components/VerificationBanner";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Product, Purchase } from "@/src/types";

export default function ProducerDashboard() {
  const { colors } = useTheme();
  const { t, L } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const products = useQuery({
    queryKey: ["my-products"],
    queryFn: () => api<Product[]>("/products/mine"),
    enabled: !!user && user.role === "producer",
  });
  const purchases = useQuery({
    queryKey: ["purchases"],
    queryFn: () => api<Purchase[]>("/visibility/purchases/mine"),
    enabled: !!user && user.role === "producer",
  });

  if (!user || user.role !== "producer") {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <ScreenHeader title={t("producer.dashboard")} onBack={() => router.back()} />
        <EmptyState icon="leaf-outline" title={t("producer.dashboard")} subtitle={t("role.producer.desc")} />
      </Screen>
    );
  }

  const featuredUntil = user.featured_until ? new Date(user.featured_until) : null;
  const isActive = featuredUntil && featuredUntil > new Date();
  const pending = (products.data ?? []).filter((p) => p.status === "pending").length;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader
        title={t("producer.dashboard")}
        right={
          <Pressable testID="producer-new-product-button" onPress={() => router.push("/producer/catalogo/form")} accessibilityRole="button">
            <Ionicons name="add-circle" size={26} color={colors.brandPrimary} />
          </Pressable>
        }
      />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.statsRow} testID="producer-stats-row">
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{products.data?.length ?? 0}</Text>
            <Text style={styles.statLabel}>{t("producer.products")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{pending}</Text>
            <Text style={styles.statLabel}>{t("admin.pendingCount")}</Text>
          </View>
          <View style={[styles.statCard, isActive && { borderColor: colors.brandSecondary }]}>
            <Text style={[styles.statValue, isActive && { color: colors.brandSecondary, fontSize: 13, fontFamily: fonts.textBold }]}>
              {isActive ? featuredUntil!.toLocaleDateString(t("common.language") === "en" ? "en-GB" : "it-IT") : "—"}
            </Text>
            <Text style={styles.statLabel}>{t("producer.featuredUntil")}</Text>
          </View>
        </View>

        <View style={styles.boostCard} testID="producer-boost-card">
          <View style={{ flex: 1 }}>
            <Text style={styles.boostTitle}>{t("producer.boost")}</Text>
            <Text style={styles.boostSub}>{t("visibility.sub")}</Text>
          </View>
          <Btn title={t("visibility.buy")} size="sm" testID="producer-boost-cta" onPress={() => router.push("/producer/visibilita")} />
        </View>

        <View style={styles.actionsRow}>
          <Pressable testID="producer-import-catalog" onPress={() => router.push("/producer/catalogo/import")} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.88 }]} accessibilityRole="button">
            <View style={[styles.actionIcon, { backgroundColor: colors.brandPrimary }]}>
              <Ionicons name="document-attach" size={20} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.actionLabel}>{t("producer.importCatalog")}</Text>
          </Pressable>
          <Pressable testID="producer-labels-control" onPress={() => router.push("/producer/etichette")} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.88 }]} accessibilityRole="button">
            <View style={[styles.actionIcon, { backgroundColor: colors.brandSecondary }]}>
              <Ionicons name="document-text" size={20} color={colors.onBrandSecondary} />
            </View>
            <Text style={styles.actionLabel}>{t("producer.labelsControl")}</Text>
          </Pressable>
        </View>

        <View style={styles.actionsRow}>
          <Pressable testID="producer-company-profile" onPress={() => router.push("/producer/azienda")} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.88 }]} accessibilityRole="button">
            <View style={[styles.actionIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="business" size={20} color={colors.onBrandTertiary} />
            </View>
            <Text style={styles.actionLabel}>{t("profile.companyProfile")}</Text>
          </Pressable>
          <Pressable testID="producer-advisor" onPress={() => router.push("/producer/export")} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.88 }]} accessibilityRole="button">
            <View style={[styles.actionIcon, { backgroundColor: colors.brandPrimary }]}>
              <Ionicons name="earth" size={20} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.actionLabel}>{t("trade.title")}</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <VerificationBanner />
          <LinkRow icon="hand-left" label={L("Affari fuori piattaforma", "Off-platform deals")} testID="producer-link-declarations" onPress={() => router.push("/producer/dichiarazioni")} />
          <LinkRow icon="briefcase" label={L("Offerte B2B e richieste", "B2B offers & requests")} testID="producer-link-offers" onPress={() => router.push("/producer/offerte")} />
          <LinkRow icon="barcode" label={L("Lotti di produzione", "Production lots")} testID="producer-link-lots" onPress={() => router.push("/producer/lotti")} />
          <LinkRow icon="document-text" label={L("Etichette", "Labels")} testID="producer-link-labels" onPress={() => router.push("/producer/etichette")} />
          <LinkRow icon="shield-checkmark" label={L("Compliance: documenti e requisiti", "Compliance: documents & requirements")} testID="producer-link-compliance" onPress={() => router.push("/compliance/documenti")} />
          <LinkRow icon="cube" label={L("Spedizioni", "Shipments")} testID="producer-link-shipping" onPress={() => router.push("/producer/spedizioni")} />
          <LinkRow icon="cash" label={L("Incassi", "Earnings")} testID="producer-link-earnings" onPress={() => router.push("/producer/incassi")} />
          <LinkRow icon="rocket" label={t("profile.visibility")} testID="producer-link-visibility" onPress={() => router.push("/producer/visibilita")} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  statValue: { fontFamily: fonts.textBold, fontSize: 22, color: colors.brandPrimary },
  statLabel: { fontFamily: fonts.text, fontSize: 10, color: colors.muted, textAlign: "center", marginTop: 2 },
  boostCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  boostTitle: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onBrandTertiary },
  boostSub: { fontFamily: fonts.text, fontSize: 12, color: colors.onBrandTertiary, marginTop: 2 },
  actionsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  actionIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  productImg: { width: 64, height: 64, borderRadius: radius.sm },
  productName: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  productMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
}));
