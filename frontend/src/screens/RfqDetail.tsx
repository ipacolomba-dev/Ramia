import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, Muted, Section, fmtDate } from "@/src/components/blocks";
import { Badge, Btn, CenterLoader, EmptyState, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";
import type { Rfq } from "@/src/types";

/** Buyer request detail: buyers see all responses and can close; producers reply. */
export default function RfqDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t, L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const [message, setMessage] = useState("");
  const [price, setPrice] = useState("");

  const q = useQuery({ queryKey: ["rfq", id], queryFn: () => api<Rfq>(`/rfq/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["rfq"] }); };
  const reply = useMutation({
    mutationFn: () => api(`/rfq/${id}/responses`, { method: "POST", body: { message, price: price || null } }),
    onSuccess: () => { setMessage(""); setPrice(""); refresh(); toast.show(L("Risposta inviata", "Reply sent")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const close = useMutation({
    mutationFn: () => api(`/rfq/${id}/close`, { method: "PATCH" }),
    onSuccess: () => { refresh(); toast.show(t("toast.saved")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (q.isLoading) return <CenterLoader />;
  const r = q.data;
  const isBuyer = user?.role === "business";

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Richiesta di fornitura", "Supply request")} onBack={() => router.back()} />
      {!r ? <EmptyState icon="alert-circle-outline" title={t("common.error")} /> : (
        <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} bottomOffset={24} testID="rfq-detail">
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
              <Text style={styles.title}>{r.title}</Text>
              <Badge label={r.status === "open" ? L("Aperta", "Open") : L("Chiusa", "Closed")} tone={r.status === "open" ? "success" : "neutral"} />
            </View>
            <Muted>{r.buyer_name}</Muted>
            <Text style={styles.line}>{L("Quantità", "Quantity")}: {r.quantity}</Text>
            {r.target_price ? <Text style={styles.line}>{L("Prezzo obiettivo", "Target price")}: {r.target_price}</Text> : null}
            {r.destination ? <Text style={styles.line}>{L("Destinazione", "Destination")}: {r.destination}</Text> : null}
            {r.deadline ? <Text style={styles.line}>{L("Entro il", "By")}: {fmtDate(r.deadline)}</Text> : null}
            {r.notes ? <Text style={styles.line}>{r.notes}</Text> : null}
          </Card>

          <Section title={isBuyer ? L(`Risposte (${r.responses.length})`, `Responses (${r.responses.length})`) : L("La tua risposta", "Your reply")} />
          {r.responses.length === 0 ? <Muted>{L("Ancora nessuna risposta.", "No responses yet.")}</Muted> : r.responses.map((resp) => (
            <Card key={resp.id} testID={`rfq-response-${resp.id}`}>
              <Text style={styles.producer}>{resp.producer_name}</Text>
              {resp.price ? <Badge label={resp.price} tone="brand" /> : null}
              <Text style={styles.line}>{resp.message}</Text>
              <Muted>{fmtDate(resp.created_at)}</Muted>
            </Card>
          ))}

          {!isBuyer && r.status === "open" && (
            <View style={{ marginTop: spacing.md }}>
              <Field label={L("Messaggio al compratore", "Message to the buyer")}><Input testID="rfq-reply-message" value={message} onChangeText={setMessage} multiline placeholder={L("Disponibilità, tempi, condizioni…", "Availability, lead time, terms…")} /></Field>
              <Field label={L("Prezzo proposto", "Proposed price")} hint={t("common.optional")}><Input testID="rfq-reply-price" value={price} onChangeText={setPrice} placeholder="€ 9,50/kg franco Catania" /></Field>
              <Btn title={L("Invia risposta", "Send reply")} testID="rfq-reply-submit" loading={reply.isPending} disabled={!message.trim()} onPress={() => reply.mutate()} />
            </View>
          )}
          {isBuyer && r.status === "open" && (
            <Btn title={L("Chiudi richiesta", "Close request")} variant="outline" testID="rfq-close" loading={close.isPending} onPress={() => close.mutate()} style={{ marginTop: spacing.lg }} />
          )}
        </KeyboardAwareScrollView>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { flex: 1, fontFamily: fonts.textBold, fontSize: 17, color: colors.onSurface },
  producer: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, marginBottom: spacing.xs },
  line: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: spacing.xs, lineHeight: 18 },
}));
