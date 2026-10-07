import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function TradeHub() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const styles = useStyles();

  const actions = [
    { key: "sell", label: t("trade.action.sell"), to: "/trade/market" },
    { key: "analyze", label: t("trade.action.analyze"), to: "/trade/compliance" },
    { key: "requirements", label: t("trade.action.requirements"), to: "/trade/market" },
    { key: "findMarkets", label: t("trade.action.findMarkets"), to: "/trade/markets" },
  ];

  const sections = [
    { key: "dashboard", icon: "grid", label: t("trade.dashboard"), to: "/trade/dashboard" },
    { key: "history", icon: "time", label: t("trade.history"), to: "/trade/history" },
    { key: "chat", icon: "chatbubbles", label: t("trade.openChat"), to: "/advisor" },
    { key: "buyers", icon: "people", label: t("trade.findBuyers"), to: "/trade/buyers" },
  ];

  return (
    <Screen scroll contentStyle={{ paddingBottom: 60 }}>
      <ScreenHeader title={t("trade.title")} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg }} testID="trade-hub">
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="earth" size={24} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.heroTitle}>{t("trade.help")}</Text>
          <Text style={styles.heroSub}>{t("trade.subtitle")}</Text>
        </View>

        {actions.map((a) => (
          <Pressable key={a.key} testID={`trade-action-${a.key}`} onPress={() => router.push(a.to as any)} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.9 }]}>
            <Text style={styles.actionText}>{a.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.brandPrimary} />
          </Pressable>
        ))}

        <Text style={styles.free}>{t("trade.freeQuestion")}</Text>

        <View style={styles.grid}>
          {sections.map((s) => (
            <Pressable key={s.key} testID={`trade-section-${s.key}`} onPress={() => router.push(s.to as any)} style={({ pressed }) => [styles.gridCard, pressed && { opacity: 0.9 }]}>
              <Ionicons name={s.icon as any} size={22} color={colors.brandSecondary} />
              <Text style={styles.gridLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={15} color={colors.brandSecondary} />
          <Text style={styles.disclaimerText}>{t("trade.disclaimer")}</Text>
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  hero: { alignItems: "center", paddingVertical: spacing.lg },
  heroIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  heroTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface },
  heroSub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginTop: 2, textAlign: "center" },
  actionCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
  actionText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 15, color: colors.onSurface },
  free: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, textAlign: "center", marginVertical: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridCard: { width: "47%", flexGrow: 1, alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.lg },
  gridLabel: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },
  disclaimer: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  disclaimerText: { flex: 1, fontFamily: fonts.text, fontSize: 11, color: colors.onBrandTertiary, lineHeight: 15 },
}));
