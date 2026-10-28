import { useMutation, useQuery } from "@tanstack/react-query";
import React from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, Notice, Section, Stat, StatRow, fmtDate, fmtEur } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, ErrorBanner, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { startConnectOnboarding } from "@/src/payments";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";

interface Payout { id: string; source_kind: string; source_id: string; gross: number; fee: number; net: number; status: string; created_at: string }
interface PayoutsData { held: number; transferred: number; pending_connect: number; failed: number; payouts: Payout[]; connect: { connected: boolean; account_id?: string } }

const STATUS: Record<string, [string, string, "success" | "warning" | "error"]> = {
  transferred: ["Bonificato", "Transferred", "success"],
  pending_connect: ["Da collegare", "Awaiting account", "warning"],
  failed: ["Non riuscito", "Failed", "error"],
};

/** Escrow + split payouts for producers and carriers. */
export function Payouts() {
  const { t, L } = useT();
  const toast = useToast();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["payouts"], queryFn: () => api<PayoutsData>("/payouts/mine") });
  const connect = useMutation({ mutationFn: startConnectOnboarding, onError: (e: Error) => toast.show(e.message, "error") });

  if (q.isLoading) return <CenterLoader />;
  if (q.isError || !q.data) return <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <View testID="payouts">
      <Section title={L("Pagamenti e bonifici", "Payments & payouts")} />
      <StatRow>
        <Stat value={fmtEur(d.held)} label={L("In garanzia", "In escrow")} testID="payouts-held" />
        <Stat value={fmtEur(d.transferred)} label={L("Bonificati", "Paid out")} />
        <Stat value={fmtEur(d.pending_connect)} label={L("Da ricevere", "To receive")} testID="payouts-pending" />
      </StatRow>
      <Card testID="connect-card">
        <Text style={styles.cardTitle}>{d.connect.connected ? L("Conto per i bonifici collegato", "Payout account connected") : L("Collega il conto per ricevere i bonifici", "Connect your payout account")}</Text>
        <Muted>{L("I soldi pagati dai clienti restano in garanzia fino alla consegna. Dopo la consegna ricevi il netto: il totale meno la commissione registrata nell'ordine.", "Customer payments are held until delivery, then you receive the net amount (minus the fee frozen on the order).")}</Muted>
        {!d.connect.connected && (
          <Btn title={L("Collega conto", "Connect account")} icon="card" testID="connect-onboard-button" loading={connect.isPending} onPress={() => connect.mutate()} style={{ marginTop: spacing.md }} />
        )}
      </Card>
      {d.payouts.length === 0 ? (
        <Muted>{L("Nessun bonifico ancora: compaiono qui dopo ogni consegna confermata.", "No payouts yet: they appear after each confirmed delivery.")}</Muted>
      ) : d.payouts.map((p) => {
        const st = STATUS[p.status] ?? [p.status, p.status, "warning"];
        return (
          <View key={p.id} style={styles.row} testID={`payout-${p.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{p.source_kind === "order" ? L("Ordine", "Order") : L("Trasporto", "Shipment")} #{p.source_id.slice(0, 8)}</Text>
              <Muted>{fmtDate(p.created_at)} · {L(`lordo ${fmtEur(p.gross)} − comm. ${fmtEur(p.fee)}`, `gross ${fmtEur(p.gross)} − fee ${fmtEur(p.fee)}`)}</Muted>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={styles.net}>{fmtEur(p.net)}</Text>
              <Badge label={L(st[0], st[1])} tone={st[2]} />
            </View>
          </View>
        );
      })}
      {!d.connect.connected && d.pending_connect > 0 && (
        <Notice text={L("I bonifici 'da ricevere' partono appena colleghi il conto.", "Payouts 'to receive' are sent as soon as you connect your account.")} />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  cardTitle: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface, marginBottom: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  net: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary },
}));
