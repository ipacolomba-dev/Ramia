import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { VerificationBanner } from "@/src/components/VerificationBanner";
import { useCart } from "@/src/cart";
import { Img } from "@/src/components/Img";
import { ProductCard } from "@/src/components/ProductCard";
import { Btn, CenterLoader, Chip, EmptyState, ErrorBanner, Input, Screen, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { CuratedPackage, Product } from "@/src/types";

const CATEGORIES = ["olio", "formaggi", "frutta_secca", "agrumi", "dolci", "pasta", "vino", "conserve"];

export default function MarketHome() {
  const { colors } = useTheme();
  const { t, lang } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const cart = useCart();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const toast = useToast();

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });
  const packages = useQuery({
    queryKey: ["packages"],
    queryFn: () => api<CuratedPackage[]>("/packages"),
  });

  const filtered = useMemo(() => {
    let list = products.data ?? [];
    if (category) list = list.filter((p) => p.category === category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.name_en ?? "").toLowerCase().includes(q) ||
          p.company_name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products.data, category, query]);

  const rows = useMemo(() => {
    const out: Product[][] = [];
    for (let i = 0; i < filtered.length; i += 2) out.push(filtered.slice(i, i + 2));
    return out;
  }, [filtered]);

  const hero = (products.data ?? []).find((p) => p.featured);

  if (products.isLoading) return <CenterLoader />;
  if (products.isError)
    return (
      <Screen style={{ justifyContent: "center" }}>
        <ErrorBanner message={t("common.error")} onRetry={() => products.refetch()} />
      </Screen>
    );

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  return (
    <Screen scroll contentStyle={{ paddingBottom: bottomChrome + spacing.xl }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]} testID="market-home">
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>{t("app.welcome").toUpperCase()}</Text>
          <Text style={styles.wordmark}>{t("app.name")}</Text>
        </View>
        <Pressable
          testID="cart-button"
          onPress={() => router.push("/buyer/checkout")}
          style={styles.cartBtn}
          accessibilityRole="button"
        >
          <Ionicons name="basket" size={22} color={colors.onSurface} />
          {cart.count > 0 && (
            <View style={styles.cartBadge} testID="cart-count-badge">
              <Text style={styles.cartBadgeText}>{cart.count}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.lg }} testID="market-pending-banner">
        <VerificationBanner />
      </View>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Input
          testID="market-search-input"
          placeholder={t("common.search")}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        <Pressable testID="market-ai-search" onPress={() => router.push("/buyer/ricerca-ai")} style={({ pressed }) => [styles.aiBanner, pressed && { opacity: 0.9 }]} accessibilityRole="button">
          <Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.aiBannerText}>{t("aiSearch.title")}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {hero && (
        <Pressable
          testID="hero-featured-card"
          onPress={() => router.push(`/shared/product/${hero.id}`)}
          style={({ pressed }) => [styles.hero, pressed && { opacity: 0.9 }]}
        >
          <Img uri={hero.image_url} style={{ width: "100%", height: "100%" }} />
          <View style={styles.heroScrim} />
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <Ionicons name="star" size={12} color={colors.onBrandPrimary} />
              <Text style={styles.heroBadgeText}>{t("home.featured")}</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {lang === "en" && hero.name_en ? hero.name_en : hero.name}
            </Text>
            <Text style={styles.heroProducer}>
              {hero.company_name} · €{hero.price.toFixed(2)} / {hero.unit}
            </Text>
          </View>
        </Pressable>
      )}

      {(packages.data?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("home.packages")}</Text>
          <Text style={styles.sectionSub}>{t("home.packagesSub")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}
          >
            {packages.data!.map((pkg) => (
              <Pressable
                key={pkg.id}
                testID={`package-card-${pkg.id}`}
                onPress={() => router.push(`/buyer/checkout?package=${pkg.id}`)}
                style={({ pressed }) => [styles.pkgCard, pressed && { opacity: 0.88 }]}
              >
                <Img uri={pkg.image_url} style={styles.pkgImage} />
                <View style={styles.pkgBody}>
                  <Text style={styles.pkgName} numberOfLines={1}>
                    {lang === "en" && pkg.name_en ? pkg.name_en : pkg.name}
                  </Text>
                  <Text style={styles.pkgItems}>
                    {pkg.items.length} {t("home.items")}
                  </Text>
                  <View style={styles.pkgFooter}>
                    <Text style={styles.pkgPrice}>€{pkg.price.toFixed(2)}</Text>
                    <View style={styles.pkgCta}>
                      <Text style={styles.pkgCtaText}>{t("home.buyPackage")}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.chipRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" }}
        >
          <Chip label={t("cat.all")} selected={category === null} onPress={() => setCategory(null)} testID="category-chip-all" />
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={t(`cat.${c}`)}
              selected={category === c}
              onPress={() => setCategory(c)}
              testID={`category-chip-${c}`}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("home.allProducts")}</Text>
        {rows.length === 0 ? (
          <EmptyState icon="leaf-outline" title={t("common.empty")} />
        ) : (
          rows.map((row, idx) => (
            <View key={idx} style={styles.gridRow}>
              {row.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onPress={() => router.push(`/shared/product/${p.id}`)}
                  onAdd={
                    p.stock > 0
                      ? () => {
                          cart.add({
                            product_id: p.id,
                            name: lang === "en" && p.name_en ? p.name_en : p.name,
                            price: p.price,
                            unit: p.unit,
                            image_url: p.image_url,
                            company_name: p.company_name,
                          });
                          toast.show(t("toast.addedToCart"));
                        }
                      : undefined
                  }
                />
              ))}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))
        )}
      </View>

      {!user && (
        <View style={styles.loginHint}>
          <Text style={styles.loginHintText}>{t("welcome.guestHint")}</Text>
          <Btn title={t("auth.register")} size="sm" onPress={() => router.push("/register")} testID="home-register-cta" />
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  pendingBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.warning, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  pendingText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 12, color: colors.onWarning, lineHeight: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  overline: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 2, color: colors.brandPrimary },
  wordmark: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  cartBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: { color: colors.onBrandPrimary, fontSize: 10, fontFamily: fonts.textBold },
  aiBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.sm },
  aiBannerText: { flex: 1, fontFamily: fonts.textBold, fontSize: 14, color: colors.onBrandSecondary },
  hero: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    height: 200,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  heroScrim: {
    ...({} as any),
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(44,34,30,0.35)",
  },
  heroContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },
  heroBadgeText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 11, marginLeft: 3 },
  heroTitle: { fontFamily: fonts.display, fontSize: 22, color: "#FFFFFF" },
  heroProducer: { fontFamily: fonts.textMedium, fontSize: 13, color: "rgba(255,255,255,0.9)", marginTop: 2 },
  section: { marginTop: spacing.xl },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, paddingHorizontal: spacing.lg },
  sectionSub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, paddingHorizontal: spacing.lg, marginTop: 2, marginBottom: spacing.md },
  pkgCard: {
    width: 240,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.divider,
  },
  pkgImage: { width: "100%", height: 110 },
  pkgBody: { padding: spacing.md },
  pkgName: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  pkgItems: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  pkgFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  pkgPrice: { fontFamily: fonts.textBold, fontSize: 16, color: colors.brandPrimary },
  pkgCta: { backgroundColor: colors.brandSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  pkgCtaText: { color: colors.onBrandSecondary, fontFamily: fonts.textBold, fontSize: 11 },
  chipRow: { marginTop: spacing.xl },
  gridRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  loginHint: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  loginHintText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.onBrandTertiary },
}));
