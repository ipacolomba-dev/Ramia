import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, Notice, Section, fmtDate, fmtEur } from "@/src/components/blocks";
import { Badge, Btn, Chip, EmptyState, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";

type Contact = { buyer_id: string; name: string; first_contact_at: string | null };
type Decl = { id: string; buyer_name: string; amount: number; closed_on: string; within_window: boolean; commercial_snapshot: { producer_fee: number; producer_pct: number } | null };

/** Producer self-declaration of deals closed off-platform with buyers met on 'Ra mia. */
export default function Declarations() {
  const { L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const contacts = useQuery({ queryKey: ["deal-contacts"], queryFn: () => api<Contact[]>("/deals/contacts") });
  const decls = useQuery({ queryKey: ["deal-decls"], queryFn: () => api<Decl[]>("/deals/declarations") });
  const [buyer, setBuyer] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [closed, setClosed] = useState("");
  const [desc, setDesc] = useState("");
  const m = useMutation({
    mutationFn: () => api("/deals/declarations", { method: "POST", body: { buyer_id: buyer, amount: parseFloat(amount.replace(",", ".")), closed_on: closed, description: desc } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deal-decls"] }); setAmount(""); setClosed(""); setDesc(""); setBuyer(null); toast.show(L("Dichiarazione registrata", "Declaration recorded")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const valid = buyer && parseFloat(amount.replace(",", ".")) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(closed) && desc.trim().length >= 3;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Affari fuori piattaforma", "Off-platform deals")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} bottomOffset={24} testID="declarations">
        <Notice text={L("Dichiara gli affari conclusi fuori piattaforma con buyer conosciuti su 'Ra mia: entro la finestra prevista si applica la quota di introduzione.", "Declare deals closed off-platform with buyers met on 'Ra mia: within the window the introduction fee applies.")} />
        <Text style={styles.label}>{L("Controparte", "Counterparty")}</Text>
        {(contacts.data ?? []).length === 0 ? <Muted>{L("Nessun buyer conosciuto tramite la piattaforma.", "No buyers met through the platform.")}</Muted> : (
          <View style={styles.chips}>
            {contacts.data!.map((c) => <Chip key={c.buyer_id} label={`${c.name}${c.first_contact_at ? ` · ${fmtDate(c.first_contact_at)}` : ""}`} selected={buyer === c.buyer_id} testID={`decl-buyer-${c.buyer_id}`} onPress={() => setBuyer(c.buyer_id)} />)}
          </View>
        )}
        <Field label={L("Valore dell'affare (€)", "Deal value (€)")}><Input testID="decl-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /></Field>
        <Field label={L("Data di chiusura (AAAA-MM-GG)", "Closing date (YYYY-MM-DD)")}><Input testID="decl-date" value={closed} onChangeText={setClosed} placeholder="2026-05-31" /></Field>
        <Field label={L("Descrizione / categoria", "Description / category")}><Input testID="decl-desc" value={desc} onChangeText={setDesc} multiline /></Field>
        <Btn title={L("Dichiara", "Declare")} testID="decl-submit" disabled={!valid} loading={m.isPending} onPress={() => m.mutate()} />
        <Section title={L("Le mie dichiarazioni", "My declarations")} />
        {(decls.data ?? []).length === 0 ? <EmptyState icon="document-text-outline" title={L("Nessuna dichiarazione", "No declarations")} /> : decls.data!.map((d) => (
          <Card key={d.id} testID={`decl-${d.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.title}>{d.buyer_name}</Text>
              <Badge label={d.within_window ? L("Entro finestra", "Within window") : L("Fuori finestra", "Outside window")} tone={d.within_window ? "warning" : "neutral"} />
            </View>
            <Muted>{fmtEur(d.amount)} · {fmtDate(d.closed_on)}</Muted>
            {d.commercial_snapshot ? <Muted>{L("Quota di introduzione", "Introduction fee")} {d.commercial_snapshot.producer_pct}%: {fmtEur(d.commercial_snapshot.producer_fee)}</Muted> : null}
          </Card>
        ))}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  label: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  title: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
}));
