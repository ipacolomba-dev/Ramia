import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, Notice, Section, Stat, StatRow, fmtDate, fmtEur } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, ErrorBanner, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ESCROW_LABELS, escrowTone } from "@/src/payments";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";

interface EscrowItem { kind: "order" | "shipment"; id: string; title: string; amount: number; status: string; dispute?: { reason: string } | null; auto_release_at?: string | null; held_at?: string }
interface Payout { id: string; beneficiary_name: string; beneficiary_role: string; net: number; fee: number; status: string; created_at: string }
interface EscrowData { items: EscrowItem[]; totals: Record<string, number>; payouts: Payout[]; settings: { auto_release_days: number }; stripe_mode: string }

export default function AdminPayments() {
  const { t, L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["admin-escrow"], queryFn: () => api<EscrowData>("/admin/escrow") });
  const [target, setTarget] = useState<{ item: EscrowItem; action: "release" | "refund" } | null>(null);
  const [note, setNote] = useState("");
  const [days, setDays] = useState("");

  const resolve = useMutation({
    mutationFn: () => api(`/admin/escrow/${target!.item.kind}/${target!.item.id}/resolve`, { method: "POST", body: { action: target!.action, note } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-escrow"] }); setTarget(null); setNote(""); toast.show(t("toast.saved")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const saveDays = useMutation({
    mutationFn: () => api("/admin/payment-settings", { method: "PUT", body: { auto_release_days: parseInt(days, 10) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-escrow"] }); setDays(""); toast.show(t("toast.saved")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const d = q.data;
  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Pagamenti in garanzia", "Escrow payments")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="admin-escrow"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        {q.isLoading ? <CenterLoader /> : q.isError || !d ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> : (
          <>
            {d.stripe_mode === "test" && <Notice text={L("Modalità di prova Stripe: usa la carta 4242 4242 4242 4242. Nessun addebito reale.", "Stripe test mode: use card 4242 4242 4242 4242.")} />}
            <StatRow>
              <Stat value={fmtEur(d.totals.held ?? 0)} label={L("In garanzia", "Held")} testID="escrow-held-total" />
              <Stat value={fmtEur(d.totals.disputed ?? 0)} label={L("Contestati", "Disputed")} />
              <Stat value={fmtEur(d.totals.released ?? 0)} label={L("Rilasciati", "Released")} />
            </StatRow>
            <Card>
              <Text style={styles.cardTitle}>{L(`Rilascio automatico dopo ${d.settings.auto_release_days} giorni`, `Auto-release after ${d.settings.auto_release_days} days`)}</Text>
              <Muted>{L("Se il cliente non conferma né contesta, i fondi degli ordini vengono rilasciati in automatico. I trasporti si rilasciano solo con la prova di consegna.", "Orders auto-release if the buyer neither confirms nor disputes. Shipments release only on proof of delivery.")}</Muted>
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Input testID="escrow-days-input" value={days} onChangeText={setDays} keyboardType="number-pad" placeholder={String(d.settings.auto_release_days)} /></View>
                <Btn title={t("common.save")} size="sm" testID="escrow-days-save" loading={saveDays.isPending} onPress={() => { const n = parseInt(days, 10); if (n >= 1 && n <= 60) saveDays.mutate(); else toast.show(L("Inserisci da 1 a 60 giorni", "Enter 1 to 60 days"), "error"); }} />
              </View>
            </Card>
            <Section title={L("Movimenti", "Transactions")} />
            {d.items.length === 0 ? <Muted>{L("Nessun pagamento ancora.", "No payments yet.")}</Muted> : d.items.map((i) => (
              <Card key={`${i.kind}-${i.id}`} testID={`escrow-${i.id}`}>
                <View style={styles.top}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{i.title}</Text>
                  <Badge label={L(...(ESCROW_LABELS[i.status] ?? [i.status, i.status]))} tone={escrowTone(i.status) as any} />
                </View>
                <Muted>{fmtEur(i.amount)} · {L("pagato il", "paid on")} {fmtDate(i.held_at)}{i.auto_release_at && i.status === "held" ? ` · ${L("rilascio auto", "auto-release")} ${fmtDate(i.auto_release_at)}` : ""}</Muted>
                {i.dispute ? <Text style={styles.dispute}>{L("Contestazione:", "Dispute:")} {i.dispute.reason}</Text> : null}
                {i.status === "refund_manual" && <Text style={styles.dispute}>{L("Rimborso automatico non riuscito: esegui il rimborso dalla dashboard Stripe, poi riprova o registra l'esito.", "Automatic refund failed: refund from the Stripe dashboard, then retry.")}</Text>}
                {(i.status === "held" || i.status === "disputed" || i.status === "refund_manual") && (
                  <View style={styles.row}>
                    {i.status !== "refund_manual" && <Btn title={L("Rilascia", "Release")} size="sm" testID={`escrow-release-${i.id}`} onPress={() => setTarget({ item: i, action: "release" })} style={{ flex: 1 }} />}
                    <Btn title={i.status === "refund_manual" ? L("Riprova rimborso", "Retry refund") : L("Rimborsa", "Refund")} size="sm" variant="outline" testID={`escrow-refund-${i.id}`} onPress={() => setTarget({ item: i, action: "refund" })} style={{ flex: 1 }} />
                  </View>
                )}
              </Card>
            ))}
            <Section title={L("Bonifici ai venditori", "Payouts")} />
            {d.payouts.length === 0 ? <Muted>{L("Nessun bonifico.", "No payouts.")}</Muted> : d.payouts.map((p) => (
              <View key={p.id} style={styles.payout}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pName}>{p.beneficiary_name}</Text>
                  <Muted>{fmtDate(p.created_at)} · {L("commissione", "fee")} {fmtEur(p.fee)}</Muted>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={styles.pNet}>{fmtEur(p.net)}</Text>
                  <Badge label={p.status === "transferred" ? L("Bonificato", "Paid") : p.status === "failed" ? L("Non riuscito", "Failed") : L("Da collegare", "Awaiting account")} tone={p.status === "transferred" ? "success" : p.status === "failed" ? "error" : "warning"} />
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
      <Sheet visible={!!target} onClose={() => setTarget(null)} title={target?.action === "refund" ? L("Rimborsa il cliente", "Refund customer") : L("Rilascia i fondi", "Release funds")}>
        <Muted>{target?.item.title} · {fmtEur(target?.item.amount ?? 0)}</Muted>
        <Field label={L("Motivazione (resta nel registro attività)", "Reason (saved in the audit log)")}><Input testID="escrow-note" value={note} onChangeText={setNote} multiline /></Field>
        <Btn title={L("Conferma", "Confirm")} testID="escrow-confirm" loading={resolve.isPending} onPress={() => (note.trim().length >= 3 ? resolve.mutate() : toast.show(L("Scrivi una motivazione", "Write a reason"), "error"))} />
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  cardTitle: { flex: 1, fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignItems: "center" },
  dispute: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.error, marginTop: spacing.xs },
  payout: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  pName: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  pNet: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary },
}));
