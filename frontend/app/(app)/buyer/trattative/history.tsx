import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, fmtDate } from "@/src/components/blocks";
import { Badge, CenterLoader, EmptyState, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { Negotiation } from "@/src/types";

export default function DealsHistory() {
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const negs = useQuery({ queryKey: ["negotiations"], queryFn: () => api<Negotiation[]>("/b2b/negotiations/mine") });
  const done = (negs.data ?? []).filter((n) => n.status === "agreed");

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Storico trattative", "Deal history")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="deals-history-list">
        {negs.isLoading ? <CenterLoader /> : done.length === 0 ? (
          <EmptyState icon="time-outline" title={L("Nessun accordo concluso", "No closed deals yet")} />
        ) : done.map((n) => (
          <Card key={n.id} testID={`history-${n.id}`} onPress={() => router.push({ pathname: `/shared/b2b/${n.offer_id}` as any, params: { negotiation: n.id } })}>
            <Text style={styles.title}>{n.offer_title}</Text>
            <Muted>{n.producer_name} · {fmtDate((n as any).created_at)}</Muted>
            <Badge label={t("b2b.agreed")} tone="success" />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, marginBottom: 2 },
}));
