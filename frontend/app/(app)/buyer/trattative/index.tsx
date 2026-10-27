import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { NotificationBell } from "@/src/components/NotificationBell";
import { OfferCard } from "@/src/components/OfferCard";
import { Card, LinkRow, Muted, Segmented } from "@/src/components/blocks";
import { Badge, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { B2BOffer, Negotiation } from "@/src/types";

export default function BuyerDeals() {
  const { colors } = useTheme();
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const [seg, setSeg] = useState<"offers" | "deals">("offers");

  const offers = useQuery({ queryKey: ["b2b-offers", false], queryFn: () => api<B2BOffer[]>("/b2b/offers"), enabled: seg === "offers" });
  const negs = useQuery({ queryKey: ["negotiations"], queryFn: () => api<Negotiation[]>("/b2b/negotiations/mine") });
  const openNegs = (negs.data ?? []).filter((n) => n.status !== "agreed");
  const active = seg === "offers" ? offers : negs;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Trattative B2B", "B2B deals")} right={<NotificationBell />} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="buyer-deals"
        refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => active.refetch()} />}>
        <LinkRow icon="megaphone" label={L("Le mie richieste di fornitura", "My supply requests")} hint={L("Chiedi ai produttori ciò che ti serve", "Ask producers for what you need")} testID="deals-rfq" onPress={() => router.push("/buyer/richieste")} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}><LinkRow icon="time" label={L("Storico", "History")} testID="deals-history" onPress={() => router.push("/buyer/trattative/history")} /></View>
          <View style={{ flex: 1 }}><LinkRow icon="notifications" label={L("Avvisi", "Alerts")} testID="deals-alerts" onPress={() => router.push("/buyer/trattative/alerts")} /></View>
        </View>

        <Segmented value={seg} onChange={setSeg} options={[
          { key: "offers", label: L("Offerte disponibili", "Available offers") },
          { key: "deals", label: L(`In corso (${openNegs.length})`, `Ongoing (${openNegs.length})`) },
        ]} />
        {active.isLoading ? <CenterLoader /> : active.isError ? <ErrorBanner message={t("common.error")} onRetry={() => active.refetch()} /> : null}

        {seg === "offers" && !offers.isLoading && ((offers.data ?? []).length === 0
          ? <EmptyState icon="file-tray-outline" title={t("b2b.noOffers")} />
          : offers.data!.map((o) => <OfferCard key={o.id} offer={o} onPress={() => router.push(`/shared/b2b/${o.id}`)} />))}

        {seg === "deals" && !negs.isLoading && (openNegs.length === 0
          ? <EmptyState icon="chatbubbles-outline" title={t("b2b.noNegotiations")} />
          : openNegs.map((n) => (
            <Card key={n.id} testID={`negotiation-item-${n.id}`} onPress={() => router.push({ pathname: `/shared/b2b/${n.offer_id}` as any, params: { negotiation: n.id } })} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Ionicons name="chatbubbles-outline" size={20} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{n.offer_title}</Text>
                <Muted>{n.producer_name}</Muted>
              </View>
              <Badge label={t("b2b.inNegotiation")} tone="warning" />
            </Card>
          )))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
}));
