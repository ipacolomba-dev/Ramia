import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Badge, CenterLoader, EmptyState, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { TradeBuyer } from "@/src/types";

export default function TradeBuyers() {
  const { colors } = useTheme();
  const { t } = useT();
  const { country } = useLocalSearchParams<{ country?: string }>();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();

  const find = useMutation({
    mutationFn: () => api<{ buyers: TradeBuyer[] }>("/trade/find-buyers", { method: "POST", body: { country: country || null } }),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  useEffect(() => {
    find.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const buyers = find.data?.buyers ?? [];

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("trade.buyersTitle")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="trade-buyers">
        {country ? <Text style={styles.sub}>{country}</Text> : null}
        {find.isPending ? (
          <CenterLoader />
        ) : buyers.length === 0 ? (
          <EmptyState icon="people-outline" title={t("trade.buyersTitle")} />
        ) : (
          buyers.map((b) => (
            <View key={b.id} style={styles.card} testID={`buyer-${b.id}`}>
              <View style={styles.avatar}>
                <Ionicons name="storefront" size={18} color={colors.onBrandSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{b.company_name}</Text>
                <Text style={styles.meta}>{b.business_type || "—"}{b.region ? ` · ${b.region}` : ""}</Text>
              </View>
              {b.match && <Badge label={t("trade.match")} tone="success" />}
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  sub: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.brandSecondary, marginVertical: spacing.md },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  meta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
}));
