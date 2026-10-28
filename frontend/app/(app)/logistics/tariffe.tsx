import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, fmtEur } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, Chip, EmptyState, ErrorBanner, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { SERVICE_LABELS } from "@/src/screens/InstantQuote";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";

interface RateCard {
  id: string; name: string; origin_region: string; destination_region: string; service: string;
  price_per_pallet: number; price_per_kg: number; min_charge: number; fuel_surcharge_pct: number;
  transit_days: number; cold_chain: boolean; max_pallets: number; active: boolean;
}
const EMPTY = { name: "", origin_region: "Sicilia", destination_region: "*", service: "groupage", price_per_pallet: "", price_per_kg: "", min_charge: "", fuel_surcharge_pct: "", transit_days: "", cold_chain: false, max_pallets: "33", active: true };
type Form = typeof EMPTY;
const num = (s: string) => parseFloat(String(s).replace(",", ".")) || 0;

export default function RateCards() {
  const { t, L } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["rate-cards"], queryFn: () => api<RateCard[]>("/logistics/rate-cards/mine") });
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Form>(EMPTY);
  const set = (k: keyof Form, v: any) => setF((p) => ({ ...p, [k]: v }));

  const done = () => { qc.invalidateQueries({ queryKey: ["rate-cards"] }); setOpen(false); toast.show(t("toast.saved")); };
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, price_per_pallet: num(f.price_per_pallet), price_per_kg: num(f.price_per_kg), min_charge: num(f.min_charge), fuel_surcharge_pct: num(f.fuel_surcharge_pct), transit_days: Math.max(1, parseInt(f.transit_days, 10) || 1), max_pallets: Math.max(1, parseInt(f.max_pallets, 10) || 33) };
      return editing ? api(`/logistics/rate-cards/${editing}`, { method: "PATCH", body }) : api("/logistics/rate-cards", { method: "POST", body });
    },
    onSuccess: done,
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/logistics/rate-cards/${id}`, { method: "DELETE" }), onSuccess: done, onError: (e: Error) => toast.show(e.message, "error") });

  const edit = (c?: RateCard) => {
    setEditing(c?.id ?? null);
    setF(c ? { ...c, price_per_pallet: String(c.price_per_pallet), price_per_kg: String(c.price_per_kg), min_charge: String(c.min_charge), fuel_surcharge_pct: String(c.fuel_surcharge_pct), transit_days: String(c.transit_days), max_pallets: String(c.max_pallets) } : EMPTY);
    setOpen(true);
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Tariffari", "Rate cards")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="rate-cards"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        <Muted>{L("Le tue tariffe generano preventivi immediati per produttori e compratori. Usa * per indicare qualsiasi regione.", "Your rates power instant quotes. Use * for any region.")}</Muted>
        <Btn title={L("Nuova tariffa", "New rate")} icon="add" testID="rate-new" onPress={() => edit()} style={{ marginVertical: spacing.md }} />
        {q.isLoading ? <CenterLoader /> : q.isError ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> :
          (q.data ?? []).length === 0 ? <EmptyState icon="pricetags-outline" title={L("Nessuna tariffa", "No rates")} subtitle={L("Pubblica la prima tariffa per ricevere prenotazioni dirette.", "Publish a rate to get direct bookings.")} /> :
          q.data!.map((c) => (
            <Card key={c.id} testID={`rate-${c.id}`} onPress={() => edit(c)}>
              <View style={styles.top}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Badge label={c.active ? L("Attiva", "Active") : L("Sospesa", "Paused")} tone={c.active ? "success" : "neutral"} />
              </View>
              <Muted>{c.origin_region === "*" ? L("Ovunque", "Anywhere") : c.origin_region} → {c.destination_region === "*" ? L("Ovunque", "Anywhere") : c.destination_region} · {L(...(SERVICE_LABELS[c.service] ?? [c.service, c.service]))}{c.cold_chain ? " · ❄" : ""}</Muted>
              <Muted>{fmtEur(c.price_per_pallet)}/pallet · {fmtEur(c.price_per_kg)}/kg · min {fmtEur(c.min_charge)} · +{c.fuel_surcharge_pct}% {L("carburante", "fuel")} · {c.transit_days} gg</Muted>
            </Card>
          ))}
      </ScrollView>
      <Sheet visible={open} onClose={() => setOpen(false)} title={editing ? L("Modifica tariffa", "Edit rate") : L("Nuova tariffa", "New rate")}>
        <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
          <Field label={L("Nome", "Name")}><Input testID="rate-name" value={f.name} onChangeText={(v) => set("name", v)} placeholder="Groupage Sicilia → Lombardia" /></Field>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Field label={L("Da regione", "From region")}><Input testID="rate-origin" value={f.origin_region} onChangeText={(v) => set("origin_region", v)} /></Field></View>
            <View style={{ flex: 1 }}><Field label={L("A regione", "To region")}><Input testID="rate-dest" value={f.destination_region} onChangeText={(v) => set("destination_region", v)} /></Field></View>
          </View>
          <View style={styles.chips}>
            {Object.keys(SERVICE_LABELS).map((s) => <Chip key={s} label={L(...SERVICE_LABELS[s])} selected={f.service === s} testID={`rate-service-${s}`} onPress={() => set("service", s)} />)}
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Field label="€/pallet"><Input testID="rate-ppp" value={f.price_per_pallet} onChangeText={(v) => set("price_per_pallet", v)} keyboardType="decimal-pad" /></Field></View>
            <View style={{ flex: 1 }}><Field label="€/kg"><Input testID="rate-ppk" value={f.price_per_kg} onChangeText={(v) => set("price_per_kg", v)} keyboardType="decimal-pad" /></Field></View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Field label={L("Minimo €", "Minimum €")}><Input testID="rate-min" value={f.min_charge} onChangeText={(v) => set("min_charge", v)} keyboardType="decimal-pad" /></Field></View>
            <View style={{ flex: 1 }}><Field label={L("Carburante %", "Fuel %")}><Input testID="rate-fuel" value={f.fuel_surcharge_pct} onChangeText={(v) => set("fuel_surcharge_pct", v)} keyboardType="decimal-pad" /></Field></View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Field label={L("Giorni di viaggio", "Transit days")}><Input testID="rate-days" value={f.transit_days} onChangeText={(v) => set("transit_days", v)} keyboardType="number-pad" /></Field></View>
            <View style={{ flex: 1 }}><Field label={L("Max pallet", "Max pallets")}><Input testID="rate-max" value={f.max_pallets} onChangeText={(v) => set("max_pallets", v)} keyboardType="number-pad" /></Field></View>
          </View>
          <View style={styles.chips}>
            <Chip label={L("Catena del freddo", "Cold chain")} selected={f.cold_chain} testID="rate-cold" onPress={() => set("cold_chain", !f.cold_chain)} />
            <Chip label={L("Attiva", "Active")} selected={f.active} testID="rate-active" onPress={() => set("active", !f.active)} />
          </View>
          <Btn title={t("common.save")} testID="rate-save" loading={save.isPending} onPress={() => (f.name.trim().length >= 2 && f.transit_days ? save.mutate() : toast.show(L("Inserisci nome e giorni di viaggio", "Enter name and transit days"), "error"))} />
          {editing && <Btn title={L("Elimina tariffa", "Delete rate")} variant="danger" testID="rate-delete" loading={del.isPending} onPress={() => del.mutate(editing)} style={{ marginTop: spacing.sm }} />}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  name: { flex: 1, fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  row: { flexDirection: "row", gap: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
}));
