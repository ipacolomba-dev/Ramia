import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Platform, RefreshControl, ScrollView, Text, View } from "react-native";

import { TOKEN_KEY, api } from "@/src/api";
import { Card, LinkRow, Muted, Segmented } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, EmptyState, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import { storage } from "@/src/utils/storage";

import { DOC_STATUS } from "@/src/verification";

type Q = { id: string; company_name: string; email: string; role: string; status: string; docs_total: number; docs_approved: number; docs_to_review: number };
type Detail = { id: string; company_name: string; email: string; role: string; status: string; verified_by?: string; verified_at?: string;
  onboarding: Record<string, any>; checklist: any[]; events: { kind: string; status: string; document?: string; reason?: string; actor_email: string; at: string }[] };

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const FIELD_LABELS: Record<string, string> = {
  legal_name: "Ragione sociale", vat_id: "Partita IVA", ateco: "ATECO", country: "Paese", street: "Indirizzo", city: "Comune", province: "Provincia",
  zip: "CAP", categories: "Categorie", capacity: "Capacità", certifications: "Certificazioni", export_extra_eu: "Export extra-UE", iban: "IBAN",
  contact_name: "Referente", contact_phone: "Telefono", contact_email: "Email referente", sector: "Settore", buyer_type: "Tipologia",
  expected_volume: "Volumi attesi", currency: "Valuta", eori: "EORI", routes: "Tratte", cargo_types: "Tipi di carico",
  temperature_controlled: "Temperatura controllata", fleet: "Mezzi", insurance: "Assicurazione", accreditations: "Accreditamenti",
  labs: "Laboratori", markets: "Mercati", avg_days: "Tempi medi (gg)", shop_name: "Negozio", shop_address: "Indirizzo negozio", tax_regime: "Regime fiscale",
};
async function openUrl(path: string) {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const url = `${BASE}/api${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token ?? "")}`;
  if (Platform.OS === "web") window.open(url, "_blank"); else Linking.openURL(url);
}

