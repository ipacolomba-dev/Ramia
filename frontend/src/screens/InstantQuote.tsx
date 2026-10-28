import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, Muted, Notice, Section, fmtEur } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, Chip, EmptyState, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { useAreaBase } from "@/src/roles";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

interface Option {
  card_id: string; carrier_id: string; carrier_name: string; card_name: string; service: string; transit_days: number; cold_chain: boolean;
  breakdown: { base: number; fuel: number; carrier_price: number; platform_fee: number; platform_pct: number; total: number };
}
interface QuoteResult { options: Option[]; range: { min: number; max: number; median: number } | null; count: number }

export const SERVICE_LABELS: Record<string, [string, string]> = {
  groupage: ["Groupage (collettame)", "Groupage"], ftl: ["Camion completo", "Full truck"],
  refrigerated: ["Refrigerato", "Refrigerated"], express: ["Espresso", "Express"],
};

function RegionPicker({ value, onChange, regions, testID }: { value: string; onChange: (v: string) => void; regions: string[]; testID: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }} testID={testID}>
      {regions.map((r) => <Chip key={r} label={r} selected={value === r} testID={`${testID}-${r}`} onPress={() => onChange(r)} />)}
    </ScrollView>
  );
}

export default function InstantQuote() {
  const { colors } = useTheme();
  const { L, t } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const base = useAreaBase();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();

  const regions = useQuery({ queryKey: ["regions"], queryFn: () => api<string[]>("/logistics/regions") });
  const [origin, setOrigin] = useState("Sicilia");
  const [dest, setDest] = useState("Lombardia");
  const [pallets, setPallets] = useState("1");
  const [weight, setWeight] = useState("");
  const [cold, setCold] = useState(false);
  const [picked, setPicked] = useState<Option | null>(null);
  const [title, setTitle] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [originAddr, setOriginAddr] = useState("");
  const [destAddr, setDestAddr] = useState("");

  const body = () => ({ origin_region: origin, destination_region: dest, pallets: Math.max(1, parseInt(pallets, 10) || 1), weight_kg: parseFloat(weight.replace(",", ".")) || 0, cold_chain: cold });
  const quote = useMutation({
    mutationFn: () => api<QuoteResult>("/logistics/instant-quote", { method: "POST", body: body() }),
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const { reset } = quote;
  // results belong to the inputs that produced them: clear them on any change
  React.useEffect(() => { reset(); }, [origin, dest, pallets, weight, cold, reset]);
  const book = useMutation({
    mutationFn: () => api<{ id: string }>("/logistics/instant-quote/book", {
      method: "POST",
      body: { ...body(), card_id: picked!.card_id, title, ready_date: readyDate || null, origin_address: originAddr || null, destination_address: destAddr || null },
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["shipping-requests"] });
      setPicked(null);
      toast.show(L("Prenotato: ora puoi pagare il trasporto", "Booked: you can now pay for transport"));
      router.replace(`${base}/spedizioni/${r.id}` as any);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const res = quote.data;
  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Preventivo immediato", "Instant quote")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled" testID="instant-quote">
        <Muted>{L("Prezzi calcolati dai tariffari pubblicati dai vettori: vedi subito costo del vettore, supplemento carburante e commissione.", "Prices come from carriers' published rate cards: carrier cost, fuel surcharge and fee are shown upfront.")}</Muted>
        {regions.isLoading ? <CenterLoader /> : (
          <>
            <Text style={styles.label}>{L("Partenza", "From")}</Text>
            <RegionPicker value={origin} onChange={setOrigin} regions={regions.data ?? []} testID="iq-origin" />
            <Text style={styles.label}>{L("Destinazione", "To")}</Text>
            <RegionPicker value={dest} onChange={setDest} regions={regions.data ?? []} testID="iq-dest" />
          </>
        )}
        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}><Field label={L("Pallet", "Pallets")}><Input testID="iq-pallets" value={pallets} onChangeText={setPallets} keyboardType="number-pad" /></Field></View>
          <View style={{ flex: 1 }}><Field label={L("Peso (kg)", "Weight (kg)")}><Input testID="iq-weight" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="500" /></Field></View>
        </View>
        <Chip label={L("Serve la catena del freddo", "Cold chain needed")} selected={cold} testID="iq-cold" onPress={() => setCold(!cold)} />
        <Btn title={L("Calcola preventivo", "Get quote")} icon="calculator" testID="iq-submit" loading={quote.isPending} onPress={() => quote.mutate()} style={{ marginTop: spacing.lg }} />

        {res && (res.count === 0 ? (
          <EmptyState icon="car-outline" title={L("Nessuna tariffa per questa tratta", "No rate for this route")} subtitle={L("Puoi pubblicare una richiesta e ricevere preventivi dai vettori.", "Post a request to receive carrier quotes.")} />
        ) : (
          <>
            <Card testID="iq-range">
              <Text style={styles.rangeTitle}>{L("Forbice di prezzo", "Price range")}</Text>
              <Text style={styles.range}>{fmtEur(res.range!.min)} – {fmtEur(res.range!.max)}</Text>
              <Muted>{L(`Valore centrale ${fmtEur(res.range!.median)} · ${res.count} offerte`, `Median ${fmtEur(res.range!.median)} · ${res.count} options`)}</Muted>
            </Card>
            <Section title={L("Offerte dei vettori", "Carrier options")} />
            {res.options.map((o, i) => (
              <Card key={o.card_id} testID={`iq-option-${o.card_id}`}>
                <View style={styles.optTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.carrier}>{o.carrier_name}</Text>
                    <Muted>{L(...(SERVICE_LABELS[o.service] ?? [o.service, o.service]))} · {o.transit_days} {t("logistics.transitDays")}</Muted>
                  </View>
                  {i === 0 && <Badge label={L("Più conveniente", "Best price")} tone="success" />}
                  {o.cold_chain && <Ionicons name="snow" size={16} color={colors.info} />}
                </View>
                <View style={styles.line}><Muted>{L("Trasporto", "Freight")}</Muted><Text style={styles.val}>{fmtEur(o.breakdown.base)}</Text></View>
                <View style={styles.line}><Muted>{L("Carburante", "Fuel")}</Muted><Text style={styles.val}>{fmtEur(o.breakdown.fuel)}</Text></View>
                {o.breakdown.platform_fee > 0 && (
                  <View style={styles.line}><Muted>{L(`Commissione 'Ra mia ${o.breakdown.platform_pct}%`, `'Ra mia fee ${o.breakdown.platform_pct}%`)}</Muted><Text style={styles.val}>{fmtEur(o.breakdown.platform_fee)}</Text></View>
                )}
                <View style={[styles.line, styles.totalLine]}><Text style={styles.totalLbl}>{t("common.total")}</Text><Text style={styles.total}>{fmtEur(o.breakdown.total)}</Text></View>
                <Btn title={L("Prenota", "Book")} size="sm" testID={`iq-book-${o.card_id}`} onPress={() => { setPicked(o); setTitle(L("Spedizione", "Shipment") + ` ${origin} → ${dest}`); }} style={{ marginTop: spacing.md }} disabled={user?.role === "admin"} />
              </Card>
            ))}
          </>
        ))}
      </ScrollView>

      <Sheet visible={!!picked} onClose={() => setPicked(null)} title={L("Conferma prenotazione", "Confirm booking")}>
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          {picked && <Notice text={L(`${picked.carrier_name} · totale ${fmtEur(picked.breakdown.total)}. Pagherai con carta: i soldi restano in garanzia fino alla prova di consegna.`, `${picked.carrier_name} · total ${fmtEur(picked.breakdown.total)}. Funds stay in escrow until proof of delivery.`)} />}
          <Field label={L("Titolo", "Title")}><Input testID="iq-title" value={title} onChangeText={setTitle} /></Field>
          <Field label={`${L("Indirizzo di ritiro", "Pickup address")} (${t("common.optional")})`}><Input testID="iq-origin-addr" value={originAddr} onChangeText={setOriginAddr} placeholder="Via Etnea 1, Catania" /></Field>
          <Field label={`${L("Indirizzo di consegna", "Delivery address")} (${t("common.optional")})`}><Input testID="iq-dest-addr" value={destAddr} onChangeText={setDestAddr} placeholder="Via Torino 10, Milano" /></Field>
          <Field label={`${L("Pronto dal (AAAA-MM-GG)", "Ready from (YYYY-MM-DD)")} (${t("common.optional")})`}><Input testID="iq-ready" value={readyDate} onChangeText={setReadyDate} placeholder="2026-07-01" /></Field>
          <Btn title={L("Prenota trasporto", "Book transport")} icon="checkmark" testID="iq-confirm-book" loading={book.isPending} onPress={() => title.trim().length >= 3 && book.mutate()} />
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  label: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginTop: spacing.md },
  rangeTitle: { fontFamily: fonts.textBold, fontSize: 13, color: colors.muted },
  range: { fontFamily: fonts.display, fontSize: 26, color: colors.brandPrimary, marginVertical: 2 },
  optTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  carrier: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  val: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  totalLine: { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: spacing.xs, paddingTop: spacing.xs, borderRadius: radius.sm },
  totalLbl: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  total: { fontFamily: fonts.textBold, fontSize: 17, color: colors.brandPrimary },
}));
