import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Img } from "@/src/components/Img";
import { Card, LinkRow, Muted, Segmented } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, EmptyState, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing } from "@/src/theme";
import type { B2BOffer, Product } from "@/src/types";

export default function Moderation() {
  const { t, L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const [seg, setSeg] = useState<"products" | "offers">("products");
  const products = useQuery({ queryKey: ["admin-pending"], queryFn: () => api<Product[]>("/admin/pending-products"), enabled: seg === "products" });
  const offers = useQuery({ queryKey: ["admin-mod-offers"], queryFn: () => api<B2BOffer[]>("/admin/moderation/offers"), enabled: seg === "offers" });
  const ok = () => toast.show(t("toast.saved"));
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/products/${id}/review`, { method: "PATCH", body: { status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pending"] }); qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); ok(); },
  });
  const closeOffer = useMutation({
    mutationFn: (id: string) => api(`/admin/moderation/offers/${id}/close`, { method: "PATCH" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-mod-offers"] }); ok(); },
  });
  const active = seg === "products" ? products : offers;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Moderazione", "Moderation")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="admin-moderation"
        refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => active.refetch()} />}>
        <LinkRow icon="pricetags" label={L("Categorie prodotto", "Product categories")} testID="mod-categories-link" onPress={() => router.push("/admin/categorie")} />
        <Segmented value={seg} onChange={setSeg} options={[
          { key: "products", label: L("Prodotti in attesa", "Pending products") },
          { key: "offers", label: L("Offerte B2B", "B2B offers") },
        ]} />
        {active.isLoading ? <CenterLoader /> : null}
        {seg === "products" && !products.isLoading && ((products.data ?? []).length === 0 ? <EmptyState icon="checkmark-circle-outline" title={t("admin.noPending")} /> :
          products.data!.map((p) => (
            <Card key={p.id} testID={`admin-pending-${p.id}`} style={{ flexDirection: "row" }}>
              <Img uri={p.image_url} style={styles.img} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                <Muted>{p.company_name} · €{p.price.toFixed(2)} / {p.unit}</Muted>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Btn title={t("admin.approve")} size="sm" variant="secondary" testID={`admin-approve-${p.id}`} onPress={() => review.mutate({ id: p.id, status: "approved" })} />
                  <Btn title={t("admin.reject")} size="sm" variant="danger" testID={`admin-reject-${p.id}`} onPress={() => review.mutate({ id: p.id, status: "rejected" })} />
                </View>
              </View>
            </Card>
          )))}
        {seg === "offers" && !offers.isLoading && ((offers.data ?? []).length === 0 ? <EmptyState icon="file-tray-outline" title={t("b2b.noOffers")} /> :
          offers.data!.map((o) => (
            <Card key={o.id} testID={`mod-offer-${o.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <Text style={[styles.name, { flex: 1 }]} numberOfLines={2}>{o.title}</Text>
                <Badge label={o.status} tone={o.status === "closed" ? "neutral" : "success"} />
              </View>
              <Muted>{o.company_name} · €{o.unit_price.toFixed(2)} / {o.unit}</Muted>
              {o.status !== "closed" && <Btn title={L("Chiudi offerta", "Close offer")} size="sm" variant="danger" testID={`mod-offer-close-${o.id}`} onPress={() => closeOffer.mutate(o.id)} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }} />}
            </Card>
          )))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  img: { width: 60, height: 60, borderRadius: radius.sm },
  name: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
}));
