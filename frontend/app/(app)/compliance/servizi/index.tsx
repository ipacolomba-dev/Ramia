import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, Muted, Notice } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { LabelRequest } from "@/src/types";

/** Label / compliance services: collaborators see open requests to quote; producers see their own. */
export default function ComplianceServices() {
  const { user } = useAuth();
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const isProducer = user?.role === "producer";
  const q = useQuery({
    queryKey: ["label-requests", user?.role, user?.id],
    queryFn: () => api<LabelRequest[]>(`/labels/requests${isProducer ? "?mine=1" : ""}`),
  });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Servizi di conformità", "Compliance services")} onBack={isProducer ? () => router.back() : undefined} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="compliance-services"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        {user?.approved === false && <Notice icon="time-outline" text={t("pending.banner")} />}
        {isProducer ? (
          <Btn title={t("label.new")} icon="add" testID="services-new-request" onPress={() => router.push("/producer/etichette/form")} style={{ marginBottom: spacing.md }} />
        ) : (
          <Muted>{L("Richieste di etichettatura e conformità dei produttori: apri una richiesta e invia la tua offerta.", "Producers' labelling and compliance requests: open one and send your offer.")}</Muted>
        )}
        <View style={{ height: spacing.md }} />
        {q.isLoading ? <CenterLoader /> : q.isError ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> :
          (q.data ?? []).length === 0 ? <EmptyState icon="document-text-outline" title={t("label.noRequests")} subtitle={t("label.sub")} /> :
          q.data!.map((r) => (
            <Card key={r.id} testID={`service-request-${r.id}`} onPress={() => router.push(isProducer ? `/producer/etichette/${r.id}` : `/compliance/servizi/${r.id}`)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <Text style={styles.title}>{r.product_name}</Text>
                <Badge label={t(r.status === "open" ? "label.open" : r.status === "in_progress" ? "label.inProgress" : "label.done")}
                  tone={r.status === "open" ? "warning" : r.status === "in_progress" ? "info" : "success"} />
              </View>
              <Muted>{r.target_market} · {r.producer_name}</Muted>
              <Text style={styles.needs} numberOfLines={2}>{r.needs}</Text>
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { flex: 1, fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  needs: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceTertiary, marginTop: spacing.xs },
}));
