import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, Muted } from "@/src/components/blocks";
import { CenterLoader, Chip, EmptyState, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";

type Log = { id: string; actor_email: string; action: string; entity: string; entity_id: string; before: any; after: any; reason?: string; at: string };
const ENTITIES = ["business_rules", "company", "verification_document", "user", "product", "category", "role_permissions", "b2b_offer"];

export default function AuditLog() {
  const { L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const [entity, setEntity] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["audit", entity], queryFn: () => api<Log[]>(`/admin/audit-logs${entity ? `?entity=${entity}` : ""}`) });
  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Registro attività", "Audit log")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} testID="admin-audit"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        <View style={styles.chips}>
          <Chip label={L("Tutto", "All")} selected={!entity} testID="audit-all" onPress={() => setEntity(null)} />
          {ENTITIES.map((e) => <Chip key={e} label={e} selected={entity === e} testID={`audit-${e}`} onPress={() => setEntity(e)} />)}
        </View>
        {q.isLoading ? <CenterLoader /> : (q.data ?? []).length === 0 ? <EmptyState icon="list-outline" title={L("Nessuna attività", "No activity")} /> :
          q.data!.map((l) => (
            <Card key={l.id} testID={`audit-row-${l.id}`} onPress={() => setOpen(open === l.id ? null : l.id)}>
              <Text style={styles.title}>{l.action} · {l.entity}</Text>
              <Muted>{new Date(l.at).toLocaleString("it-IT")} · {l.actor_email}{l.reason ? ` · ${l.reason}` : ""}</Muted>
              {open === l.id && (
                <>
                  <Text style={styles.code}>{L("Prima", "Before")}: {JSON.stringify(l.before)}</Text>
                  <Text style={styles.code}>{L("Dopo", "After")}: {JSON.stringify(l.after)}</Text>
                </>
              )}
            </Card>
          ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  title: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  code: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
}));
