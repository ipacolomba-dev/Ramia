import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { Btn, Chip, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { Category } from "@/src/types";

export default function RfqForm() {
  const { t, L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [target, setTarget] = useState("");
  const [destination, setDestination] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: () => api("/rfq", { method: "POST", body: { title, category, quantity, target_price: target || null, destination: destination || null, deadline: deadline || null, notes: notes || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rfq"] }); toast.show(L("Richiesta pubblicata", "Request published")); router.back(); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const submit = () => {
    if (title.trim().length < 3 || !quantity.trim()) return toast.show(L("Indica almeno prodotto e quantità", "Enter at least product and quantity"), "error");
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return toast.show(L("Data nel formato AAAA-MM-GG", "Date as YYYY-MM-DD"), "error");
    save.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Nuova richiesta", "New request")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} bottomOffset={24} testID="rfq-form">
        <Field label={L("Cosa cerchi", "What you need")}><Input testID="rfq-title" value={title} onChangeText={setTitle} placeholder={L("Olio EVO DOP in latta 5L", "PDO EVO oil, 5L tins")} /></Field>
        <Text style={styles.label}>{L("Categoria", "Category")}</Text>
        <View style={styles.chips}>
          {(cats.data ?? []).map((c) => <Chip key={c.slug} label={L(c.name, c.name_en)} selected={category === c.slug} testID={`rfq-cat-${c.slug}`} onPress={() => setCategory(category === c.slug ? null : c.slug)} />)}
        </View>
        <Field label={L("Quantità", "Quantity")}><Input testID="rfq-qty" value={quantity} onChangeText={setQuantity} placeholder="2 pallet / 800 kg" /></Field>
        <Field label={L("Prezzo obiettivo", "Target price")} hint={t("common.optional")}><Input testID="rfq-target" value={target} onChangeText={setTarget} placeholder="€ 8/kg" /></Field>
        <Field label={L("Destinazione", "Destination")} hint={t("common.optional")}><Input testID="rfq-dest" value={destination} onChangeText={setDestination} placeholder="Monaco di Baviera, DE" /></Field>
        <Field label={L("Entro il", "Needed by")} hint={t("common.optional")}><Input testID="rfq-deadline" value={deadline} onChangeText={setDeadline} placeholder="2026-09-30" /></Field>
        <Field label={L("Note e certificazioni richieste", "Notes and required certifications")}><Input testID="rfq-notes" value={notes} onChangeText={setNotes} multiline /></Field>
        <Btn title={L("Pubblica richiesta", "Publish request")} size="lg" testID="rfq-submit" loading={save.isPending} onPress={submit} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  label: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
}));
