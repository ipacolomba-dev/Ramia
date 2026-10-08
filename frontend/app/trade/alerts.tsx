import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Btn, CenterLoader, Chip, EmptyState, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { RegAlert, RegMonitor } from "@/src/types";

const TYPE_ICON: Record<string, string> = {
  version: "git-branch",
  requirement_new: "add-circle",
  requirement_verified: "checkmark-done-circle",
  source_change: "pulse",
};

const ALERT_TYPES = ["version", "requirement_new", "requirement_verified", "source_change"];
const SEVERITIES = ["high", "medium", "low"];

export default function TradeAlerts() {
  const { t } = useT();
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"alerts" | "monitors">("alerts");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<string | null>(null);

  const alertsQuery = typeFilter || sevFilter
    ? `/regulatory/alerts?${[typeFilter ? `type=${typeFilter}` : "", sevFilter ? `severity=${sevFilter}` : ""].filter(Boolean).join("&")}`
    : "/regulatory/alerts";
  const alerts = useQuery({ queryKey: ["reg-alerts", typeFilter, sevFilter], queryFn: () => api<RegAlert[]>(alertsQuery) });
  const monitors = useQuery({ queryKey: ["reg-monitors"], queryFn: () => api<RegMonitor[]>("/regulatory/monitors") });

  const invalidateAlerts = () => {
    qc.invalidateQueries({ queryKey: ["reg-alerts"] });
    qc.invalidateQueries({ queryKey: ["reg-alerts-unread"] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/regulatory/alerts/${id}/read`, { method: "POST" }),
    onSuccess: invalidateAlerts,
  });

  const markAllRead = useMutation({
    mutationFn: () => api("/regulatory/alerts/read-all", { method: "POST" }),
    onSuccess: () => { invalidateAlerts(); toast.show(t("toast.saved")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const stopMonitor = useMutation({
    mutationFn: (id: string) => api(`/regulatory/monitors/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reg-monitors"] }); toast.show(t("toast.saved")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const runDetection = useMutation({
    mutationFn: () => api("/regulatory/change-detection/run", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reg-alerts"] }); toast.show(t("alerts.detectionDone")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("alerts.title")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="trade-alerts">
        <View style={styles.tabs}>
          <Chip label={t("alerts.tab.alerts")} selected={tab === "alerts"} onPress={() => setTab("alerts")} testID="alerts-tab-alerts" />
          <Chip label={t("alerts.tab.monitors")} selected={tab === "monitors"} onPress={() => setTab("monitors")} testID="alerts-tab-monitors" />
        </View>

        {user?.role === "admin" && tab === "alerts" && (
          <Btn title={t("alerts.runDetection")} icon="refresh" variant="outline" size="sm" testID="alerts-run-detection" loading={runDetection.isPending} onPress={() => runDetection.mutate()} style={{ marginBottom: spacing.md }} />
        )}

        {tab === "alerts" ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <Chip label={t("common.all") !== "common.all" ? t("common.all") : "Tutti"} selected={!typeFilter} onPress={() => setTypeFilter(null)} testID="alerts-type-all" />
              {ALERT_TYPES.map((ty) => (
                <Chip key={ty} label={t(`alert.type.${ty}`)} selected={typeFilter === ty} onPress={() => setTypeFilter(typeFilter === ty ? null : ty)} testID={`alerts-type-${ty}`} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {SEVERITIES.map((sv) => (
                <Chip key={sv} label={sv} selected={sevFilter === sv} onPress={() => setSevFilter(sevFilter === sv ? null : sv)} testID={`alerts-sev-${sv}`} />
              ))}
            </ScrollView>
            {(alerts.data ?? []).some((a) => !a.read) ? (
              <Btn title={t("alerts.markAllRead")} icon="checkmark-done" variant="outline" size="sm" testID="alerts-mark-all" loading={markAllRead.isPending} onPress={() => markAllRead.mutate()} style={{ marginBottom: spacing.md, alignSelf: "flex-start" }} />
            ) : null}
            {alerts.isLoading ? <CenterLoader /> : (alerts.data ?? []).length === 0 ? (
              <EmptyState icon="notifications-off-outline" title={t("alerts.empty")} />
            ) : (
              (alerts.data ?? []).map((a) => (
                <Pressable key={a.id} testID={`alert-${a.id}`} onPress={() => !a.read && markRead.mutate(a.id)} style={[styles.card, !a.read && { borderColor: colors.brandPrimary, borderWidth: 1.5 }]}>
                  <View style={styles.cardHead}>
                    <Ionicons name={(TYPE_ICON[a.type] || "notifications") as any} size={18} color={a.severity === "high" ? colors.error : colors.brandSecondary} />
                    <Text style={styles.type}>{t(`alert.type.${a.type}`)}</Text>
                    {!a.read ? <View style={styles.dot} /> : null}
                  </View>
                  <Text style={styles.title}>{a.title}</Text>
                  <Text style={styles.detail}>{a.detail}</Text>
                  <View style={styles.badgeRow}>
                    <Badge label={a.country} tone="brand" />
                    {a.needs_verification ? <Badge label={t("alerts.needsVerification")} tone="warning" /> : null}
                    {a.is_demo ? <Badge label={t("reg.demo")} tone="neutral" /> : null}
                  </View>
                  {a.diff && ((a.diff.added?.length ?? 0) > 0 || (a.diff.removed?.length ?? 0) > 0) ? (
                    <View style={styles.diffBox}>
                      {(a.diff.added ?? []).slice(0, 4).map((l, i) => (
                        <Text key={`a${i}`} style={styles.diffAdd} numberOfLines={2}>+ {l}</Text>
                      ))}
                      {(a.diff.removed ?? []).slice(0, 4).map((l, i) => (
                        <Text key={`r${i}`} style={styles.diffRem} numberOfLines={2}>− {l}</Text>
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.date}>{new Date(a.created_at).toLocaleString()}</Text>
                </Pressable>
              ))
            )}
          </>
        ) : (
          monitors.isLoading ? <CenterLoader /> : (monitors.data ?? []).length === 0 ? (
            <EmptyState icon="eye-off-outline" title={t("alerts.monitorsEmpty")} />
          ) : (
            (monitors.data ?? []).map((m) => (
              <View key={m.id} style={styles.card} testID={`monitor-${m.id}`}>
                <View style={styles.cardHead}>
                  <Ionicons name="eye" size={18} color={colors.brandSecondary} />
                  <Text style={styles.title}>{m.country}{m.product_name ? ` · ${m.product_name}` : ""}</Text>
                </View>
                {m.category ? <Text style={styles.detail}>{m.category}</Text> : null}
                <Btn title={t("alerts.stopMonitor")} size="sm" variant="danger" icon="close" testID={`monitor-stop-${m.id}`} loading={stopMonitor.isPending} onPress={() => stopMonitor.mutate(m.id)} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }} />
              </View>
            ))
          )
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  tabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, marginTop: spacing.sm },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, padding: spacing.md, marginBottom: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  type: { flex: 1, fontFamily: fonts.textBold, fontSize: 11, color: colors.brandPrimary, textTransform: "uppercase", letterSpacing: 0.5 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brandPrimary },
  title: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, marginBottom: 2 },
  detail: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  diffBox: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm },
  diffAdd: { fontFamily: fonts.text, fontSize: 11, color: colors.success, lineHeight: 15 },
  diffRem: { fontFamily: fonts.text, fontSize: 11, color: colors.error, lineHeight: 15 },
  date: { fontFamily: fonts.text, fontSize: 10, color: colors.muted, marginTop: spacing.sm },
}));
