import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Img } from "@/src/components/Img";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { AdminStats, CuratedPackage, PendingAccount, Product } from "@/src/types";

export default function Admin() {
  const { colors } = useTheme();
  const { t } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const styles = useStyles();

  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => api<AdminStats>("/admin/stats"), enabled: user?.role === "admin" });
  const pending = useQuery({ queryKey: ["admin-pending"], queryFn: () => api<Product[]>("/admin/pending-products"), enabled: user?.role === "admin" });
  const packages = useQuery({ queryKey: ["admin-packages"], queryFn: () => api<CuratedPackage[]>("/packages"), enabled: user?.role === "admin" });
  const pendingAccounts = useQuery({ queryKey: ["admin-pending-accounts"], queryFn: () => api<PendingAccount[]>("/admin/accounts/pending"), enabled: user?.role === "admin" });

  const reviewAccount = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api(`/admin/accounts/${id}/review`, { method: "PATCH", body: { action } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.show(t("toast.saved"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const [showForm, setShowForm] = useState(false);
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/products/${id}/review`, { method: "PATCH", body: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.show(t("toast.saved"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const createPackage = useMutation({
    mutationFn: () =>
      api("/packages", {
        method: "POST",
        body: { name: pName, description: pDesc, price: parseFloat(pPrice.replace(",", ".")), product_ids: selected },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      setShowForm(false);
      setPName(""); setPDesc(""); setPPrice(""); setSelected([]);
      toast.show(t("admin.created"));
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (user?.role !== "admin") {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <ScreenHeader title={t("admin.title")} onBack={() => router.back()} />
        <EmptyState icon="shield-outline" title={t("admin.title")} subtitle={t("common.error")} />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("admin.title")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="admin-panel">
        <Text style={styles.sectionTitle}>{t("admin.stats")}</Text>
        {stats.isLoading ? (
          <CenterLoader />
        ) : (
          <View style={styles.statsGrid} testID="admin-stats-grid">
            {[
              { label: t("admin.users"), value: stats.data?.users },
              { label: t("admin.producers"), value: stats.data?.producers },
              { label: t("admin.productsCount"), value: stats.data?.products },
              { label: t("admin.ordersCount"), value: stats.data?.orders },
              { label: t("admin.agreements"), value: stats.data?.b2b_agreements },
              { label: t("admin.shippings"), value: stats.data?.shipping_requests },
              { label: t("admin.labels"), value: stats.data?.label_requests },
              { label: t("admin.pendingCount"), value: stats.data?.pending_products },
            ].map((s) => (
              <View key={s.label} style={styles.statCard}>
                <Text style={styles.statValue}>{s.value ?? "—"}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable testID="admin-earnings-link" onPress={() => router.push("/earnings")} style={({ pressed }) => [styles.earningsLink, pressed && { opacity: 0.9 }]} accessibilityRole="button">
          <View style={[styles.menuIcon, { backgroundColor: colors.brandSecondary }]}>
            <Ionicons name="cash" size={18} color={colors.onBrandSecondary} />
          </View>
          <Text style={styles.earningsLinkText}>{t("profile.earnings")}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Text style={styles.sectionTitle}>{t("accounts.title")}</Text>
        <Text style={styles.accountsSub}>{t("accounts.sub")}</Text>
        {(pendingAccounts.data ?? []).length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title={t("accounts.empty")} />
        ) : (
          (pendingAccounts.data ?? []).map((a) => (
            <View key={a.id} style={styles.pendingCard} testID={`admin-account-${a.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingName} numberOfLines={1}>{a.company_name}</Text>
                <Text style={styles.pendingMeta}>{t(`role.${a.role}`)} · {a.email}</Text>
                {a.region ? <Text style={styles.pendingMeta}>{a.region}</Text> : null}
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Btn title={t("accounts.approve")} size="sm" variant="secondary" testID={`admin-account-approve-${a.id}`} onPress={() => reviewAccount.mutate({ id: a.id, action: "approve" })} />
                  <Btn title={t("accounts.reject")} size="sm" variant="danger" testID={`admin-account-reject-${a.id}`} onPress={() => reviewAccount.mutate({ id: a.id, action: "reject" })} />
                </View>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>{t("admin.pending")}</Text>
        {pending.isLoading ? (
          <CenterLoader />
        ) : (pending.data ?? []).length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title={t("admin.noPending")} />
        ) : (
          (pending.data ?? []).map((p) => (
            <View key={p.id} style={styles.pendingCard} testID={`admin-pending-${p.id}`}>
              <Img uri={p.image_url} style={styles.pendingImg} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.pendingName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.pendingMeta}>{p.company_name} · €{p.price.toFixed(2)} / {p.unit}</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Btn title={t("admin.approve")} size="sm" variant="secondary" testID={`admin-approve-${p.id}`} onPress={() => review.mutate({ id: p.id, status: "approved" })} />
                  <Btn title={t("admin.reject")} size="sm" variant="danger" testID={`admin-reject-${p.id}`} onPress={() => review.mutate({ id: p.id, status: "rejected" })} />
                </View>
              </View>
            </View>
          ))
        )}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.md }}>
          <Text style={styles.sectionTitle}>{t("admin.packages")}</Text>
          <Btn title={t("admin.newPackage")} size="sm" icon="add" testID="admin-new-package-button" onPress={() => setShowForm(!showForm)} />
        </View>
        {(packages.data ?? []).map((pkg) => (
          <View key={pkg.id} style={styles.pkgRow} testID={`admin-package-${pkg.id}`}>
            <Img uri={pkg.image_url} style={styles.pkgImg} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.pendingName} numberOfLines={1}>{pkg.name}</Text>
              <Text style={styles.pendingMeta}>€{pkg.price.toFixed(2)} · {pkg.items.length} {t("home.items")}</Text>
            </View>
            <Badge label={t("orders.paid") === "Paid" ? "ACTIVE" : "ATTIVO"} tone="success" />
          </View>
        ))}

        {showForm && (
          <View style={styles.formBox} testID="admin-package-form">
            <Field label="Nome">
              <Input testID="admin-package-name" value={pName} onChangeText={setPName} placeholder="Dolce Sicilia" />
            </Field>
            <Field label="Descrizione">
              <Input testID="admin-package-desc" value={pDesc} onChangeText={setPDesc} multiline />
            </Field>
            <Field label="Prezzo (€)">
              <Input testID="admin-package-price" value={pPrice} onChangeText={setPPrice} keyboardType="decimal-pad" />
            </Field>
            <Text style={styles.fieldLabel}>{t("admin.selectProducts")}</Text>
            <ProductSelector selected={selected} onToggle={(pid) => setSelected((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]))} />
            <Btn
              title={t("admin.create")}
              testID="admin-package-submit"
              loading={createPackage.isPending}
              onPress={() => {
                if (!pName || !pDesc || !pPrice || selected.length === 0) {
                  toast.show(t("common.error"), "error");
                  return;
                }
                createPackage.mutate();
              }}
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}

