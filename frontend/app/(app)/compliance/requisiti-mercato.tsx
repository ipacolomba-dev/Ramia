import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Btn, CenterLoader, Field, Input, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { CountryChips, KnowledgeBaseView, ProductPicker } from "@/src/components/trade";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { ComplianceResult, Product } from "@/src/types";

const STATUS = {
  ok: { icon: "checkmark-circle", color: "success" as const },
  warn: { icon: "alert-circle", color: "warning" as const },
  missing: { icon: "close-circle", color: "error" as const },
};

export default function TradeCompliance() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();

  const [productId, setProductId] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [labelText, setLabelText] = useState("");

  const check = useMutation({
    mutationFn: () => api<ComplianceResult>("/trade/compliance", { method: "POST", body: { product_id: productId, country, label_text: labelText || null } }),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const r = check.data;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("trade.compliance.title")} onBack={router.canGoBack() ? () => router.back() : undefined} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 60 }} bottomOffset={20} testID="trade-compliance">
        <ProductPicker value={productId} onChange={(p: Product) => setProductId(p.id)} />
        <CountryChips value={country} onChange={setCountry} />
        <Field label={t("trade.labelText")}>
          <Input testID="trade-label-text" value={labelText} onChangeText={setLabelText} multiline placeholder="…" />
        </Field>
        <Btn
          title={check.isPending ? t("trade.running") : t("trade.run")}
          icon="shield-checkmark"
          size="lg"
          testID="trade-run-compliance"
          loading={check.isPending}
          disabled={!productId || !country}
          onPress={() => check.mutate()}
        />
        {check.isPending && <CenterLoader />}

        {r && (
          <View style={{ marginTop: spacing.lg }}>
            {r.summary ? <Text style={styles.summary}>{r.summary}</Text> : null}
            {(r.items || []).map((it, i) => {
              const s = STATUS[it.status] || STATUS.warn;
              return (
                <View key={i} style={styles.item} testID={`compliance-item-${i}`}>
                  <Ionicons name={s.icon as any} size={20} color={colors[s.color]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemLabel}>{it.label}</Text>
                    {it.note ? <Text style={styles.itemNote}>{it.note}</Text> : null}
                  </View>
                </View>
              );
            })}
            {r.label_adjustment_recommended && (
              <View style={styles.labBox} testID="compliance-lab-cta">
                <Text style={styles.labText}>{t("trade.labelAdjust")}</Text>
                <Btn title={t("trade.requestLab")} icon="document-text" variant="secondary" size="sm" testID="compliance-request-lab" onPress={() => router.push("/producer/etichette/form")} style={{ marginTop: spacing.sm }} />
              </View>
            )}
            <KnowledgeBaseView kb={r.kb} />
          </View>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  summary: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 20, marginBottom: spacing.md },
  item: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  itemLabel: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  itemNote: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  labBox: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  labText: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onBrandTertiary },
}));
