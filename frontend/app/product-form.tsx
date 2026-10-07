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
  const [priceWholesale, setPriceWholesale] = useState("");
  const [moq, setMoq] = useState("");
  const [packPerCarton, setPackPerCarton] = useState("");
  const [cartonsPerLayer, setCartonsPerLayer] = useState("");
  const [cartonsPerPallet, setCartonsPerPallet] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [allergens, setAllergens] = useState("");
  const [shelfLife, setShelfLife] = useState("");
  const [netWeight, setNetWeight] = useState("");
  const [packaging, setPackaging] = useState("");
  const [aiDesc, setAiDesc] = useState("");
  const [aiSheet, setAiSheet] = useState(false);
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
      setPriceWholesale(p.price_wholesale != null ? String(p.price_wholesale) : "");
      setMoq(p.moq != null ? String(p.moq) : "");
      setPackPerCarton(p.pack_per_carton != null ? String(p.pack_per_carton) : "");
      setCartonsPerLayer(p.cartons_per_layer != null ? String(p.cartons_per_layer) : "");
      setCartonsPerPallet(p.cartons_per_pallet != null ? String(p.cartons_per_pallet) : "");
      setIngredients(p.ingredients ?? "");
      setAllergens(p.allergens ?? "");
      setShelfLife(p.shelf_life ?? "");
      setNetWeight(p.net_weight ?? "");
      setPackaging(p.packaging ?? "");
    }
  }, [existing.data]);

  const buildBody = () => ({
    name, name_en: nameEn || null, description, description_en: descriptionEn || null,
    category, price: parseFloat(price.replace(",", ".")), unit,
    stock: parseFloat(stock.replace(",", ".")), image_url: imageUrl,
    price_wholesale: priceWholesale ? parseFloat(priceWholesale.replace(",", ".")) : null,
    moq: moq ? parseFloat(moq.replace(",", ".")) : null,
    pack_per_carton: packPerCarton ? parseInt(packPerCarton, 10) : null,
    cartons_per_layer: cartonsPerLayer ? parseInt(cartonsPerLayer, 10) : null,
    cartons_per_pallet: cartonsPerPallet ? parseInt(cartonsPerPallet, 10) : null,
    ingredients: ingredients || null,
    allergens: allergens || null,
    shelf_life: shelfLife || null,
    net_weight: netWeight || null,
    packaging: packaging || null,
  });

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? api(`/products/${id}`, { method: "PATCH", body: buildBody() })
        : api("/products", { method: "POST", body: buildBody() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["my-products"] });
      toast.show(t("toast.saved"));
      router.back();
    },
    onError: (e: Error) => setError(e.message),
  });

  const aiDraft = useMutation({
    mutationFn: () => api<any>("/ai/product-draft", { method: "POST", body: { description: aiDesc, category } }),
    onSuccess: (d) => {
      setName(d.name || name);
      setNameEn(d.name_en || nameEn);
      setDescription(d.description || description);
      setDescriptionEn(d.description_en || descriptionEn);
      if (d.category) setCategory(d.category);
      if (d.price) setPrice(String(d.price));
      if (d.unit) setUnit(d.unit);
      if (d.price_wholesale) setPriceWholesale(String(d.price_wholesale));
      if (d.moq) setMoq(String(d.moq));
      if (d.pack_per_carton) setPackPerCarton(String(d.pack_per_carton));
      if (d.cartons_per_pallet) setCartonsPerPallet(String(d.cartons_per_pallet));
      setAiSheet(false);
      setAiDesc("");
      toast.show(t("productForm.aiApplied"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
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
        <Pressable testID="product-ai-open" onPress={() => setAiSheet(true)} style={({ pressed }) => [styles.aiCard, pressed && { opacity: 0.9 }]} accessibilityRole="button">
          <View style={styles.aiIcon}>
            <Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiTitle}>{t("productForm.aiTitle")}</Text>
            <Text style={styles.aiSub}>{t("productForm.aiDescribe")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.brandPrimary} />
        </Pressable>

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

        <Text style={styles.sectionLabel}>{t("productForm.wholesaleSection")}</Text>
        <Text style={styles.wholesaleHint}>{t("wholesale.forBusiness")}</Text>
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Field label={t("productForm.priceWholesale")}>
              <Input testID="product-form-price-wholesale" value={priceWholesale} onChangeText={setPriceWholesale} keyboardType="decimal-pad" placeholder="9.90" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("productForm.moq")}>
              <Input testID="product-form-moq" value={moq} onChangeText={setMoq} keyboardType="number-pad" placeholder="50" />
            </Field>
          </View>
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Field label={t("productForm.packPerCarton")}>
              <Input testID="product-form-pack-carton" value={packPerCarton} onChangeText={setPackPerCarton} keyboardType="number-pad" placeholder="12" />
            </Field>
          </View>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Field label={t("productForm.cartonsPerLayer")}>
              <Input testID="product-form-cartons-layer" value={cartonsPerLayer} onChangeText={setCartonsPerLayer} keyboardType="number-pad" placeholder="8" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("productForm.cartonsPerPallet")}>
              <Input testID="product-form-cartons-pallet" value={cartonsPerPallet} onChangeText={setCartonsPerPallet} keyboardType="number-pad" placeholder="48" />
            </Field>
          </View>
        </View>

        <Text style={styles.sectionLabel}>{t("productForm.complianceSection")}</Text>
        <Text style={styles.wholesaleHint}>{t("productForm.complianceHint")}</Text>
        <Field label={t("productForm.ingredients")}>
          <Input testID="product-form-ingredients" value={ingredients} onChangeText={setIngredients} multiline placeholder="Olive, sale…" />
        </Field>
        <Field label={t("productForm.allergens")}>
          <Input testID="product-form-allergens" value={allergens} onChangeText={setAllergens} placeholder="Glutine, frutta a guscio…" />
        </Field>
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Field label={t("productForm.netWeight")}>
              <Input testID="product-form-net-weight" value={netWeight} onChangeText={setNetWeight} placeholder="500 g" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("productForm.shelfLife")}>
              <Input testID="product-form-shelf-life" value={shelfLife} onChangeText={setShelfLife} placeholder="18 mesi" />
            </Field>
          </View>
        </View>
        <Field label={t("productForm.packaging")}>
          <Input testID="product-form-packaging" value={packaging} onChangeText={setPackaging} placeholder="Vetro, bottiglia 500ml…" />
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

      <Sheet visible={aiSheet} onClose={() => setAiSheet(false)} title={t("productForm.aiTitle")}>
        <Text style={styles.sheetBody}>{t("productForm.aiDescribe")}</Text>
        <Input testID="product-ai-input" value={aiDesc} onChangeText={setAiDesc} multiline placeholder={t("productForm.aiPlaceholder")} />
        <Btn
          title={t("productForm.aiGenerate")}
          icon="sparkles"
          testID="product-ai-generate"
          loading={aiDraft.isPending}
          onPress={() => aiDesc.trim().length >= 5 && aiDraft.mutate()}
          style={{ marginTop: spacing.md }}
        />
        <Btn title={t("common.cancel")} variant="ghost" onPress={() => setAiSheet(false)} style={{ marginTop: spacing.sm }} />
      </Sheet>

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
  wholesaleHint: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginBottom: spacing.md },
  aiCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  aiIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  aiTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onBrandTertiary },
  aiSub: { fontFamily: fonts.text, fontSize: 12, color: colors.onBrandTertiary, marginTop: 1 },
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