function ProductSelector({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const { colors } = useTheme();
  const query = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  if (query.isLoading) return <CenterLoader />;
  return (
    <View>
      {(query.data ?? []).map((p) => (
        <Pressable
          key={p.id}
          testID={`admin-select-product-${p.id}`}
          onPress={() => onToggle(p.id)}
          style={[styles.selectorRow, selected.includes(p.id) && { borderColor: colors.brandSecondary }]}
          accessibilityRole="button"
        >
          <View style={[styles.selectorBox, selected.includes(p.id) && { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary }]}>
            {selected.includes(p.id) && <Ionicons name="checkmark" size={13} color={colors.onBrandSecondary} />}
          </View>
          <Text style={styles.selectorName} numberOfLines={1}>{p.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginTop: spacing.lg },
  earningsLink: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  menuIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  earningsLinkText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 15, color: colors.onSurface },
  accountsSub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2, marginBottom: spacing.sm },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  statCard: { width: "23%", minWidth: 76, flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  statValue: { fontFamily: fonts.textBold, fontSize: 20, color: colors.brandPrimary },
  statLabel: { fontFamily: fonts.text, fontSize: 10, color: colors.muted, textAlign: "center", marginTop: 2 },
  pendingCard: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, padding: spacing.md, marginTop: spacing.md },
  pendingImg: { width: 64, height: 64, borderRadius: radius.sm },
  pendingName: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  pendingMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  pkgRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, padding: spacing.md, marginBottom: spacing.sm },
  pkgImg: { width: 48, height: 48, borderRadius: radius.sm },
  formBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.md },
  fieldLabel: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm },
  selectorRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: "transparent", borderRadius: radius.sm, paddingHorizontal: spacing.xs },
  selectorBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  selectorName: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurface, flex: 1 },
}));
