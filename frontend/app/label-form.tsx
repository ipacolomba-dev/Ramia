import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as ImagePicker from "expo-image-picker";

import { api, uploadImage } from "@/src/api";
import { Img } from "@/src/components/Img";
import { Btn, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const MARKETS = ["USA", "EU", "UK", "Svizzera", "Giappone", "Emirati Arabi", "Canada", "Australia"];

export default function LabelForm() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const styles = useStyles();

  const [productName, setProductName] = useState("");
  const [market, setMarket] = useState("USA");
  const [needs, setNeeds] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api("/labels/requests", {
        method: "POST",
        body: { product_name: productName, target_market: market, needs, image_url: imageUrl },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["label-requests"] });
      toast.show(t("toast.sent"));
      router.back();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError("");
    if (!productName || needs.length < 10) {
      setError(t("common.error"));
      return;
    }
    mutation.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("labelForm.title")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 60 }} bottomOffset={16}>
        <Text style={styles.subtitle}>{t("label.sub")}</Text>
        <Field label={t("label.productName")}>
          <Input testID="label-form-product-input" value={productName} onChangeText={setProductName} placeholder="Pesto di Pistacchio 190g" />
        </Field>
        <Field label={t("label.targetMarket")}>
          <View style={styles.chipsWrap}>
            {MARKETS.map((m) => (
              <Pressable
                key={m}
                testID={`label-form-market-${m}`}
                onPress={() => setMarket(m)}
                style={[styles.chip, market === m && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, market === m && { color: colors.onBrandPrimary }]}>{m}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label={t("label.needs")}>
          <Input testID="label-form-needs-input" value={needs} onChangeText={setNeeds} multiline placeholder={t("label.needsPlaceholder")} />
        </Field>
        <Text style={styles.sectionLabel}>{t("productForm.photo")}</Text>
        <Pressable
          testID="label-photo-picker"
          onPress={async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) return;
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
            if (!result.canceled && result.assets[0]) {
              const res = await uploadImage(result.assets[0].uri, "etichetta.jpg");
              setImageUrl(res.url);
            }
          }}
          style={styles.photoBox}
          accessibilityRole="button"
        >
          {imageUrl ? (
            <Img uri={imageUrl} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>{t("productForm.addPhoto")}</Text>
            </View>
          )}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Btn title={t("labelForm.submit")} size="lg" testID="label-form-submit" loading={mutation.isPending} onPress={submit} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  subtitle: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.lg, lineHeight: 19 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surfaceSecondary },
  chipText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary },
  sectionLabel: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, marginBottom: spacing.sm },
  photoBox: { borderRadius: radius.md, overflow: "hidden", marginBottom: spacing.lg },
  photo: { width: "100%", height: 160, borderRadius: radius.md },
  photoPlaceholder: {
    height: 110,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlaceholderText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.muted },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
}));
