import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Card, Notice, fmtDate, fmtEur } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, ErrorBanner, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { BuyerPlan } from "@/src/types";

export default function BuyerPlans() {
  const { colors } = useTheme();
  const { t, L, lang } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["buyer-plans"], queryFn: () => api<{ plans: BuyerPlan[]; current: string; until: string | null }>("/buyer/plans") });
  const sub = useMutation({
    mutationFn: (plan_id: string) => api("/buyer/plans/subscribe", { method: "POST", body: { plan_id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["buyer-plans"] }); toast.show(L("Piano attivato", "Plan activated")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Piani", "Plans")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="buyer-plans">
        {q.isLoading ? <CenterLoader /> : q.isError || !q.data ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> : (
          <>
            {q.data.plans.map((p) => {
              const current = q.data!.current === p.id;
              return (
                <Card key={p.id} testID={`plan-${p.id}`} style={current ? { borderColor: colors.brandPrimary, borderWidth: 2 } : undefined}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={styles.name}>{lang === "en" ? p.name_en : p.name}</Text>
                    {current && <Badge label={L("Attivo", "Active")} tone="success" />}
                  </View>
                  <Text style={styles.price}>{p.price === 0 ? L("Gratis", "Free") : `${fmtEur(p.price)} / ${L("mese", "month")}`}</Text>
                  {(lang === "en" ? p.perks_en : p.perks_it).map((perk) => (
                    <View key={perk} style={styles.perk}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.brandSecondary} />
                      <Text style={styles.perkText}>{perk}</Text>
                    </View>
                  ))}
                  {current && q.data!.until ? <Text style={styles.perkText}>{L("Valido fino al", "Valid until")} {fmtDate(q.data!.until)}</Text> : null}
                  {!current && <Btn title={L("Scegli", "Choose")} size="sm" testID={`plan-choose-${p.id}`} loading={sub.isPending && sub.variables === p.id} onPress={() => sub.mutate(p.id)} style={{ marginTop: spacing.md }} />}
                </Card>
              );
            })}
            <Notice text={L("Pagamento simulato: nessun addebito reale viene effettuato.", "Simulated payment: no real charge is made.")} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  name: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
  price: { fontFamily: fonts.textBold, fontSize: 16, color: colors.brandPrimary, marginVertical: spacing.sm },
  perk: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  perkText: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
}));
