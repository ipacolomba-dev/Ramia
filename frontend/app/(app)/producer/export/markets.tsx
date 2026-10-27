import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "@/src/api";
import { Btn, CenterLoader, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { ProductPicker } from "@/src/components/trade";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { MarketRank, Product } from "@/src/types";

export default function TradeMarkets() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();

  const [productId, setProductId] = useState<string | null>(null);

  const find = useMutation({
    mutationFn: () => api<{ markets: MarketRank[]; note: string }>("/trade/find-markets", { method: "POST", body: { product_id: productId } }),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const markets = find.data?.markets ?? [];

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("trade.action.findMarkets")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="trade-markets">
        <ProductPicker value={productId} onChange={(p: Product) => setProductId(p.id)} />
        <Btn
          title={find.isPending ? t("trade.running") : t("trade.run")}
          icon="trophy"
          size="lg"
          testID="trade-find-markets"
          loading={find.isPending}
          disabled={!productId}
          onPress={() => find.mutate()}
        />
        {find.isPending && <CenterLoader />}

        {find.data && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.title}>{t("trade.bestMarkets")}</Text>
            {markets.map((m, i) => (
              <Pressable
                key={m.country}
                testID={`trade-market-rank-${i}`}
                onPress={() => router.push(`/producer/export/market?productId=${productId}&country=${encodeURIComponent(m.country)}`)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Text style={styles.country}>{m.country}</Text>
                  <View style={styles.scoreBox}>
                    <Text style={styles.score}>{Math.round(m.score)}</Text>
                    <Text style={styles.scoreMax}>/100</Text>
                  </View>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, m.score))}%` }]} />
                </View>
                {m.complexity ? <Text style={styles.complexity}>{t("trade.complexity")}: {m.complexity}</Text> : null}
                {(m.reasons || []).map((r, j) => (
                  <Text key={j} style={styles.reason}>• {r}</Text>
                ))}
                {m.data_available === false ? <Text style={styles.na}>{t("trade.dataNA")}</Text> : null}
              </Pressable>
            ))}
            {find.data.note ? <Text style={styles.note}>{find.data.note}</Text> : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rank: { fontFamily: fonts.display, fontSize: 20, color: colors.brandSecondary, width: 24 },
  country: { flex: 1, fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  scoreBox: { flexDirection: "row", alignItems: "baseline" },
  score: { fontFamily: fonts.display, fontSize: 22, color: colors.brandPrimary },
  scoreMax: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, marginVertical: spacing.sm, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.brandPrimary },
  complexity: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceTertiary, marginBottom: spacing.xs },
  reason: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
  na: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: spacing.xs, fontStyle: "italic" },
  note: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
}));
