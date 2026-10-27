import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted } from "@/src/components/blocks";
import { Btn, CenterLoader, EmptyState, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { PendingAccount } from "@/src/types";

export default function VerifyAccounts() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["admin-pending-accounts"], queryFn: () => api<PendingAccount[]>("/admin/accounts/pending") });
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api(`/admin/accounts/${id}/review`, { method: "PATCH", body: { action } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pending-accounts"] }); qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.show(t("toast.saved")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("accounts.title")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="admin-verify">
        <Muted>{t("accounts.sub")}</Muted>
        <View style={{ height: spacing.md }} />
        {q.isLoading ? <CenterLoader /> : (q.data ?? []).length === 0 ? <EmptyState icon="checkmark-done-outline" title={t("accounts.empty")} /> :
          q.data!.map((a) => (
            <Card key={a.id} testID={`admin-account-${a.id}`}>
              <Text style={styles.name} numberOfLines={1}>{a.company_name}</Text>
              <Muted>{t(`role.${a.role}`)} · {a.email}{a.region ? ` · ${a.region}` : ""}</Muted>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Btn title={t("accounts.approve")} size="sm" variant="secondary" testID={`admin-account-approve-${a.id}`} onPress={() => review.mutate({ id: a.id, action: "approve" })} />
                <Btn title={t("accounts.reject")} size="sm" variant="danger" testID={`admin-account-reject-${a.id}`} onPress={() => review.mutate({ id: a.id, action: "reject" })} />
              </View>
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  name: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
}));
