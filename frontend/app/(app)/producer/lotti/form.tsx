import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { Btn, Chip, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { Lot, Product } from "@/src/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function LotForm() {
  const params = useLocalSearchParams<{ id?: string; productId?: string; productName?: string }>();
  const { t, L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();

  const [productId, setProductId] = useState<string | null>(params.productId ?? null);
  const [productName, setProductName] = useState(params.productName ?? "");
  const [code, setCode] = useState("");
  const [prod, setProd] = useState("");
  const [exp, setExp] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("kg");
  const [notes, setNotes] = useState("");

  const products = useQuery({ queryKey: ["my-products"], queryFn: () => api<Product[]>("/products/mine") });
  const lots = useQuery({ queryKey: ["lots"], queryFn: () => api<Lot[]>("/lots"), enabled: !!params.id });

  useEffect(() => {
    const l = lots.data?.find((x) => x.id === params.id);
    if (!l) return;
    setProductId(l.product_id ?? null); setProductName(l.product_name); setCode(l.lot_code);
    setProd(l.production_date ?? ""); setExp(l.expiry_date ?? ""); setQty(String(l.quantity)); setUnit(l.unit); setNotes(l.notes ?? "");
  }, [lots.data, params.id]);

  const done = () => { qc.invalidateQueries({ queryKey: ["lots"] }); toast.show(t("toast.saved")); router.back(); };
  const save = useMutation({
    mutationFn: () => api(params.id ? `/lots/${params.id}` : "/lots", {
      method: params.id ? "PATCH" : "POST",
      body: { product_id: productId, product_name: productName, lot_code: code.trim(), production_date: prod || null, expiry_date: exp || null,
        quantity: parseFloat(qty.replace(",", ".")), unit, notes: notes || null },
    }),
    onSuccess: done,
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const remove = useMutation({ mutationFn: () => api(`/lots/${params.id}`, { method: "DELETE" }), onSuccess: done });

  const submit = () => {
    const q = parseFloat(qty.replace(",", "."));
    if (!productName || !code.trim() || isNaN(q)) return toast.show(L("Compila prodotto, codice lotto e quantità", "Fill product, lot code and quantity"), "error");
    if ((prod && !DATE_RE.test(prod)) || (exp && !DATE_RE.test(exp))) return toast.show(L("Date nel formato AAAA-MM-GG", "Dates as YYYY-MM-DD"), "error");
    save.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={params.id ? L("Modifica lotto", "Edit lot") : L("Nuovo lotto", "New lot")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} bottomOffset={24} testID="lot-form">
        <Text style={styles.label}>{L("Prodotto", "Product")}</Text>
        <View style={styles.chips}>
          {(products.data ?? []).map((p) => (
            <Chip key={p.id} label={p.name} selected={productId === p.id} testID={`lot-product-${p.id}`} onPress={() => { setProductId(p.id); setProductName(p.name); }} />
          ))}
        </View>
        <Field label={L("Codice lotto", "Lot code")}><Input testID="lot-code" value={code} onChangeText={setCode} placeholder="L2026-001" autoCapitalize="characters" /></Field>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field label={L("Data produzione", "Production date")}><Input testID="lot-prod" value={prod} onChangeText={setProd} placeholder="2026-06-01" /></Field></View>
          <View style={{ flex: 1 }}><Field label={L("Scadenza", "Expiry")}><Input testID="lot-exp" value={exp} onChangeText={setExp} placeholder="2027-06-01" /></Field></View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field label={t("common.qty")}><Input testID="lot-qty" value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="500" /></Field></View>
          <View style={{ flex: 1 }}><Field label={L("Unità", "Unit")}><Input testID="lot-unit" value={unit} onChangeText={setUnit} /></Field></View>
        </View>
        <Field label={L("Note (campo, raccolta, analisi)", "Notes (field, harvest, analysis)")}><Input testID="lot-notes" value={notes} onChangeText={setNotes} multiline /></Field>
        <Btn title={t("common.save")} size="lg" testID="lot-submit" loading={save.isPending} onPress={submit} />
        {params.id ? <Btn title={t("common.delete")} variant="danger" testID="lot-delete" loading={remove.isPending} onPress={() => remove.mutate()} style={{ marginTop: spacing.sm }} /> : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  label: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
}));
