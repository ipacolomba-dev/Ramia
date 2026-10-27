import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, Muted, Notice, fmtDate } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { Rfq } from "@/src/types";

export default function BuyerRequests() {
  const { user } = useAuth();
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["rfq"], queryFn: () => api<Rfq[]>("/rfq") });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Richieste di fornitura", "Supply requests")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="rfq-list"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        {user?.approved === false ? <Notice icon="time-outline" text={L("Potrai pubblicare richieste dopo l'approvazione del tuo account.", "You can publish requests once your account is approved.")} /> : (
          <Btn title={L("Nuova richiesta", "New request")} icon="add" testID="rfq-new" onPress={() => router.push("/buyer/richieste/form")} style={{ marginBottom: spacing.md }} />
        )}
        {q.isLoading ? <CenterLoader /> : q.isError ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> :
          (q.data ?? []).length === 0 ? (
            <EmptyState icon="megaphone-outline" title={L("Nessuna richiesta", "No requests")} subtitle={L("Descrivi prodotto e quantità: i produttori ti risponderanno", "Describe product and quantity: producers will reply")} />
          ) : q.data!.map((r) => (
            <Card key={r.id} testID={`rfq-${r.id}`} onPress={() => router.push(`/buyer/richieste/${r.id}`)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <Text style={styles.title}>{r.title}</Text>
                <Badge label={r.status === "open" ? L("Aperta", "Open") : L("Chiusa", "Closed")} tone={r.status === "open" ? "success" : "neutral"} />
              </View>
              <Muted>{r.quantity}{r.deadline ? ` · ${L("entro", "by")} ${fmtDate(r.deadline)}` : ""}</Muted>
              <Muted>{(() => { const n = r.responses_count ?? r.responses.length; return L(`${n} ${n === 1 ? "risposta" : "risposte"}`, `${n} ${n === 1 ? "response" : "responses"}`); })()}</Muted>
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { flex: 1, fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
}));
