import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { OfferCard } from "@/src/components/OfferCard";
import { Card, Muted, Segmented, fmtDate } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, EmptyState, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { B2BOffer, Negotiation, Rfq } from "@/src/types";

export default function ProducerOffers() {
  const { colors } = useTheme();
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const [seg, setSeg] = useState<"offers" | "deals" | "rfq">("offers");

  const offers = useQuery({ queryKey: ["b2b-offers", true], queryFn: () => api<B2BOffer[]>("/b2b/offers?mine=1"), enabled: seg === "offers" });
  const negs = useQuery({ queryKey: ["negotiations"], queryFn: () => api<Negotiation[]>("/b2b/negotiations/mine"), enabled: seg === "deals" });
  const rfqs = useQuery({ queryKey: ["rfq"], queryFn: () => api<Rfq[]>("/rfq"), enabled: seg === "rfq" });
  const active = seg === "offers" ? offers : seg === "deals" ? negs : rfqs;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Offerte B2B", "B2B offers")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="producer-offers"
        refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => active.refetch()} />}>
        <Segmented value={seg} onChange={setSeg} options={[
          { key: "offers", label: L("Le mie offerte", "My offers") },
          { key: "deals", label: L("Trattative", "Deals") },
          { key: "rfq", label: L("Richieste", "Requests") },
        ]} />
        {seg === "offers" && <Btn title={t("b2b.newOffer")} icon="add" testID="offers-new" onPress={() => router.push("/producer/offerte/form")} style={{ marginBottom: spacing.md }} />}
        {active.isLoading ? <CenterLoader /> : null}

        {seg === "offers" && !offers.isLoading && ((offers.data ?? []).length === 0
          ? <EmptyState icon="file-tray-outline" title={t("b2b.noOffers")} />
          : offers.data!.map((o) => <OfferCard key={o.id} offer={o} onPress={() => router.push(`/shared/b2b/${o.id}`)} />))}

        {seg === "deals" && !negs.isLoading && ((negs.data ?? []).length === 0
          ? <EmptyState icon="chatbubbles-outline" title={t("b2b.noNegotiations")} />
          : negs.data!.map((n) => (
            <Card key={n.id} testID={`deal-${n.id}`} onPress={() => router.push({ pathname: `/shared/b2b/${n.offer_id}` as any, params: { negotiation: n.id } })} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Ionicons name="chatbubbles-outline" size={20} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{n.offer_title}</Text>
                <Muted>{n.business_name}</Muted>
              </View>
              <Badge label={n.status === "agreed" ? t("b2b.agreed") : t("b2b.inNegotiation")} tone={n.status === "agreed" ? "success" : "warning"} />
            </Card>
          )))}

        {seg === "rfq" && !rfqs.isLoading && ((rfqs.data ?? []).length === 0
          ? <EmptyState icon="megaphone-outline" title={L("Nessuna richiesta aperta", "No open requests")} subtitle={L("Qui compaiono le richieste di fornitura dei compratori professionali", "Supply requests from professional buyers appear here")} />
          : rfqs.data!.map((r) => (
            <Card key={r.id} testID={`producer-rfq-${r.id}`} onPress={() => router.push(`/producer/offerte/${r.id}`)}>
              <Text style={styles.title}>{r.title}</Text>
              <Muted>{r.buyer_name} · {r.quantity}{r.destination ? ` · ${r.destination}` : ""}</Muted>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                {r.deadline ? <Badge label={`${L("Entro", "By")} ${fmtDate(r.deadline)}`} tone="info" /> : null}
                {r.responses.length > 0 && <Badge label={L("Hai risposto", "Replied")} tone="success" />}
              </View>
            </Card>
          )))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
}));
