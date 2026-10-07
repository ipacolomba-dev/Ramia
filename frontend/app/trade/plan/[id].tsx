import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Btn, CenterLoader, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { ExportPlan, PlanStep } from "@/src/types";

const ACTION_ROUTE: Record<string, string> = {
  label_lab: "/label-form",
  logistics: "/shipping-form",
  b2b: "/trade/buyers",
};

export default function TradePlan() {
  const { colors } = useTheme();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const styles = useStyles();

  const plan = useQuery({ queryKey: ["export-plan", id], queryFn: () => api<ExportPlan>(`/trade/export-plans/${id}`) });

  const toggle = useMutation({
    mutationFn: ({ stepId, done }: { stepId: string; done: boolean }) =>
      api(`/trade/export-plans/${id}/steps/${stepId}`, { method: "PATCH", body: { done } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["export-plan", id] }),
  });

  if (plan.isLoading) return <CenterLoader />;
  if (plan.isError || !plan.data)
    return (
      <Screen>
        <ScreenHeader title={t("trade.exportPlan")} onBack={() => router.back()} />
        <ErrorBanner message={t("common.error")} onRetry={() => plan.refetch()} />
      </Screen>
    );

  const p = plan.data;
  const doneCount = p.steps.filter((s) => s.done).length;

  const actionLabel = (kind: string) =>
    kind === "logistics" ? t("trade.findTransport") : kind === "b2b" ? t("trade.findBuyers") : t("trade.requestLab");

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("trade.exportPlan")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="trade-plan">
        <View style={styles.header}>
          <Text style={styles.product}>{p.product_name}</Text>
          <Text style={styles.country}>{p.country} · {doneCount}/{p.steps.length}</Text>
        </View>

        {p.steps.map((s: PlanStep, i) => (
          <View key={s.id} style={styles.step} testID={`plan-step-${s.type}`}>
            <Pressable testID={`plan-step-toggle-${i}`} onPress={() => toggle.mutate({ stepId: s.id, done: !s.done })} style={[styles.check, s.done && { backgroundColor: colors.success, borderColor: colors.success }]}>
              {s.done && <Ionicons name="checkmark" size={16} color={colors.onSuccess} />}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepTitle, s.done && { textDecorationLine: "line-through", color: colors.muted }]}>{s.title}</Text>
              <Text style={styles.stepDesc}>{s.description}</Text>
              {s.action && ACTION_ROUTE[s.action.kind] ? (
                <Btn
                  title={actionLabel(s.action.kind)}
                  size="sm"
                  variant="outline"
                  testID={`plan-step-action-${s.type}`}
                  onPress={() => router.push((s.action!.kind === "b2b" ? `/trade/buyers?country=${encodeURIComponent(p.country)}` : ACTION_ROUTE[s.action!.kind]) as any)}
                  style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}
                />
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  header: { marginBottom: spacing.lg },
  product: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  country: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.brandSecondary, marginTop: 2 },
  step: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginTop: 2 },
  stepTitle: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  stepDesc: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2, lineHeight: 18 },
}));
