import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Img } from "@/src/components/Img";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Product, Purchase } from "@/src/types";

export default function ProducerDashboard() {
  const { colors } = useTheme();
  const { t, lang } = useT();
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
        onBack={() => router.back()}
        right={
          <Pressable testID="producer-new-product-button" onPress={() => router.push("/product-form")} accessibilityRole="button">
            <Ionicons name="add-circle" size={26} color={colors.brandPrimary} />
          </Pressable>
        }
      />
      <View style={{ flex: 1 }}>
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
          <Btn title={t("visibility.buy")} size="sm" testID="producer-boost-cta" onPress={() => router.push("/visibility")} />
        </View>

        <Text style={styles.sectionTitle}>{t("producer.products")}</Text>
        {products.isLoading ? (
          <CenterLoader />
        ) : products.isError ? (
          <ErrorBanner message={t("common.error")} onRetry={() => products.refetch()} />
        ) : (products.data ?? []).length === 0 ? (
          <EmptyState icon="leaf-outline" title={t("common.empty")} subtitle={t("productForm.title")} />
        ) : (
          (products.data ?? []).map((p) => (
            <Pressable
              key={p.id}
              testID={`producer-product-${p.id}`}
              onPress={() => router.push({ pathname: "/product-form", params: { id: p.id } })}
              style={({ pressed }) => [styles.productRow, pressed && { opacity: 0.85 }]}
            >
              <Img uri={p.image_url} style={styles.productImg} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.productName} numberOfLines={1}>{lang === "en" && p.name_en ? p.name_en : p.name}</Text>
                <Text style={styles.productMeta}>€{p.price.toFixed(2)} / {p.unit} · {t("product.stock")}: {p.stock}</Text>
                <View style={{ marginTop: spacing.sm, flexDirection: "row", gap: spacing.sm }}>
                  <Badge
                    label={t(p.status === "approved" ? "producer.approved" : p.status === "rejected" ? "producer.rejected" : "producer.pendingReview")}
                    tone={p.status === "approved" ? "success" : p.status === "rejected" ? "error" : "warning"}
                  />
                  {p.featured && <Badge label={t("home.featured")} tone="brand" icon="star" />}
                </View>
              </View>
              <Ionicons name="create-outline" size={18} color={colors.muted} />
            </Pressable>
          ))
        )}
      </View>
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
