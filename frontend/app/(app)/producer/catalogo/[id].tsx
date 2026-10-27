import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Img } from "@/src/components/Img";
import { Card, Muted, Section, fmtDate } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, EmptyState, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing } from "@/src/theme";
import type { Lot, Product } from "@/src/types";

export default function CatalogItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const product = useQuery({ queryKey: ["product", id], queryFn: () => api<Product>(`/products/${id}`) });
  const lots = useQuery({ queryKey: ["lots", id], queryFn: () => api<Lot[]>(`/lots?product_id=${id}`) });

  if (product.isLoading) return <CenterLoader />;
  const p = product.data;
  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={p?.name ?? ""} onBack={() => router.back()} />
      {!p ? <EmptyState icon="alert-circle-outline" title={t("common.error")} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="catalog-detail">
          <Img uri={p.image_url} style={styles.hero} />
          <Text style={styles.name}>{p.name}</Text>
          <Muted>€{p.price.toFixed(2)} / {p.unit} · {t("product.stock")}: {p.stock}</Muted>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <Btn title={t("common.edit")} icon="create" size="sm" testID="catalog-edit" onPress={() => router.push({ pathname: "/producer/catalogo/form", params: { id: p.id } })} style={{ flex: 1 }} />
            <Btn title={L("Vedi scheda", "View page")} icon="eye" size="sm" variant="outline" testID="catalog-view-public" onPress={() => router.push(`/shared/product/${p.id}`)} style={{ flex: 1 }} />
          </View>
          <Btn title={L("Analisi export", "Export analysis")} icon="earth" size="sm" variant="secondary" testID="catalog-export"
            onPress={() => router.push(`/producer/export/market?productId=${p.id}`)} style={{ marginTop: spacing.sm }} />

          <Section title={L("Lotti di produzione", "Production lots")}
            right={<Btn title={L("Nuovo lotto", "New lot")} size="sm" icon="add" testID="catalog-new-lot" onPress={() => router.push({ pathname: "/producer/lotti/form", params: { productId: p.id, productName: p.name } })} />} />
          {(lots.data ?? []).length === 0 ? <Muted>{L("Nessun lotto registrato per questo prodotto.", "No lots recorded for this product.")}</Muted> :
            lots.data!.map((l) => (
              <Card key={l.id} testID={`catalog-lot-${l.id}`} onPress={() => router.push({ pathname: "/producer/lotti/form", params: { id: l.id } })}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.lotCode}>{l.lot_code}</Text>
                  <Badge label={`${l.quantity} ${l.unit}`} tone="info" />
                </View>
                <Muted>{L("Prod.", "Prod.")} {fmtDate(l.production_date)} · {L("Scad.", "Exp.")} {fmtDate(l.expiry_date)}</Muted>
              </Card>
            ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  hero: { width: "100%", height: 180, borderRadius: radius.md, marginBottom: spacing.md },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  lotCode: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
}));
