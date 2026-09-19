import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useCart, CartItem } from "@/src/cart";
import { Img } from "@/src/components/Img";
import { Btn, CenterLoader, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { CuratedPackage, Order } from "@/src/types";

export default function Checkout() {
  const { colors } = useTheme();
  const { t, lang } = useT();
  const { user } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const params = useLocalSearchParams<{ package?: string }>();

  const [items, setItems] = useState<CartItem[]>([]);
  const [pkg, setPkg] = useState<CuratedPackage | null>(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);

  const packageQuery = useQuery({
    queryKey: ["packages", params.package],
    queryFn: () => api<CuratedPackage[]>("/packages"),
    enabled: !!user && !orderId,
  });

  useEffect(() => {
    if (!user) return;
    if (params.package && packageQuery.data) {
      const found = packageQuery.data.find((p) => p.id === params.package) ?? null;
      setPkg(found);
    } else {
      setItems(cart.items);
    }
  }, [user, params.package, packageQuery.data]);

  const total = pkg ? pkg.price : items.reduce((s, i) => s + i.price * i.qty, 0);

  const order = useMutation({
    mutationFn: () =>
      api<Order>("/orders", {
        method: "POST",
        body: {
          items: pkg ? [] : items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
          package_id: pkg?.id ?? null,
          address, city, zip, phone, notes: notes || null,
        },
      }),
    onSuccess: (data) => {
      setOrderId(data.id);
      if (!pkg) cart.clear();
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.show(t("checkout.success"));
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!user) {
    return (
      <Screen>
        <ScreenHeader title={t("checkout.title")} onBack={() => router.back()} />
        <View style={styles.loginBox}>
          <Text style={styles.loginText}>{t("welcome.guestHint")}</Text>
          <Btn title={t("auth.login")} testID="checkout-login-button" onPress={() => router.push("/auth/login")} />
        </View>
      </Screen>
    );
  }

  if (orderId) {
    return (
      <Screen style={{ justifyContent: "center" }}>
        <View style={styles.successBox} testID="checkout-success-view">
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={40} color={colors.onSuccess} />
          </View>
          <Text style={styles.successTitle}>{t("checkout.success")}</Text>
          <Text style={styles.successSub}>{t("checkout.successSub")}</Text>
          <Btn title={t("checkout.orders")} testID="checkout-view-orders" onPress={() => router.replace("/orders")} />
          <Btn title={t("checkout.keepShopping")} variant="ghost" onPress={() => router.replace("/(tabs)")} style={{ marginTop: spacing.sm }} />
        </View>
      </Screen>
    );
  }

  const displayItems = pkg
    ? pkg.items.map((i) => ({ product_id: i.id, name: i.name, price: i.price, unit: i.unit, qty: 1, image_url: null, company_name: "" }))
    : items;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("checkout.title")} onBack={() => router.back()} />
      <View style={{ flex: 1 }}>
        {pkg ? (
          <View style={styles.pkgBox} testID="checkout-package-summary">
            <Img uri={pkg.image_url} style={styles.pkgImg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pkgName}>{lang === "en" && pkg.name_en ? pkg.name_en : pkg.name}</Text>
              <Text style={styles.pkgDesc} numberOfLines={2}>{pkg.description}</Text>
            </View>
          </View>
        ) : displayItems.length === 0 ? (
          <View style={styles.emptyCart} testID="checkout-empty-cart">
            <Ionicons name="basket-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyCartTitle}>{t("cart.empty")}</Text>
            <Text style={styles.emptyCartSub}>{t("cart.emptySub")}</Text>
            <Btn title={t("checkout.keepShopping")} onPress={() => router.replace("/(tabs)")} testID="checkout-back-to-market" />
          </View>
        ) : (
          <View>
            {displayItems.map((i) => (
              <View key={i.product_id} style={styles.itemRow} testID={`checkout-item-${i.product_id}`}>
                <Img uri={i.image_url} style={styles.itemImg} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.itemName} numberOfLines={1}>{i.name}</Text>
                  <Text style={styles.itemMeta}>€{i.price.toFixed(2)} / {i.unit}</Text>
                </View>
                <View style={styles.qtyCol}>
                  <View style={styles.qtyRow}>
                    <Pressable
                      testID={`checkout-qty-minus-${i.product_id}`}
                      onPress={() => cart.setQty(i.product_id, i.qty - 1)}
                      style={styles.qtyBtn}
                      accessibilityRole="button"
                    >
                      <Ionicons name="remove" size={15} color={colors.onSurface} />
                    </Pressable>
                    <Text style={styles.qtyValue}>{i.qty}</Text>
                    <Pressable
                      testID={`checkout-qty-plus-${i.product_id}`}
                      onPress={() => cart.setQty(i.product_id, i.qty + 1)}
                      style={styles.qtyBtn}
                      accessibilityRole="button"
                    >
                      <Ionicons name="add" size={15} color={colors.onSurface} />
                    </Pressable>
                  </View>
                  <Text style={styles.lineTotal}>€{(i.price * i.qty).toFixed(2)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {displayItems.length > 0 && (
          <View style={styles.addressBox}>
            <Text style={styles.addressTitle}>{t("checkout.address")}</Text>
            <Field label={t("checkout.name")}>
              <Input testID="checkout-name-input" value={user.company_name || user.name} editable={false} />
            </Field>
            <Field label={t("checkout.street")}>
              <Input testID="checkout-address-input" value={address} onChangeText={setAddress} placeholder="Via dei Mille 12" />
            </Field>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field label={t("checkout.city")}>
                  <Input testID="checkout-city-input" value={city} onChangeText={setCity} placeholder="Palermo" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t("checkout.zip")}>
                  <Input testID="checkout-zip-input" value={zip} onChangeText={setZip} keyboardType="number-pad" placeholder="90100" />
                </Field>
              </View>
            </View>
            <Field label={t("checkout.phone")}>
              <Input testID="checkout-phone-input" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+39 320 1234567" />
            </Field>
            <Field label={`${t("checkout.notes")} (${t("common.optional")})`}>
              <Input testID="checkout-notes-input" value={notes} onChangeText={setNotes} multiline />
            </Field>
            {error ? (
              <Text style={styles.error} testID="checkout-error-text">{error}</Text>
            ) : null}
          </View>
        )}
      </View>

      {displayItems.length > 0 && (
        <View style={[styles.payBar, { paddingBottom: insets.bottom + spacing.md }]} testID="checkout-pay-bar">
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLabel}>{t("common.total")}</Text>
            <Text style={styles.totalValue}>€{total.toFixed(2)}</Text>
            <Text style={styles.simulated}>{t("orders.simulated")}</Text>
          </View>
          <Btn
            title={t("checkout.pay")}
            size="lg"
            icon="card"
            testID="checkout-pay-button"
            loading={order.isPending}
            style={{ flex: 1 }}
            onPress={() => {
              setError("");
              if (!address || !city || !zip || !phone) {
                setError(t("common.error"));
                return;
              }
              order.mutate();
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  loginBox: { padding: spacing.xl, alignItems: "center", gap: spacing.md },
  loginText: { fontFamily: fonts.text, fontSize: 14, color: colors.muted, textAlign: "center" },
  successBox: { alignItems: "center", padding: spacing.xl },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  successTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface, textAlign: "center" },
  successSub: { fontFamily: fonts.text, fontSize: 14, color: colors.muted, textAlign: "center", marginVertical: spacing.md, lineHeight: 20 },
  pkgBox: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, marginHorizontal: spacing.lg, borderRadius: radius.md, marginTop: spacing.sm },
  pkgImg: { width: 72, height: 72, borderRadius: radius.sm },
  pkgName: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  pkgDesc: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  emptyCart: { alignItems: "center", paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyCartTitle: { fontFamily: fonts.textBold, fontSize: 17, color: colors.onSurface },
  emptyCartSub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.md },
  itemRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemImg: { width: 52, height: 52, borderRadius: radius.sm },
  itemName: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  itemMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  qtyCol: { alignItems: "flex-end" },
  qtyRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm },
  qtyBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  qtyValue: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, minWidth: 22, textAlign: "center" },
  lineTotal: { fontFamily: fonts.textBold, fontSize: 13, color: colors.brandPrimary, marginTop: 3 },
  addressBox: { padding: spacing.lg },
  addressTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginBottom: spacing.md },
  payBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary },
  totalLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  totalValue: { fontFamily: fonts.textBold, fontSize: 22, color: colors.brandPrimary },
  simulated: { fontFamily: fonts.text, fontSize: 10, color: colors.muted },
}));
