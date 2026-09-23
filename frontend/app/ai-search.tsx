import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useCart } from "@/src/cart";
import { ProductCard } from "@/src/components/ProductCard";
import { Btn, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { AiSearchResult } from "@/src/types";

export default function AiSearch() {
  const { colors } = useTheme();
  const { t, lang } = useT();
  const router = useRouter();
  const cart = useCart();
  const toast = useToast();
  const styles = useStyles();

  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState("");
  const [destination, setDestination] = useState("");
  const [budget, setBudget] = useState("");

  const search = useMutation({
    mutationFn: () =>
      api<AiSearchResult>("/ai/search", {
        method: "POST",
        body: { query, quantity: quantity || null, destination: destination || null, budget: budget || null },
      }),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const result = search.data;
  const rows: any[][] = [];
  const prods = result?.products ?? [];
  for (let i = 0; i < prods.length; i += 2) rows.push(prods.slice(i, i + 2));

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("aiSearch.title")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} bottomOffset={16}>
        <Text style={styles.sub}>{t("aiSearch.sub")}</Text>
        <Field label={t("aiSearch.title")}>
          <Input testID="ai-search-query" value={query} onChangeText={setQuery} placeholder={t("aiSearch.placeholder")} multiline />
        </Field>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={`${t("aiSearch.quantity")} (${t("common.optional")})`}>
              <Input testID="ai-search-quantity" value={quantity} onChangeText={setQuantity} placeholder="500 kg" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={`${t("aiSearch.budget")} (${t("common.optional")})`}>
              <Input testID="ai-search-budget" value={budget} onChangeText={setBudget} placeholder="€2000" />
            </Field>
          </View>
        </View>
        <Field label={`${t("aiSearch.destination")} (${t("common.optional")})`}>
          <Input testID="ai-search-destination" value={destination} onChangeText={setDestination} placeholder="Milano" />
        </Field>
        <Btn
          title={t("aiSearch.search")}
          icon="sparkles"
          size="lg"
          testID="ai-search-submit"
          loading={search.isPending}
          onPress={() => query.trim() && search.mutate()}
        />

        {result && (
          <View style={{ marginTop: spacing.xl }} testID="ai-search-results">
            {result.answer ? (
              <View style={styles.savings}>
                <View style={styles.savingsHead}>
                  <Ionicons name="bulb" size={16} color={colors.onBrandSecondary} />
                  <Text style={styles.savingsTitle}>{t("aiSearch.savings")}</Text>
                </View>
                <Text style={styles.savingsText}>{result.answer}</Text>
                {result.shipment_id ? (
                  <Btn
                    title={t("aiSearch.viewShipment")}
                    variant="outline"
                    size="sm"
                    icon="cube"
                    testID="ai-search-shipment"
                    onPress={() => router.push(`/shipping/${result.shipment_id}`)}
                    style={{ marginTop: spacing.md }}
                  />
                ) : null}
              </View>
            ) : null}

            <Text style={styles.resultsTitle}>{t("aiSearch.results")}</Text>
            {prods.length === 0 ? (
              <Text style={styles.noResults}>{t("aiSearch.noResults")}</Text>
            ) : (
              rows.map((row, idx) => (
                <View key={idx} style={styles.gridRow}>
                  {row.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onPress={() => router.push(`/product/${p.id}`)}
                      onAdd={
                        p.stock > 0
                          ? () => {
                              cart.add({
                                product_id: p.id,
                                name: lang === "en" && p.name_en ? p.name_en : p.name,
                                price: p.price,
                                unit: p.unit,
                                image_url: p.image_url,
                                company_name: p.company_name,
                              });
                              toast.show(t("toast.addedToCart"));
                            }
                          : undefined
                      }
                    />
                  ))}
                  {row.length === 1 && <View style={{ flex: 1 }} />}
                </View>
              ))
            )}
          </View>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  sub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.lg, lineHeight: 19 },
  savings: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg },
  savingsHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  savingsTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onBrandTertiary },
  savingsText: { fontFamily: fonts.text, fontSize: 13, color: colors.onBrandTertiary, lineHeight: 20 },
  resultsTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  noResults: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  gridRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
}));
