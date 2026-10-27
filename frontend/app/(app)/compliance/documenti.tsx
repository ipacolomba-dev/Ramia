import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { TOKEN_KEY, api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, Muted, Notice, fmtDate } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, Chip, EmptyState, ErrorBanner, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { ComplianceDoc } from "@/src/types";
import { uploadForm } from "@/src/utils/upload";
import { storage } from "@/src/utils/storage";

const TYPES: Record<string, [string, string]> = {
  certificate: ["Certificato", "Certificate"], lab_analysis: ["Analisi di laboratorio", "Lab analysis"],
  tech_sheet: ["Scheda tecnica", "Tech sheet"], haccp: ["HACCP", "HACCP"], label: ["Etichetta", "Label"], other: ["Altro", "Other"],
};
const expired = (d?: string | null) => !!d && new Date(d).getTime() < Date.now();

export default function Documents() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t, L } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["compliance-docs"], queryFn: () => api<ComplianceDoc[]>("/compliance/documents") });

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ uri: string; name: string; type?: string } | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("certificate");
  const [expiry, setExpiry] = useState("");

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name || "documento.pdf", type: a.mimeType ?? undefined });
      if (!title) setTitle((a.name || "").replace(/\.[^.]+$/, ""));
    }
  };
  const upload = useMutation({
    mutationFn: () => uploadForm("/compliance/documents", file!, { title, doc_type: type, expiry_date: expiry || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compliance-docs"] }); setOpen(false); setFile(null); setTitle(""); setExpiry(""); toast.show(L("Documento caricato", "Document uploaded")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/compliance/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-docs"] }),
  });
  const openDoc = async (d: ComplianceDoc) => {
    const token = await storage.secureGet(TOKEN_KEY, "");
    const url = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/compliance/documents/${d.id}/file?token=${encodeURIComponent(token ?? "")}`;
    if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  };
  const submit = () => {
    if (!file || !title.trim()) return toast.show(L("Scegli un file e dai un titolo", "Pick a file and add a title"), "error");
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return toast.show(L("Data nel formato AAAA-MM-GG", "Date as YYYY-MM-DD"), "error");
    upload.mutate();
  };

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Documenti", "Documents")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="compliance-documents"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        <Notice icon="lock-closed" text={L("Archivio privato: solo tu (e l'amministratore) potete aprire questi file.", "Private vault: only you (and the admin) can open these files.")} />
        <Btn title={L("Carica documento", "Upload document")} icon="cloud-upload" testID="docs-upload-open" onPress={() => setOpen(true)} style={{ marginBottom: spacing.md }} />
        {q.isLoading ? <CenterLoader /> : q.isError ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> :
          (q.data ?? []).length === 0 ? (
            <EmptyState icon="folder-open-outline" title={L("Nessun documento", "No documents")} subtitle={user?.role === "producer" ? L("Certificazioni, analisi, schede tecniche, HACCP", "Certifications, lab analyses, tech sheets, HACCP") : undefined} />
          ) : q.data!.map((d) => (
            <Card key={d.id} testID={`doc-${d.id}`} onPress={() => openDoc(d)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Ionicons name={d.ext === "pdf" ? "document" : "image"} size={26} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{d.title}</Text>
                <Muted>{L(...(TYPES[d.doc_type] ?? TYPES.other))} · {Math.max(1, Math.round(d.size / 1024))} KB · {fmtDate(d.created_at)}</Muted>
                {d.expiry_date ? <Badge label={`${expired(d.expiry_date) ? L("Scaduto", "Expired") : L("Scade", "Expires")} ${fmtDate(d.expiry_date)}`} tone={expired(d.expiry_date) ? "error" : "info"} /> : null}
              </View>
              <Pressable testID={`doc-delete-${d.id}`} onPress={() => remove.mutate(d.id)} hitSlop={10} accessibilityRole="button" style={{ padding: spacing.sm }}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Pressable>
            </Card>
          ))}
      </ScrollView>
      <Sheet visible={open} onClose={() => setOpen(false)} title={L("Nuovo documento", "New document")}>
        <Btn title={file ? file.name : L("Scegli file (PDF o immagine)", "Pick file (PDF or image)")} variant="outline" icon="attach" testID="docs-pick" onPress={pick} style={{ marginBottom: spacing.md }} />
        <Field label={L("Titolo", "Title")}><Input testID="docs-title" value={title} onChangeText={setTitle} /></Field>
        <View style={styles.chips}>
          {Object.keys(TYPES).map((k) => <Chip key={k} label={L(...TYPES[k])} selected={type === k} testID={`docs-type-${k}`} onPress={() => setType(k)} />)}
        </View>
        <Field label={L("Scadenza", "Expiry")} hint={t("common.optional")}><Input testID="docs-expiry" value={expiry} onChangeText={setExpiry} placeholder="2027-12-31" /></Field>
        <Btn title={L("Carica", "Upload")} testID="docs-submit" loading={upload.isPending} onPress={submit} />
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
}));
