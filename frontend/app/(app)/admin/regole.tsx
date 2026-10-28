import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, Notice, Section, fmtDate } from "@/src/components/blocks";
import { Btn, CenterLoader, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";

type Svc = { label: string; buyer_pct: number; producer_pct: number; min_fee: number; window_months?: number };
type Rules = { id: string; version: number; active: boolean; services: Record<string, Svc>; discounts: any[]; note?: string; created_at: string; created_by: string };
const NUM: (keyof Svc)[] = ["buyer_pct", "producer_pct", "min_fee", "window_months"];
const NUM_LABEL: Record<string, [string, string]> = { buyer_pct: ["% buyer", "% buyer"], producer_pct: ["% produttore", "% producer"], min_fee: ["Minimo €", "Minimum €"], window_months: ["Finestra mesi", "Window months"] };

/** Admin: versioned commercial rules. Publishing creates a new version; existing orders keep their snapshot. */
export default function CommercialRules() {
  const { L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["admin-rules"], queryFn: () => api<Rules[]>("/admin/business-rules") });
  const active = q.data?.find((r) => r.active);
  const [form, setForm] = useState<Record<string, Record<string, string>>>({});
  const [note, setNote] = useState("");
  useEffect(() => {
    if (active) setForm(Object.fromEntries(Object.entries(active.services).map(([k, v]) => [k, Object.fromEntries(NUM.filter((n) => v[n] !== undefined).map((n) => [n, String(v[n])]))])));
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const publish = useMutation({
    mutationFn: () => api("/admin/business-rules", { method: "PUT", body: {
      note, discounts: active!.discounts,
      services: Object.fromEntries(Object.entries(active!.services).map(([k, v]) => [k, { ...v, ...Object.fromEntries(Object.entries(form[k] ?? {}).map(([n, x]) => [n, n === "window_months" ? parseInt(x, 10) : parseFloat(x.replace(",", "."))])) }])),
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-rules"] }); setNote(""); toast.show(L("Nuova versione pubblicata", "New version published")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (q.isLoading || !active) return <CenterLoader />;
  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Regole commerciali", "Commercial rules")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} bottomOffset={24} testID="admin-rules">
        <Notice icon="lock-closed" text={L(`Versione attiva v${active.version}. Ogni modifica crea una nuova versione: ordini e affari già chiusi conservano lo snapshot delle regole applicate.`, `Active version v${active.version}. Each change creates a new version: closed orders keep their rules snapshot.`)} />
        {Object.entries(active.services).map(([k, v]) => (
          <Card key={k} testID={`rule-${k}`}>
            <Text style={styles.title}>{v.label}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {Object.keys(form[k] ?? {}).map((n) => (
                <View key={n} style={{ width: "47%" }}>
                  <Field label={L(...NUM_LABEL[n])}>
                    <Input testID={`rule-${k}-${n}`} value={form[k][n]} keyboardType="decimal-pad" onChangeText={(x) => setForm((f) => ({ ...f, [k]: { ...f[k], [n]: x } }))} />
                  </Field>
                </View>
              ))}
            </View>
          </Card>
        ))}
        <Field label={L("Motivazione della modifica", "Reason for the change")}><Input testID="rule-note" value={note} onChangeText={setNote} /></Field>
        <Btn title={L("Pubblica nuova versione", "Publish new version")} testID="rule-publish" loading={publish.isPending} disabled={note.trim().length < 3} onPress={() => publish.mutate()} />
        <Section title={L("Storico versioni", "Version history")} />
        {q.data!.map((r) => <Muted key={r.id}>v{r.version}{r.active ? " ●" : ""} · {fmtDate(r.created_at)} · {r.note ?? ""}</Muted>)}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, marginBottom: spacing.sm },
}));
