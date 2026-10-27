import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Img } from "@/src/components/Img";
import { Card, Muted } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Product } from "@/src/types";

export default function Catalog() {
  const { colors } = useTheme();
  const { t, L, lang } = useT();
  const router = useRouter();
  const styles = useStyles();
  const products = useQuery({ queryKey: ["my-products"], queryFn: () => api<Product[]>("/products/mine") });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Catalogo", "Catalog")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="producer-catalog"
        refreshControl={<RefreshControl refreshing={products.isRefetching} onRefresh={() => products.refetch()} />}>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
          <Btn title={L("Nuovo prodotto", "New product")} icon="add" size="sm" testID="catalog-new" onPress={() => router.push("/producer/catalogo/form")} style={{ flex: 1 }} />
          <Btn title={L("Importa PDF", "Import PDF")} icon="document-attach" size="sm" variant="outline" testID="catalog-import" onPress={() => router.push("/producer/catalogo/import")} style={{ flex: 1 }} />
        </View>
        {products.isLoading ? <CenterLoader /> : products.isError ? (
          <ErrorBanner message={t("common.error")} onRetry={() => products.refetch()} />
        ) : (products.data ?? []).length === 0 ? (
          <EmptyState icon="leaf-outline" title={L("Nessun prodotto", "No products yet")} subtitle={L("Aggiungi il primo prodotto o importa il catalogo PDF", "Add your first product or import a PDF catalog")} />
        ) : (
          products.data!.map((p) => (
            <Card key={p.id} testID={`catalog-item-${p.id}`} onPress={() => router.push(`/producer/catalogo/${p.id}`)} style={{ flexDirection: "row", alignItems: "center" }}>
              <Img uri={p.image_url} style={styles.img} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.name} numberOfLines={1}>{lang === "en" && p.name_en ? p.name_en : p.name}</Text>
                <Muted>€{p.price.toFixed(2)} / {p.unit} · {t("product.stock")}: {p.stock}</Muted>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                  <Badge label={t(p.status === "approved" ? "producer.approved" : p.status === "rejected" ? "producer.rejected" : "producer.pendingReview")}
                    tone={p.status === "approved" ? "success" : p.status === "rejected" ? "error" : "warning"} />
                  {p.featured && <Badge label={t("home.featured")} tone="brand" icon="star" />}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  img: { width: 60, height: 60, borderRadius: radius.sm },
  name: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
}));
