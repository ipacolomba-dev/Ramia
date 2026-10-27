import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api } from "@/src/api";
import { Btn, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { B2BOffer } from "@/src/types";

const CATEGORIES = ["olio", "formaggi", "frutta_secca", "agrumi", "dolci", "pasta", "vino", "conserve"];

export default function B2BOfferForm() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const styles = useStyles();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("olio");
  const [moq, setMoq] = useState("");
  const [unit, setUnit] = useState("kg");
  const [unitPrice, setUnitPrice] = useState("");
  const [origin, setOrigin] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api<B2BOffer>("/b2b/offers", {
        method: "POST",
        body: {
          title,
          description,
          category,
          moq: parseFloat(moq.replace(",", ".")),
          unit,
          unit_price: parseFloat(unitPrice.replace(",", ".")),
          origin_region: origin || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["b2b-offers"] });
      toast.show(t("toast.sent"));
      router.back();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError("");
    if (!title || !description || !moq || !unitPrice) {
      setError(t("common.error"));
      return;
    }
    mutation.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("b2bOfferForm.title")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 60 }} bottomOffset={16}>
        <Text style={styles.subtitle}>{t("b2bOfferForm.subtitle")}</Text>
        <Field label="Titolo">
          <Input testID="b2b-offer-title-input" value={title} onChangeText={setTitle} placeholder="Olio EVO DOP — Taniche 5L" />
        </Field>
        <Field label="Categoria">
          <View style={styles.chipsWrap}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                testID={`b2b-offer-category-${c}`}
                onPress={() => setCategory(c)}
                style={[styles.chip, category === c && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, category === c && { color: colors.onBrandPrimary }]}>{t(`cat.${c}`)}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t("b2b.moq")}>
              <Input testID="b2b-offer-moq-input" value={moq} onChangeText={setMoq} keyboardType="decimal-pad" placeholder="200" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Unità">
              <Input testID="b2b-offer-unit-input" value={unit} onChangeText={setUnit} placeholder="kg" />
            </Field>
          </View>
        </View>
        <Field label={`${t("common.price")} per unità (€)`}>
          <Input testID="b2b-offer-price-input" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="13.20" />
        </Field>
        <Field label="Origine">
          <Input testID="b2b-offer-origin-input" value={origin} onChangeText={setOrigin} placeholder="Ragusa, Sicilia" />
        </Field>
        <Field label="Descrizione">
          <Input testID="b2b-offer-description-input" value={description} onChangeText={setDescription} multiline placeholder="Imballo, certificazioni, logistica…" />
        </Field>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Btn title={t("b2bOfferForm.submit")} size="lg" testID="b2b-offer-submit" loading={mutation.isPending} onPress={submit} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  subtitle: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.lg, lineHeight: 19 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surfaceSecondary },
  chipText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
}));
