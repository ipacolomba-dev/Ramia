import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Switch, Text, View } from "react-native";

import { api } from "@/src/api";
import { Muted, Notice } from "@/src/components/blocks";
import { Btn, CenterLoader, Chip, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Category } from "@/src/types";

type FieldDef = { key: string; label_it: string; label_en: string; kind: string; required: boolean; options?: string[] };
type Step = { key: string; title_it: string; title_en: string; fields: FieldDef[] };
type Onb = { role: string; steps: Step[]; step: number; data: Record<string, any>; status: string | null };

/** Generic role onboarding driven by the server schema; every change is saved as a draft and resumed later. */
export default function Onboarding() {
  const { colors } = useTheme();
  const { L, lang } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["onboarding"], queryFn: () => api<Onb>("/onboarding") });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, any>>({});
  const loaded = useRef(false);

  useEffect(() => {
    if (q.data && !loaded.current) {
      loaded.current = true;
      setStep(Math.min(q.data.step, Math.max(q.data.steps.length - 1, 0)));
      setData(q.data.data || {});
    }
  }, [q.data]);

  const save = useMutation({ mutationFn: (s: number) => api("/onboarding/draft", { method: "PUT", body: { step: s, data } }) });
  const submit = useMutation({
    mutationFn: async () => { await api("/onboarding/draft", { method: "PUT", body: { step, data } }); return api("/onboarding/submit", { method: "POST" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding"] }); toast.show(L("Inviato per la verifica", "Submitted for verification")); router.replace("/verifica"); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (q.isLoading || !q.data) return <CenterLoader />;
  const steps = q.data.steps;
  if (steps.length === 0) return <Screen><ScreenHeader title="Onboarding" onBack={() => router.back()} /><Notice text={L("Il tuo profilo non richiede onboarding.", "Your profile needs no onboarding.")} /></Screen>;
  const s = steps[step];
  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));
  const go = (n: number) => { save.mutate(n); setStep(n); };
  const stepErrors = () => s.fields.filter((f) => f.required && f.kind !== "bool" && (data[f.key] == null || data[f.key] === "" || (Array.isArray(data[f.key]) && data[f.key].length === 0)))
    .map((f) => (lang === "en" ? f.label_en : f.label_it));
  const next = () => {
    const missing = stepErrors();
    if (missing.length) return toast.show(L(`Completa: ${missing.join(", ")}`, `Please fill: ${missing.join(", ")}`), "error");
    go(step + 1);
  };
  const label = (f: FieldDef) => `${lang === "en" ? f.label_en : f.label_it}${f.required && f.kind !== "bool" ? " *" : ""}`;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Profilo aziendale", "Company profile")} onBack={() => (step === 0 ? router.back() : go(step - 1))} />
      <View style={styles.progress}>{steps.map((x, i) => <View key={x.key} style={[styles.bar, i <= step && { backgroundColor: colors.brandPrimary }]} />)}</View>
      <Text style={styles.stepLabel}>{L(`Passo ${step + 1} di ${steps.length}`, `Step ${step + 1} of ${steps.length}`)} · {lang === "en" ? s.title_en : s.title_it}</Text>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl }} bottomOffset={24} testID="onboarding-form">
        {s.fields.map((f) => {
          if (f.kind === "bool") return (
            <View key={f.key} style={styles.switchRow}>
              <Text style={styles.label}>{label(f)}</Text>
              <Switch testID={`ob-${f.key}`} value={!!data[f.key]} onValueChange={(v) => set(f.key, v)} accessibilityLabel={label(f)} />
            </View>
          );
          if (f.kind === "select" || f.kind === "multi" || f.kind === "categories") {
            const opts = f.kind === "categories" ? (cats.data ?? []).map((c) => c.slug) : f.options ?? [];
            const multi = f.kind !== "select";
            const cur: string[] = multi ? data[f.key] ?? [] : [];
            return (
              <View key={f.key} style={{ marginBottom: spacing.md }}>
                <Text style={styles.label}>{label(f)}</Text>
                <View style={styles.chips}>
                  {opts.map((o) => {
                    const sel = multi ? cur.includes(o) : data[f.key] === o;
                    const name = f.kind === "categories" ? L(cats.data?.find((c) => c.slug === o)?.name ?? o, cats.data?.find((c) => c.slug === o)?.name_en) : o.toUpperCase();
                    return <Chip key={o} label={name} selected={sel} testID={`ob-${f.key}-${o}`} onPress={() => set(f.key, multi ? (sel ? cur.filter((x) => x !== o) : [...cur, o]) : o)} />;
                  })}
                </View>
              </View>
            );
          }
          return <Field key={f.key} label={label(f)}><Input testID={`ob-${f.key}`} value={data[f.key] ?? ""} onChangeText={(v) => set(f.key, v)} autoCapitalize={f.key.includes("email") || f.key === "iban" ? "none" : "sentences"} /></Field>;
        })}
        <Muted>{save.isPending ? L("Salvataggio bozza…", "Saving draft…") : L("La bozza si salva a ogni passo: puoi riprendere quando vuoi.", "Your draft is saved at every step: resume any time.")}</Muted>
        <View style={{ height: spacing.md }} />
        {step < steps.length - 1 ? (
          <Btn title={L("Continua", "Continue")} size="lg" testID="ob-next" onPress={next} />
        ) : (
          <>
            <Btn title={L("Carica i documenti", "Upload documents")} variant="outline" icon="folder-open" testID="ob-docs" onPress={() => { save.mutate(step); router.push("/verifica"); }} />
            <View style={{ height: spacing.sm }} />
            <Btn title={L("Invia per la verifica", "Submit for verification")} size="lg" testID="ob-submit" loading={submit.isPending} onPress={() => submit.mutate()} />
          </>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  progress: { flexDirection: "row", gap: 4, paddingHorizontal: spacing.xl },
  bar: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  stepLabel: { fontFamily: fonts.textBold, fontSize: 12, color: colors.muted, paddingHorizontal: spacing.xl, marginVertical: spacing.md },
  label: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm, flexShrink: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.md, minHeight: 48 },
}));
