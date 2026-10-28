import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted, Notice, fmtDate } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import { uploadForm } from "@/src/utils/upload";
import { DOC_STATUS } from "@/src/verification";

type Item = { key: string; label_it: string; label_en: string; required: boolean; requires_expiry: boolean; formats: string[]; max_mb: number;
  status: string; document: { _id: string; filename: string; expiry_date?: string; review_reason?: string } | null };


export default function VerificationChecklist() {
  const { L, lang } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["checklist"], queryFn: () => api<{ status: string; items: Item[] }>("/verification/checklist") });
  const [target, setTarget] = useState<Item | null>(null);
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [expiry, setExpiry] = useState("");

  const up = useMutation({
    mutationFn: () => uploadForm("/verification/documents", file!, { req_key: target!.key, expiry_date: expiry || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["checklist"] }); setTarget(null); setFile(null); setExpiry(""); toast.show(L("Documento caricato", "Document uploaded")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (!r.canceled && r.assets?.[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name || "documento.pdf" });
  };
  const lbl = (i: Item) => (lang === "en" ? i.label_en : i.label_it);

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Documenti di verifica", "Verification documents")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="verification-checklist"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        {q.isLoading ? <CenterLoader /> : (
          <>
            <Notice icon="lock-closed" text={L("I documenti sono privati: li vede solo il team di verifica 'Ra mia.", "Documents are private: only the 'Ra mia verification team sees them.")} />
            {(q.data?.items ?? []).map((i) => {
              const st = DOC_STATUS[i.status] ?? DOC_STATUS.missing;
              return (
                <Card key={i.key} testID={`check-${i.key}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                    <Text style={styles.title}>{lbl(i)}{i.required ? " *" : ""}</Text>
                    <Badge label={L(st.it, st.en)} tone={st.tone} />
                  </View>
                  <Muted>{i.formats.join(", ").toUpperCase()} · max {i.max_mb} MB{i.requires_expiry ? L(" · con scadenza", " · with expiry") : ""}</Muted>
                  {i.document ? <Muted>{i.document.filename}{i.document.expiry_date ? ` · ${L("scade", "expires")} ${fmtDate(i.document.expiry_date)}` : ""}</Muted> : null}
                  {i.status === "rejected" && i.document?.review_reason ? <Notice icon="alert-circle" text={i.document.review_reason} /> : null}
                  {i.status !== "approved" && (
                    <Btn title={i.document ? L("Sostituisci", "Replace") : L("Carica", "Upload")} size="sm" variant="outline" icon="cloud-upload"
                      testID={`check-upload-${i.key}`} onPress={() => setTarget(i)} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }} />
                  )}
                </Card>
              );
            })}
            {(q.data?.status === "draft" || q.data?.status === "rejected") && (
              <Btn title={L("Torna al profilo e invia", "Back to profile and submit")} testID="check-go-onboarding" onPress={() => router.push("/onboarding")} />
            )}
          </>
        )}
      </ScrollView>
      <Sheet visible={!!target} onClose={() => setTarget(null)} title={target ? lbl(target) : ""}>
        <Btn title={file ? file.name : L("Scegli file", "Pick file")} variant="outline" icon="attach" testID="check-pick" onPress={pick} style={{ marginBottom: spacing.md }} />
        {target?.requires_expiry && <Field label={L("Data di scadenza (AAAA-MM-GG)", "Expiry date (YYYY-MM-DD)")}><Input testID="check-expiry" value={expiry} onChangeText={setExpiry} placeholder="2027-12-31" /></Field>}
        <Btn title={L("Carica", "Upload")} testID="check-submit" loading={up.isPending} disabled={!file || (!!target?.requires_expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry))} onPress={() => up.mutate()} />
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { flex: 1, fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
}));
