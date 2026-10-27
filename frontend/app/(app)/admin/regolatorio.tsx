import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Btn, CenterLoader, Chip, EmptyState, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { KbReliabilityBadge } from "@/src/components/trade";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { RegCenter, RegDocument, RegRequirement, RegSource } from "@/src/types";

const REQ_TYPES = ["CUSTOMS", "TARIFF", "FOOD_SAFETY", "HEALTH", "LABEL", "PACKAGING", "INGREDIENT", "ALLERGEN", "CERTIFICATION", "DOCUMENT", "IMPORTER", "LOGISTICS", "OTHER"];
const RELIABILITIES = ["A", "B", "C", "D"] as const;
const SEVERITIES = ["low", "medium", "high"] as const;

type Tab = "sources" | "documents" | "requirements";

export default function RegulatoryCenter() {
  const { t } = useT();
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const [tab, setTab] = useState<Tab>("sources");

  const center = useQuery({ queryKey: ["reg-center"], queryFn: () => api<RegCenter>("/regulatory/center"), enabled: user?.role === "admin" });

  if (user?.role !== "admin") {
    return (
      <Screen>
        <ScreenHeader title={t("reg.title")} />
        <EmptyState icon="shield-outline" title={t("reg.title")} subtitle={t("common.error")} />
      </Screen>
    );
  }

  const c = center.data;
  const stats = [
    { label: t("reg.stats.sources"), value: c?.sources_total },
    { label: t("reg.stats.active"), value: c?.sources_active },
    { label: t("reg.stats.toVerify"), value: c?.sources_to_verify },
    { label: t("reg.stats.documents"), value: c?.documents },
    { label: t("reg.stats.requirements"), value: c?.requirements },
    { label: t("reg.stats.snapshots"), value: c?.snapshots },
  ];

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("reg.title")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 60 }} bottomOffset={20} testID="reg-center">
        <Text style={styles.subtitle}>{t("reg.subtitle")}</Text>

        <View style={styles.statsGrid}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statValue}>{s.value ?? "—"}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={15} color={colors.brandSecondary} />
          <Text style={styles.disclaimerText}>{t("reg.disclaimer")}</Text>
        </View>

        <Btn title={t("alerts.title")} icon="notifications" variant="outline" size="sm" testID="reg-alerts-link" onPress={() => router.push("/producer/export/alerts")} style={{ marginTop: spacing.md }} />

        <View style={styles.tabs}>
          <Chip label={t("reg.tab.sources")} selected={tab === "sources"} onPress={() => setTab("sources")} testID="reg-tab-sources" />
          <Chip label={t("reg.tab.documents")} selected={tab === "documents"} onPress={() => setTab("documents")} testID="reg-tab-documents" />
          <Chip label={t("reg.tab.requirements")} selected={tab === "requirements"} onPress={() => setTab("requirements")} testID="reg-tab-requirements" />
        </View>

        {tab === "sources" && <SourcesTab />}
        {tab === "documents" && <DocumentsTab />}
        {tab === "requirements" && <RequirementsTab />}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------- Sources

