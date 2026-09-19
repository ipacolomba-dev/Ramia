import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as ImagePicker from "expo-image-picker";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";

import { api, uploadImage } from "@/src/api";
import { Img } from "@/src/components/Img";
import { Btn, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Product } from "@/src/types";

const CATEGORIES = ["olio", "formaggi", "frutta_secca", "agrumi", "dolci", "pasta", "vino", "conserve"];
const UNITS = ["kg", "g", "L", "0,5 L", "0,75 L", "pz", "kit"];

export default function ProductForm() {
  const { colors } = useTheme();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const styles = useStyles();
  const isEdit = !!id;

  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [category, setCategory] = useState("olio");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("kg");
  const [stock, setStock] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [permState, setPermState] = useState<"idle" | "explain" | "settings">("idle");

  const existing = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<Product>(`/products/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing.data) {
      const p = existing.data;
      setName(p.name);
      setNameEn(p.name_en ?? "");
      setCategory(p.category);
      setPrice(String(p.price));
      setUnit(p.unit);
      setStock(String(p.stock));
      setDescription(p.description);
      setDescriptionEn(p.description_en ?? "");
      setImageUrl(p.image_url);
    }
  }, [existing.data]);

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? api(`/products/${id}`, {
            method: "PATCH",
            body: {
              name, name_en: nameEn || null, description, description_en: descriptionEn || null,
              category, price: parseFloat(price.replace(",", ".")), unit,
              stock: parseFloat(stock.replace(",", ".")), image_url: imageUrl,
            },
          })
        : api("/products", {
            method: "POST",
            body: {
              name, name_en: nameEn || null, description, description_en: descriptionEn || null,
              category, price: parseFloat(price.replace(",", ".")), unit,
              stock: parseFloat(stock.replace(",", ".")), image_url: imageUrl,
            },
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["my-products"] });
      toast.show(t("toast.saved"));
      router.back();
    },
    onError: (e: Error) => setError(e.message),
  });

  const launchPicker = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      try {
        const res = await uploadImage(result.assets[0].uri, "prodotto.jpg");
        setImageUrl(res.url);
        toast.show(t("toast.saved"));
      } catch (e: any) {
        setError(e?.message ?? t("common.error"));
      }
    }
  };

  const onAddPhoto = async () => {
    // Pre-permission explanation, then native prompt (contextual to this tap).
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) {
      launchPicker();
      return;
    }
    if (current.canAskAgain) {
      setPermState("explain");
      return;
    }
    setPermState("settings");
  };

  const requestAndPick = async () => {
    setPermState("idle");
    const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (req.granted) {
      launchPicker();
    } else {
      setPermState("settings");
    }
  };

  const submit = () => {
    setError("");
    if (!name || !price || !description || !stock) {
      setError(t("common.error"));
      return;
    }
    mutation.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={isEdit ? t("productForm.editTitle") : t("productForm.title")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 120 }} bottomOffset={90}>
        <Text style={styles.sectionLabel}>{t("productForm.photo")}</Text>
        <Pressable testID="product-photo-picker" onPress={onAddPhoto} style={styles.photoBox} accessibilityRole="button">
          {imageUrl ? (
            <View>
              <Img uri={imageUrl} style={styles.photo} />
              <View style={styles.photoOverlay}>
                <Ionicons name="camera" size={18} color="#FFFFFF" />
                <Text style={styles.photoOverlayText}>{t("productForm.changePhoto")}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera-outline" size={30} color={colors.muted} />
              <Text style={styles.photoPlaceholderText}>{t("productForm.addPhoto")}</Text>
            </View>
          )}
        </Pressable>

        <Field label={t("productForm.name")}>
          <Input testID="product-form-name" value={name} onChangeText={setName} placeholder="Olio EVO Nocellara 750ml" />
        </Field>
        <Field label={`${t("productForm.nameEn")} (${t("common.optional")})`}>
          <Input testID="product-form-name-en" value={nameEn} onChangeText={setNameEn} placeholder="EVO Olive Oil 750ml" />
        </Field>
        <Field label={t("productForm.category")}>
          <View style={styles.chipsWrap}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                testID={`product-form-category-${c}`}
                onPress={() => setCategory(c)}
                style={[styles.chip, category === c && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, category === c && { color: colors.onBrandPrimary }]}>{t(`cat.${c}`)}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Field label={t("productForm.price")}>
              <Input testID="product-form-price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="12.90" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("productForm.stock")}>
              <Input testID="product-form-stock" value={stock} onChangeText={setStock} keyboardType="number-pad" placeholder="50" />
            </Field>
          </View>
        </View>
        <Field label={t("productForm.unit")}>
          <View style={styles.chipsWrap}>
            {UNITS.map((u) => (
              <Pressable
                key={u}
                testID={`product-form-unit-${u}`}
                onPress={() => setUnit(u)}
                style={[styles.chip, unit === u && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, unit === u && { color: colors.onBrandPrimary }]}>{u}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label={t("productForm.description")}>
          <Input testID="product-form-description" value={description} onChangeText={setDescription} multiline placeholder="Raccolta a mano, spremitura a freddo…" />
        </Field>
        <Field label={`${t("productForm.descriptionEn")} (${t("common.optional")})`}>
          <Input testID="product-form-description-en" value={descriptionEn} onChangeText={setDescriptionEn} multiline />
        </Field>

        {error ? (
          <Text style={styles.error} testID="product-form-error-text">
            {error}
          </Text>
        ) : null}
        <Text style={styles.hint}>{t("productForm.submitPending")}</Text>
      </KeyboardAwareScrollView>

      <KeyboardStickyView bottomOffset={0}>
        <View style={[styles.submitBar, { paddingBottom: spacing.md }]}>
          <Btn
            title={isEdit ? t("productForm.update") : t("productForm.submit")}
            size="lg"
            testID="product-form-submit"
            loading={mutation.isPending}
            onPress={submit}
          />
        </View>
      </KeyboardStickyView>

      <Sheet visible={permState === "explain"} onClose={() => setPermState("idle")} title={t("productForm.photo")}>
        <Text style={styles.sheetBody}>{t("productForm.photoHelp")}</Text>
        <Btn title={t("productForm.continue")} testID="photo-permission-continue" onPress={requestAndPick} />
        <Btn title={t("common.cancel")} variant="ghost" onPress={() => setPermState("idle")} style={{ marginTop: spacing.sm }} />
      </Sheet>
      <Sheet visible={permState === "settings"} onClose={() => setPermState("idle")} title={t("productForm.photo")}>
        <Text style={styles.sheetBody}>{t("productForm.photoHelp")}</Text>
        <Btn title={t("productForm.openSettings")} icon="settings-outline" testID="photo-open-settings" onPress={() => Linking.openSettings()} />
        <Btn title={t("common.cancel")} variant="ghost" onPress={() => setPermState("idle")} style={{ marginTop: spacing.sm }} />
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  sectionLabel: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, marginBottom: spacing.sm, marginTop: spacing.md },
  photoBox: { marginBottom: spacing.lg, borderRadius: radius.md, overflow: "hidden" },
  photo: { width: "100%", height: 180, borderRadius: radius.md },
  photoOverlay: {
    ...({} as any),
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(44,34,30,0.6)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    gap: spacing.xs,
  },
  photoOverlayText: { color: "#FFFFFF", fontFamily: fonts.textBold, fontSize: 12 },
  photoPlaceholder: {
    height: 140,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  photoPlaceholderText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.muted },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surfaceSecondary },
  chipText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary },
  row: { flexDirection: "row" },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
  hint: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.md },
  submitBar: { paddingHorizontal: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md },
  sheetBody: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 20, marginBottom: spacing.lg },
}));
