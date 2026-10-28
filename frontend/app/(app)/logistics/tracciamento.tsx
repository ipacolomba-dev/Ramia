import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, Muted } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, Chip, EmptyState, ErrorBanner, Field, Input, Screen, ScreenHeader, Sheet, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { TrackedShipment, TrackingEvent } from "@/src/types";

const STATUSES: TrackingEvent["status"][] = ["assigned", "picked_up", "in_transit", "delivered", "issue"];
const LABELS: Record<string, [string, string]> = {
  pending: ["In attesa", "Pending"], assigned: ["Assegnata", "Assigned"], picked_up: ["Ritirata", "Picked up"],
  in_transit: ["In viaggio", "In transit"], delivered: ["Consegnata", "Delivered"], issue: ["Problema", "Issue"],
};

export default function Tracking() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t, L } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["tracking"], queryFn: () => api<TrackedShipment[]>("/logistics/tracking") });
  const [target, setTarget] = useState<TrackedShipment | null>(null);
  const [status, setStatus] = useState<TrackingEvent["status"]>("in_transit");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState("");

  const add = useMutation({
    mutationFn: () => api(`/logistics/requests/${target!.id}/tracking`, { method: "POST", body: { status, location: location || null, note: note || null, pod_recipient: status === "delivered" ? recipient : null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tracking"] }); qc.invalidateQueries({ queryKey: ["payouts"] }); setTarget(null); setLocation(""); setNote(""); setRecipient(""); toast.show(t("toast.saved")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const lbl = (s: string) => L(...(LABELS[s] ?? [s, s]));

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Tracciamento", "Tracking")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="tracking-list"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        {q.isLoading ? <CenterLoader /> : q.isError ? <ErrorBanner message={t("common.error")} onRetry={() => q.refetch()} /> :
          (q.data ?? []).length === 0 ? (
            <EmptyState icon="navigate-outline" title={L("Nessuna spedizione da tracciare", "No shipments to track")} subtitle={L("Compaiono qui le spedizioni per cui hai inviato un preventivo", "Shipments you quoted on appear here")} />
          ) : q.data!.map((s) => (
            <Card key={s.id} testID={`track-${s.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                <Text style={styles.title} numberOfLines={1}>{s.title}</Text>
                <Badge label={lbl(s.status)} tone={s.status === "delivered" ? "success" : s.status === "issue" ? "error" : "info"} />
              </View>
              <Muted>{s.origin} → {s.destination}</Muted>
              {user?.role === "logistics" && !s.is_carrier && <Muted>{L("In attesa che il cliente scelga il trasportatore", "Waiting for the customer to choose a carrier")}</Muted>}
              {s.events.slice().reverse().map((e) => (
                <View key={e.id} style={styles.event}>
                  <Ionicons name="ellipse" size={8} color={colors.brandPrimary} style={{ marginTop: 5 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.evTitle}>{lbl(e.status)}{e.location ? ` · ${e.location}` : ""}</Text>
                    <Muted>{new Date(e.at).toLocaleString("it-IT")}{e.note ? ` — ${e.note}` : ""}</Muted>
                  </View>
                </View>
              ))}
              {user?.role === "logistics" && s.is_carrier && s.status !== "delivered" && (
                <Btn title={L("Aggiorna stato", "Update status")} size="sm" variant="outline" icon="add" testID={`track-update-${s.id}`} onPress={() => setTarget(s)} style={{ marginTop: spacing.md }} />
              )}
            </Card>
          ))}
      </ScrollView>
      <Sheet visible={!!target} onClose={() => setTarget(null)} title={target?.title ?? ""}>
        <View style={styles.chips}>
          {STATUSES.map((s) => <Chip key={s} label={lbl(s)} selected={status === s} testID={`track-status-${s}`} onPress={() => setStatus(s)} />)}
        </View>
        <Field label={L("Posizione", "Location")}><Input testID="track-location" value={location} onChangeText={setLocation} placeholder="Villa San Giovanni" /></Field>
        <Field label={L("Nota", "Note")}><Input testID="track-note" value={note} onChangeText={setNote} /></Field>
        {status === "delivered" && (
          <Field label={L("Prova di consegna: chi ha ricevuto la merce", "Proof of delivery: received by")}>
            <Input testID="track-pod-recipient" value={recipient} onChangeText={setRecipient} placeholder="Mario Rossi" />
          </Field>
        )}
        <Btn title={t("common.save")} testID="track-submit" loading={add.isPending} onPress={() => (status === "delivered" && !recipient.trim() ? toast.show(L("Indica chi ha ricevuto la merce", "Enter who received the goods"), "error") : add.mutate())} />
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { flex: 1, fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  event: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  evTitle: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
}));