function SourcesTab() {
  const { t } = useT();
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", authority: "", country: "", url: "", category: "", reliability: "A" as (typeof RELIABILITIES)[number], is_demo: false });

  const list = useQuery({ queryKey: ["reg-sources"], queryFn: () => api<RegSource[]>("/regulatory/sources") });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["reg-sources"] });
    qc.invalidateQueries({ queryKey: ["reg-center"] });
  };

  const create = useMutation({
    mutationFn: () => api("/regulatory/sources", { method: "POST", body: { name: f.name, authority: f.authority, country: f.country, url: f.url, category: f.category || null, reliability: f.reliability, is_demo: f.is_demo } }),
    onSuccess: () => { invalidate(); setOpen(false); setF({ name: "", authority: "", country: "", url: "", category: "", reliability: "A", is_demo: false }); toast.show(t("reg.created")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const verify = useMutation({
    mutationFn: (id: string) => api(`/regulatory/sources/${id}/verify`, { method: "POST" }),
    onSuccess: (r: any) => { invalidate(); toast.show(r?.reachable ? t("reg.reachable") : t("reg.unreachable")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View>
      <View style={styles.listHead}>
        <Text style={styles.count}>{(list.data ?? []).length}</Text>
        <Btn title={open ? t("common.cancel") : t("reg.new")} size="sm" icon={open ? "close" : "add"} testID="reg-source-new" onPress={() => setOpen(!open)} />
      </View>

      {open && (
        <View style={styles.formBox} testID="reg-source-form">
          <Field label={t("reg.field.name")}><Input testID="reg-source-name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} /></Field>
          <Field label={t("reg.field.authority")}><Input testID="reg-source-authority" value={f.authority} onChangeText={(v) => setF({ ...f, authority: v })} /></Field>
          <Field label={t("reg.field.country")}><Input testID="reg-source-country" value={f.country} onChangeText={(v) => setF({ ...f, country: v })} placeholder="Germania / USA / UE" /></Field>
          <Field label={t("reg.field.category")}><Input testID="reg-source-category" value={f.category} onChangeText={(v) => setF({ ...f, category: v })} /></Field>
          <Field label={t("reg.field.url")}><Input testID="reg-source-url" value={f.url} onChangeText={(v) => setF({ ...f, url: v })} autoCapitalize="none" keyboardType="url" placeholder="https://" /></Field>
          <Text style={styles.fieldLabel}>{t("reg.field.reliability")}</Text>
          <View style={styles.pickRow}>
            {RELIABILITIES.map((r) => <Chip key={r} label={r} selected={f.reliability === r} onPress={() => setF({ ...f, reliability: r })} testID={`reg-source-rel-${r}`} />)}
          </View>
          <Pressable style={styles.demoToggle} onPress={() => setF({ ...f, is_demo: !f.is_demo })} testID="reg-source-demo">
            <View style={[styles.checkbox, f.is_demo && { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary }]}>
              {f.is_demo && <Ionicons name="checkmark" size={12} color={colors.onBrandSecondary} />}
            </View>
            <Text style={styles.demoLabel}>{t("reg.field.isDemo")}</Text>
          </Pressable>
          <Btn title={t("reg.add")} testID="reg-source-submit" loading={create.isPending} disabled={!f.name || !f.authority || !f.country || !f.url} onPress={() => create.mutate()} style={{ marginTop: spacing.sm }} />
        </View>
      )}

      {list.isLoading ? <CenterLoader /> : (list.data ?? []).length === 0 ? (
        <EmptyState icon="library-outline" title={t("reg.empty")} />
      ) : (
        (list.data ?? []).map((s) => (
          <View key={s.id} style={styles.card} testID={`reg-source-${s.id}`}>
            <View style={styles.cardHead}>
              <KbReliabilityBadge reliability={s.reliability} />
              <Text style={styles.cardTitle} numberOfLines={2}>{s.name}</Text>
            </View>
            <Text style={styles.cardMeta}>{s.authority} · {s.country}</Text>
            <Pressable onPress={() => s.url && Linking.openURL(s.url)}><Text style={styles.cardUrl} numberOfLines={1}>{s.url}</Text></Pressable>
            <View style={styles.badgeRow}>
              <Badge label={s.status} tone={s.status === "active" ? "success" : s.status === "unreachable" ? "error" : "warning"} />
              {s.is_demo ? <Badge label={t("reg.demo")} tone="neutral" /> : null}
            </View>
            <Btn title={t("reg.verify")} size="sm" variant="outline" icon="globe-outline" testID={`reg-source-verify-${s.id}`} loading={verify.isPending} onPress={() => verify.mutate(s.id)} style={{ marginTop: spacing.sm }} />
          </View>
        ))
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Documents

function DocumentsTab() {
  const { t } = useT();
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ source_id: "", title: "", country: "", content: "", url: "" });

  const sources = useQuery({ queryKey: ["reg-sources"], queryFn: () => api<RegSource[]>("/regulatory/sources") });
  const list = useQuery({ queryKey: ["reg-documents"], queryFn: () => api<RegDocument[]>("/regulatory/documents") });

  const create = useMutation({
    mutationFn: () => api("/regulatory/documents", { method: "POST", body: { source_id: f.source_id, title: f.title, country: f.country, content: f.content, url: f.url || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reg-documents"] }); qc.invalidateQueries({ queryKey: ["reg-center"] }); setOpen(false); setF({ source_id: "", title: "", country: "", content: "", url: "" }); toast.show(t("reg.created")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View>
      <View style={styles.listHead}>
        <Text style={styles.count}>{(list.data ?? []).length}</Text>
        <Btn title={open ? t("common.cancel") : t("reg.new")} size="sm" icon={open ? "close" : "add"} testID="reg-doc-new" onPress={() => setOpen(!open)} />
      </View>

      {open && (
        <View style={styles.formBox} testID="reg-doc-form">
          <Text style={styles.fieldLabel}>{t("reg.field.source")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
            {(sources.data ?? []).map((s) => <Chip key={s.id} label={s.name} selected={f.source_id === s.id} onPress={() => setF({ ...f, source_id: s.id, country: f.country || s.country })} testID={`reg-doc-src-${s.id}`} />)}
          </ScrollView>
          <Field label={t("reg.field.title")}><Input testID="reg-doc-title" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} /></Field>
          <Field label={t("reg.field.country")}><Input testID="reg-doc-country" value={f.country} onChangeText={(v) => setF({ ...f, country: v })} /></Field>
          <Field label={t("reg.field.url")}><Input testID="reg-doc-url" value={f.url} onChangeText={(v) => setF({ ...f, url: v })} autoCapitalize="none" keyboardType="url" /></Field>
          <Field label={t("reg.field.content")}><Input testID="reg-doc-content" value={f.content} onChangeText={(v) => setF({ ...f, content: v })} multiline /></Field>
          <Btn title={t("reg.add")} testID="reg-doc-submit" loading={create.isPending} disabled={!f.source_id || !f.title || !f.country || !f.content} onPress={() => create.mutate()} />
        </View>
      )}

      {list.isLoading ? <CenterLoader /> : (list.data ?? []).length === 0 ? (
        <EmptyState icon="document-text-outline" title={t("reg.empty")} />
      ) : (
        (list.data ?? []).map((d) => (
          <View key={d.id} style={styles.card} testID={`reg-doc-${d.id}`}>
            <Text style={styles.cardTitle} numberOfLines={2}>{d.title}</Text>
            <Text style={styles.cardMeta}>{d.country} · v{d.current_version}</Text>
            <View style={styles.badgeRow}>
              <Badge label={d.status} tone="success" />
              {d.is_demo ? <Badge label={t("reg.demo")} tone="neutral" /> : null}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Requirements

function RequirementsTab() {
  const { t } = useT();
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ source_id: "", country: "", category: "", requirement_type: "LABEL", description: "", severity: "medium" as (typeof SEVERITIES)[number] });

  const sources = useQuery({ queryKey: ["reg-sources"], queryFn: () => api<RegSource[]>("/regulatory/sources") });
  const list = useQuery({ queryKey: ["reg-requirements"], queryFn: () => api<RegRequirement[]>("/regulatory/requirements") });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["reg-requirements"] }); qc.invalidateQueries({ queryKey: ["reg-center"] }); };

  const create = useMutation({
    mutationFn: () => api("/regulatory/requirements", { method: "POST", body: { source_id: f.source_id, country: f.country, category: f.category || null, requirement_type: f.requirement_type, description: f.description, severity: f.severity } }),
    onSuccess: () => { invalidate(); setOpen(false); setF({ source_id: "", country: "", category: "", requirement_type: "LABEL", description: "", severity: "medium" }); toast.show(t("reg.created")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const verify = useMutation({
    mutationFn: (id: string) => api(`/regulatory/requirements/${id}/verify`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast.show(t("reg.verified")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View>
      <View style={styles.listHead}>
        <Text style={styles.count}>{(list.data ?? []).length}</Text>
        <Btn title={open ? t("common.cancel") : t("reg.new")} size="sm" icon={open ? "close" : "add"} testID="reg-req-new" onPress={() => setOpen(!open)} />
      </View>

      {open && (
        <View style={styles.formBox} testID="reg-req-form">
          <Text style={styles.fieldLabel}>{t("reg.field.source")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
            {(sources.data ?? []).map((s) => <Chip key={s.id} label={s.name} selected={f.source_id === s.id} onPress={() => setF({ ...f, source_id: s.id, country: f.country || s.country })} testID={`reg-req-src-${s.id}`} />)}
          </ScrollView>
          <Field label={t("reg.field.country")}><Input testID="reg-req-country" value={f.country} onChangeText={(v) => setF({ ...f, country: v })} /></Field>
          <Field label={t("reg.field.category")}><Input testID="reg-req-category" value={f.category} onChangeText={(v) => setF({ ...f, category: v })} /></Field>
          <Text style={styles.fieldLabel}>{t("reg.field.type")}</Text>
          <View style={styles.pickRow}>
            {REQ_TYPES.map((rt) => <Chip key={rt} label={t(`kb.type.${rt}`)} selected={f.requirement_type === rt} onPress={() => setF({ ...f, requirement_type: rt })} testID={`reg-req-type-${rt}`} />)}
          </View>
          <Field label={t("reg.field.description")}><Input testID="reg-req-desc" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline /></Field>
          <Text style={styles.fieldLabel}>{t("reg.field.severity")}</Text>
          <View style={styles.pickRow}>
            {SEVERITIES.map((sv) => <Chip key={sv} label={sv} selected={f.severity === sv} onPress={() => setF({ ...f, severity: sv })} testID={`reg-req-sev-${sv}`} />)}
          </View>
          <Btn title={t("reg.add")} testID="reg-req-submit" loading={create.isPending} disabled={!f.source_id || !f.country || !f.description} onPress={() => create.mutate()} style={{ marginTop: spacing.sm }} />
        </View>
      )}

      {list.isLoading ? <CenterLoader /> : (list.data ?? []).length === 0 ? (
        <EmptyState icon="list-outline" title={t("reg.empty")} />
      ) : (
        (list.data ?? []).map((r) => (
          <View key={r.id} style={styles.card} testID={`reg-req-${r.id}`}>
            <View style={styles.cardHead}>
              <KbReliabilityBadge reliability={r.source_reliability} />
              <Text style={styles.cardType}>{t(`kb.type.${r.requirement_type}`)}</Text>
            </View>
            <Text style={styles.cardDesc}>{r.description}</Text>
            <Text style={styles.cardMeta}>{r.country}{r.category ? ` · ${r.category}` : ""} · {r.source_name}</Text>
            <View style={styles.badgeRow}>
              <Badge label={r.verification_status} tone={r.verification_status === "HUMAN_VERIFIED" ? "success" : "warning"} />
              {r.is_demo ? <Badge label={t("reg.demo")} tone="neutral" /> : null}
            </View>
            {!r.is_demo && r.verification_status !== "HUMAN_VERIFIED" ? (
              <Btn title={t("reg.verifyReq")} size="sm" variant="outline" icon="checkmark-done" testID={`reg-req-verify-${r.id}`} loading={verify.isPending} onPress={() => verify.mutate(r.id)} style={{ marginTop: spacing.sm }} />
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  subtitle: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.md },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statCard: { width: "31%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  statValue: { fontFamily: fonts.textBold, fontSize: 20, color: colors.brandPrimary },
  statLabel: { fontFamily: fonts.text, fontSize: 10, color: colors.muted, textAlign: "center", marginTop: 2 },
  disclaimer: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  disclaimerText: { flex: 1, fontFamily: fonts.text, fontSize: 11, color: colors.onBrandTertiary, lineHeight: 15 },
  tabs: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.lg },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  count: { fontFamily: fonts.textBold, fontSize: 14, color: colors.muted },
  formBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  fieldLabel: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm },
  pickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  demoToggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  demoLabel: { flex: 1, fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, padding: spacing.md, marginBottom: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  cardTitle: { flex: 1, fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  cardType: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brandPrimary, textTransform: "uppercase", letterSpacing: 0.5 },
  cardDesc: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18, marginBottom: spacing.xs },
  cardMeta: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginTop: 2 },
  cardUrl: { fontFamily: fonts.text, fontSize: 11, color: colors.info, marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
}));
