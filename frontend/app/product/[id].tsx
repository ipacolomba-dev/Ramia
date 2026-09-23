import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useCart } from "@/src/cart";
import { Img } from "@/src/components/Img";
import { Badge, Btn, CenterLoader, ErrorBanner, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Product } from "@/src/types";

export default function ProductDetail() {
  const { colors } = useTheme();
  const { t, lang } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const [qty, setQty] = useState(1);

  const product = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<Product>(`/products/${id}`),
  });

  if (product.isLoading) return <CenterLoader />;
  if (product.isError || !product.data)
    return (
      <Screen>
        <ScreenHeader title="" onBack={() => router.back()} />
        <ErrorBanner message={t("common.error")} onRetry={() => product.refetch()} />
      </Screen>
    );

  const p = product.data;
  const name = lang === "en" && p.name_en ? p.name_en : p.name;
  const description = lang === "en" && p.description_en ? p.description_en : p.description;
  const isOwner = user?.role === "producer" && p.producer_id === user.id;

  const addToCart = () => {
    cart.add({ product_id: p.id, name, price: p.price, unit: p.unit, image_url: p.image_url, company_name: p.company_name }, qty);
    toast.show(t("toast.addedToCart"));
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader
        title=""
        onBack={() => router.back()}
        right={
          isOwner ? (
            <Pressable testID="product-edit-button" onPress={() => router.push({ pathname: "/product-form", params: { id: p.id } })} accessibilityRole="button">
              <Ionicons name="create-outline" size={22} color={colors.brandPrimary} />
            </Pressable>
          ) : null
        }
      />
      <View style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Img uri={p.image_url} style={styles.hero} />
        <View style={styles.body}>
          <View style={styles.badgeRow}>
            <Badge label={t(`cat.${p.category}`)} tone="neutral" />
            {p.featured && <Badge label={t("home.featured")} tone="brand" icon="star" />}
            {p.status !== "approved" && (
              <Badge label={t("producer.pendingReview")} tone="warning" />
            )}
          </View>
          <Text style={styles.name}>{name}</Text>
          <Pressable testID="product-producer-link" onPress={() => router.push(`/producer/${p.producer_id}`)} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <Text style={styles.producer}>
              {p.company_name}
              {p.origin_region ? ` · ${p.origin_region}` : ""}
              {"  "}
              <Text style={{ color: colors.brandPrimary }}>{t("producerPage.viewProducer")} ›</Text>
            </Text>
          </Pressable>
          <View style={styles.priceRow}>
            <Text style={styles.price}>€{p.price.toFixed(2)}</Text>
            <Text style={styles.unit}>/ {p.unit}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.stock} testID="product-stock-text">
              {t("product.stock")}: {p.stock}
            </Text>
          </View>
          <Text style={styles.description}>{description}</Text>

          {(user?.role === "business" || user?.role === "producer" || user?.role === "admin") && p.price_wholesale ? (
            <View style={styles.wholesaleCard} testID="product-wholesale-card">
              <View style={styles.wholesaleHead}>
                <Ionicons name="briefcase" size={15} color={colors.onBrandSecondary} />
                <Text style={styles.wholesaleTitle}>{t("wholesale.wholesale")}</Text>
              </View>
              <View style={styles.wholesaleRow}>
                <Text style={styles.wholesalePrice}>€{p.price_wholesale.toFixed(2)}</Text>
                <Text style={styles.unit}>/ {p.unit_wholesale || p.unit}</Text>
                {p.moq ? <Text style={styles.moq}>{t("wholesale.moq")}: {p.moq}</Text> : null}
              </View>
              <View style={styles.packGrid}>
                {p.pack_per_carton ? <PackCell label={t("wholesale.packPerCarton")} value={p.pack_per_carton} /> : null}
                {p.cartons_per_layer ? <PackCell label={t("wholesale.cartonsPerLayer")} value={p.cartons_per_layer} /> : null}
                {p.cartons_per_pallet ? <PackCell label={t("wholesale.cartonsPerPallet")} value={p.cartons_per_pallet} /> : null}
              </View>
              {user?.role === "business" && (
                <Btn title={t("wholesale.negotiate")} icon="chatbubbles" size="sm" variant="secondary" testID="product-negotiate-button" onPress={() => router.push("/(tabs)/b2b")} style={{ marginTop: spacing.md }} />
              )}
            </View>
          ) : null}
        </View>
        </ScrollView>
      </View>

      {!isOwner && (
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]} testID="product-cta-bar">
          <View style={styles.stepper}>
            <Pressable testID="product-qty-minus" onPress={() => setQty(Math.max(1, qty - 1))} style={styles.stepBtn} accessibilityRole="button">
              <Ionicons name="remove" size={18} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.stepValue} testID="product-qty-value">{qty}</Text>
            <Pressable testID="product-qty-plus" onPress={() => setQty(qty + 1)} style={styles.stepBtn} accessibilityRole="button">
              <Ionicons name="add" size={18} color={colors.onSurface} />
            </Pressable>
          </View>
          <Btn
            title={t("product.addToCart")}
            icon="basket"
            testID="product-add-to-cart-button"
            style={{ flex: 1 }}
            onPress={addToCart}
          />
          <Btn
            title={t("product.buyNow")}
            variant="secondary"
            testID="product-buy-now-button"
            style={{ flex: 1 }}
            onPress={() => {
              addToCart();
              router.push("/checkout");
            }}
          />
        </View>
      )}
    </Screen>
  );
}

function PackCell({ label, value }: { label: string; value: number }) {
  const styles = useStyles();
  return (
    <View style={styles.packCell}>
      <Text style={styles.packValue}>{value}</Text>
      <Text style={styles.packLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  hero: { width: "100%", height: 280 },
  body: { padding: spacing.xl },
  wholesaleCard: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
  wholesaleHead: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: spacing.xs, backgroundColor: colors.brandSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3, marginBottom: spacing.md },
  wholesaleTitle: { fontFamily: fonts.textBold, fontSize: 11, color: colors.onBrandSecondary },
  wholesaleRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexWrap: "wrap" },
  wholesalePrice: { fontFamily: fonts.textBold, fontSize: 22, color: colors.brandSecondary },
  moq: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary, marginLeft: spacing.sm },
  packGrid: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  packCell: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.md, alignItems: "center", minWidth: 90, flexGrow: 1 },
  packValue: { fontFamily: fonts.textBold, fontSize: 18, color: colors.onSurface },
  packLabel: { fontFamily: fonts.text, fontSize: 10, color: colors.muted, textAlign: "center", marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" },
  name: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  producer: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.brandSecondary, marginTop: spacing.xs },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: spacing.md },
  price: { fontFamily: fonts.textBold, fontSize: 26, color: colors.brandPrimary },
  unit: { fontFamily: fonts.text, fontSize: 14, color: colors.muted, marginLeft: spacing.xs },
  stock: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  description: { fontFamily: fonts.text, fontSize: 15, color: colors.onSurfaceSecondary, lineHeight: 22, marginTop: spacing.lg },
  ctaBar: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
  },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md },
  stepBtn: { width: 38, height: 48, alignItems: "center", justifyContent: "center" },
  stepValue: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface, minWidth: 24, textAlign: "center" },
}));
