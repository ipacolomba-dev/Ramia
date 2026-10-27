import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, LinkRow, Muted } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, Chip, EmptyState, ErrorBanner, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { AdminUser } from "@/src/types";

const ROLES = ["producer", "business", "consumer", "logistics", "collaborator", "admin"];

export default function AdminUsers() {
  const { t, L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const [role, setRole] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["admin-users", role, search],
    queryFn: () => api<AdminUser[]>(`/admin/users?${new URLSearchParams({ ...(role ? { role } : {}), ...(search ? { q: search } : {}) })}`),
  });
  const suspend = useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) => api(`/admin/users/${id}/suspend`, { method: "PATCH", body: { suspended } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.show(t("toast.saved")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Utenti", "Users")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="admin-users"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        <LinkRow icon="shield-checkmark" label={L("Verifica account in attesa", "Verify pending accounts")} testID="users-verify-link" onPress={() => router.push("/admin/utenti/verifica")} />
        <Input testID="users-search" value={search} onChangeText={setSearch} placeholder={L("Cerca nome, azienda, email", "Search name, company, email")} />
        <View style={styles.chips}>
          <Chip label={L("Tutti", "All")} selected={!role} testID="users-role-all" onPress={() => setRole(null)} />
          {ROLES.map((r) => <Chip key={r} label={t(`role.${r}`)} selected={role === r} testID={`users-role-${r}`} onPress={() => setRole(r)} />)}
        </View>
        {q.isLoading ? <CenterLoader /> : q.isError ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> :
          (q.data ?? []).length === 0 ? <EmptyState icon="people-outline" title={L("Nessun utente", "No users")} /> :
          q.data!.map((u) => (
            <Card key={u.id} testID={`admin-user-${u.id}`}>
              <Text style={styles.name} numberOfLines={1}>{u.company_name || u.name}</Text>
              <Muted>{u.email} · {t(`role.${u.role}`)}{u.region ? ` · ${u.region}` : ""}</Muted>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm, alignItems: "center" }}>
                {!u.approved && <Badge label={L("Da approvare", "Pending")} tone="warning" />}
                {u.suspended && <Badge label={L("Sospeso", "Suspended")} tone="error" />}
                {!u.email_verified && <Badge label={L("Email non verificata", "Email unverified")} tone="neutral" />}
                {u.role !== "admin" && (
                  <Btn title={u.suspended ? L("Riattiva", "Reactivate") : L("Sospendi", "Suspend")} size="sm" variant={u.suspended ? "secondary" : "danger"}
                    testID={`admin-user-suspend-${u.id}`} onPress={() => suspend.mutate({ id: u.id, suspended: !u.suspended })} />
                )}
              </View>
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.md },
  name: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
}));