/** Admin verification console: queue, document preview, approve/reject with reason, company decision, compliance export. */
export default function VerificationConsole() {
  const { t, L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const [tab, setTab] = useState<"pending" | "draft" | "approved" | "rejected" | "suspended">("pending");
  const [sel, setSel] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const queue = useQuery({ queryKey: ["verif-queue", tab], queryFn: () => api<Q[]>(`/admin/verification/queue?status=${tab}`) });
  const detail = useQuery({ queryKey: ["verif-detail", sel], queryFn: () => api<Detail>(`/admin/verification/companies/${sel}`), enabled: !!sel });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["verif-queue"] }); qc.invalidateQueries({ queryKey: ["verif-detail"] }); };
  const err = (e: Error) => toast.show(e.message, "error");
  const reviewDoc = useMutation({ mutationFn: ({ id, action }: { id: string; action: string }) => api(`/admin/verification/documents/${id}`, { method: "PATCH", body: { action, reason: reason || null } }), onSuccess: () => { refresh(); setReason(""); }, onError: err });
  const decide = useMutation({ mutationFn: (status: string) => api(`/admin/verification/companies/${sel}`, { method: "PATCH", body: { status, reason: reason || null } }), onSuccess: () => { refresh(); setReason(""); toast.show(t("toast.saved")); }, onError: err });
  const d = detail.data;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Console di verifica", "Verification console")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="admin-verify"
        refreshControl={<RefreshControl refreshing={queue.isRefetching} onRefresh={() => queue.refetch()} />}>
        <LinkRow icon="download" label={L("Esporta log di conformità (CSV)", "Export compliance log (CSV)")} testID="verify-export" onPress={() => openUrl("/admin/compliance-log.csv")} />
        <Segmented value={tab} onChange={setTab} options={[
          { key: "pending", label: L("In coda", "Queue") }, { key: "draft", label: L("Bozze", "Drafts") },
          { key: "approved", label: L("Verificate", "Verified") }, { key: "rejected", label: L("Respinte", "Rejected") }, { key: "suspended", label: L("Sospese", "Suspended") }]} />
        {queue.isLoading ? <CenterLoader /> : (queue.data ?? []).length === 0 ? <EmptyState icon="checkmark-done-outline" title={L("Nessuna azienda", "No companies")} /> :
          queue.data!.map((c) => (
            <Card key={c.id} testID={`verify-company-${c.id}`} onPress={() => setSel(c.id)}>
              <Text style={styles.title}>{c.company_name}</Text>
              <Muted>{t(`role.${c.role}`)} · {c.email}</Muted>
              <Muted>{L(`Documenti approvati ${c.docs_approved}/${c.docs_total} · da rivedere ${c.docs_to_review}`, `Docs approved ${c.docs_approved}/${c.docs_total} · to review ${c.docs_to_review}`)}</Muted>
            </Card>
          ))}
      </ScrollView>
      <Sheet visible={!!sel} onClose={() => setSel(null)} title={d?.company_name ?? ""}>
        {!d ? <CenterLoader /> : (
          <ScrollView style={{ maxHeight: 560 }} testID="verify-detail">
            <Muted>{d.email} · {t(`role.${d.role}`)} · {d.status}{d.verified_by ? ` · ${L("verificata da", "verified by")} ${d.verified_by}` : ""}</Muted>
            {Object.entries(d.onboarding).map(([k, v]) => <Text key={k} style={styles.kv}>{FIELD_LABELS[k] ?? k}: {Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? L("sì", "yes") : L("no", "no")) : String(v)}</Text>)}
            <Field label={L("Motivazione (obbligatoria per rifiuti e sospensioni)", "Reason (required to reject or suspend)")}><Input testID="verify-reason" value={reason} onChangeText={setReason} multiline /></Field>
            {d.checklist.map((c) => {
              const st = DOC_STATUS[c.status] ?? DOC_STATUS.missing;
              return (
                <View key={c.key} style={styles.doc}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                    <Text style={styles.docTitle}>{c.label_it}{c.required ? " *" : ""}</Text>
                    <Badge label={L(st.it, st.en)} tone={st.tone} />
                  </View>
                  {c.document && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                      <Btn title={L("Anteprima", "Preview")} size="sm" variant="outline" testID={`verify-preview-${c.key}`} onPress={() => openUrl(`/verification/documents/${c.document._id}/file`)} />
                      <Btn title={L("Approva", "Approve")} size="sm" variant="secondary" testID={`verify-doc-approve-${c.key}`} onPress={() => reviewDoc.mutate({ id: c.document._id, action: "approve" })} />
                      <Btn title={L("Respingi", "Reject")} size="sm" variant="danger" testID={`verify-doc-reject-${c.key}`} onPress={() => reviewDoc.mutate({ id: c.document._id, action: "reject" })} />
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.md }}>
              <Btn title={L("Approva azienda", "Approve company")} variant="secondary" testID="verify-approve" loading={decide.isPending} onPress={() => decide.mutate("approved")} />
              <Btn title={L("Respingi", "Reject")} variant="danger" testID="verify-reject" onPress={() => decide.mutate("rejected")} />
              <Btn title={d.status === "suspended" ? L("Riattiva", "Reactivate") : L("Sospendi", "Suspend")} variant="outline" testID="verify-suspend" onPress={() => decide.mutate(d.status === "suspended" ? "approved" : "suspended")} />
            </View>
            <Text style={styles.docTitle}>{L("Storico verifiche", "Verification history")}</Text>
            {d.events.map((e, i) => <Muted key={i}>{new Date(e.at).toLocaleString("it-IT")} · {e.actor_email} · {e.kind}{e.document ? ` ${e.document}` : ""} → {e.status}{e.reason ? ` (${e.reason})` : ""}</Muted>)}
          </ScrollView>
        )}
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  kv: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  doc: { borderTopWidth: 1, borderTopColor: colors.divider, paddingVertical: spacing.md },
  docTitle: { flex: 1, fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },
}));
