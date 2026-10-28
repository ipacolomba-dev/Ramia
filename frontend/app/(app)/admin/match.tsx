import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Card, Muted, fmtDate } from "@/src/components/blocks";
import { Badge, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";

interface Match { id: string; seq: number; producer_name: string; buyer_name: string; source: string; first_contact_at: string; expires_at: string; window_months: number; active: boolean; hash: string }
interface Verify { valid: boolean; entries: number; broken_at_seq: number | null }

const SOURCES: Record<string, [string, string]> = {
  negotiation: ["Trattativa B2B", "B2B negotiation"], rfq_response: ["Risposta a richiesta", "RFQ response"], order: ["Ordine", "Order"],
};

export default function MatchRegistry() {
  const { colors } = useTheme();
  const { t, L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["matches"], queryFn: () => api<Match[]>("/matches") });
  const v = useQuery({ queryKey: ["matches-verify"], queryFn: () => api<Verify>("/admin/matches/verify") });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Registro Match", "Match Registry")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="match-registry"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); v.refetch(); }} />}>
        {v.data && (
          <Card testID="match-integrity">
            <View style={styles.top}>
              <Ionicons name={v.data.valid ? "shield-checkmark" : "warning"} size={22} color={v.data.valid ? colors.success : colors.error} />
              <Text style={styles.title}>{v.data.valid ? L("Registro integro", "Registry intact") : L(`Manomissione rilevata alla voce #${v.data.broken_at_seq}`, `Tampering detected at #${v.data.broken_at_seq}`)}</Text>
            </View>
            <Muted>{L(`${v.data.entries} voci. Ogni voce contiene l'impronta della precedente: nessuna può essere modificata o cancellata senza che il controllo lo segnali.`, `${v.data.entries} entries, each sealed with the previous entry's fingerprint.`)}</Muted>
          </Card>
        )}
        <Muted>{L("Primo contatto tra produttore e compratore avvenuto tramite 'Ra mia. Gli affari conclusi entro la finestra prevedono la commissione di introduzione.", "First producer–buyer contact through 'Ra mia. Deals within the window owe the introduction fee.")}</Muted>
        {q.isLoading ? <CenterLoader /> : q.isError ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> :
          (q.data ?? []).length === 0 ? <EmptyState icon="git-network-outline" title={L("Nessun match registrato", "No matches yet")} subtitle={L("Compaiono al primo contatto tra produttore e compratore.", "They appear at the first producer–buyer contact.")} /> :
          q.data!.map((m) => (
            <Card key={m.id} testID={`match-${m.seq}`}>
              <View style={styles.top}>
                <Text style={styles.seq}>#{m.seq}</Text>
                <Text style={styles.title} numberOfLines={1}>{m.producer_name} ↔ {m.buyer_name}</Text>
                <Badge label={m.active ? L("Attivo", "Active") : L("Scaduto", "Expired")} tone={m.active ? "success" : "neutral"} />
              </View>
              <Muted>{L(...(SOURCES[m.source] ?? [m.source, m.source]))} · {fmtDate(m.first_contact_at)} → {fmtDate(m.expires_at)} ({m.window_months} {L("mesi", "months")})</Muted>
              <Text style={styles.hash} numberOfLines={1}>{m.hash}</Text>
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  title: { flex: 1, fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  seq: { fontFamily: fonts.textBold, fontSize: 13, color: colors.brandPrimary },
  hash: { fontFamily: fonts.text, fontSize: 10, color: colors.muted, marginTop: spacing.xs },
}));
