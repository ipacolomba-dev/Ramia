import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ShippingForm() {
  const { colors } = useTheme();
  const { t } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const styles = useStyles();

  const [title, setTitle] = useState("");
  const [cargo, setCargo] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [weight, setWeight] = useState("");
  const [pallets, setPallets] = useState("");
  const [notes, setNotes] = useState("");
  const [shared, setShared] = useState(true);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api("/logistics/requests", {
        method: "POST",
        body: {
          title, cargo_type: cargo, origin, destination,
          ready_date: readyDate || null,
          weight_kg: weight ? parseFloat(weight.replace(",", ".")) : null,
          pallets: pallets ? parseInt(pallets, 10) : null,
          notes: notes || null, shared,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping-requests"] });
      toast.show(t("toast.sent"));
      router.back();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError("");
    if (!title || !cargo || !origin || !destination) {
      setError(t("common.error"));
      return;
    }
    mutation.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("logisticsForm.title")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 130 }} bottomOffset={110}>
        <Text style={styles.subtitle}>{t("logistics.sub")}</Text>
        <Field label="Titolo">
          <Input testID="shipping-form-title" value={title} onChangeText={setTitle} placeholder="Groupage Sicilia → Milano" />
        </Field>
        <Field label={t("logisticsForm.cargo")}>
          <Input testID="shipping-form-cargo" value={cargo} onChangeText={setCargo} placeholder="Agrumi refrigerati" />
        </Field>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t("logisticsForm.origin")}>
              <Input testID="shipping-form-origin" value={origin} onChangeText={setOrigin} placeholder="Catania" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("logisticsForm.destination")}>
              <Input testID="shipping-form-destination" value={destination} onChangeText={setDestination} placeholder="Milano" />
            </Field>
          </View>
        </View>
        <Field label={t("logisticsForm.readyDate")}>
          <Input testID="shipping-form-date" value={readyDate} onChangeText={setReadyDate} placeholder="2026-07-15" />
        </Field>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t("logisticsForm.weight")}>
              <Input testID="shipping-form-weight" value={weight} onChangeText={setWeight} keyboardType="number-pad" placeholder="1200" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("logisticsForm.pallets")}>
              <Input testID="shipping-form-pallets" value={pallets} onChangeText={setPallets} keyboardType="number-pad" placeholder="6" />
            </Field>
          </View>
        </View>
        <Field label={`${t("logisticsForm.notes")} (${t("common.optional")})`}>
          <Input testID="shipping-form-notes" value={notes} onChangeText={setNotes} multiline />
        </Field>
        <Pressable testID="shipping-form-shared-toggle" onPress={() => setShared(!shared)} style={styles.sharedRow} accessibilityRole="button">
          <View style={[styles.sharedBox, shared && { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary }]}>
            {shared && <Ionicons name="checkmark" size={14} color={colors.onBrandSecondary} />}
          </View>
          <Text style={styles.sharedText}>{t("logisticsForm.shared")}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </KeyboardAwareScrollView>
      <KeyboardStickyView bottomOffset={0}>
        <View style={styles.submitBar}>
          <Btn title={t("logisticsForm.submit")} size="lg" testID="shipping-form-submit" loading={mutation.isPending} onPress={submit} />
        </View>
      </KeyboardStickyView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  subtitle: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.lg, lineHeight: 19 },
  sharedRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  sharedBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  sharedText: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface, flex: 1 },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
  submitBar: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
}));
