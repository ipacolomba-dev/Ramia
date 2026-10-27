import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import type { Role } from "@/src/types";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const CATEGORIES: { role: Role; icon: string; route: string }[] = [
  { role: "producer", icon: "leaf", route: "/register-producer" },
  { role: "business", icon: "briefcase", route: "/register-buyer" },
  { role: "consumer", icon: "person", route: "/register-simple?role=consumer" },
  { role: "logistics", icon: "car", route: "/register-simple?role=logistics" },
  { role: "collaborator", icon: "flask", route: "/register-simple?role=collaborator" },
];

export default function RegisterLanding() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const styles = useStyles();

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("auth.register")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl }} bottomOffset={16} testID="register-landing">
        <Text style={styles.title}>{t("reg.landing.title")}</Text>
        <Text style={styles.subtitle}>{t("reg.landing.subtitle")}</Text>

        {CATEGORIES.map(({ role, icon, route }) => (
          <Pressable
            key={role}
            testID={`reg-cat-${role}`}
            onPress={() => router.push(route as any)}
            style={({ pressed }) => [styles.card, pressed && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
            accessibilityRole="button"
          >
            <View style={styles.cardIcon}>
              <Ionicons name={icon as any} size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t(`reg.cat.${role}.title`)}</Text>
              <Text style={styles.cardDesc}>{t(`reg.cat.${role}.desc`)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        ))}

        <Pressable testID="go-to-login-button" onPress={() => router.replace("/login")} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkText}>
            {t("auth.haveAccount")} <Text style={{ fontFamily: fonts.textBold, color: colors.brandPrimary }}>{t("auth.login")}</Text>
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface, marginBottom: spacing.xs, lineHeight: 30 },
  subtitle: { fontFamily: fonts.text, fontSize: 14, color: colors.muted, marginBottom: spacing.xl, lineHeight: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  cardDesc: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },
  link: { alignItems: "center", marginTop: spacing.lg },
  linkText: { fontFamily: fonts.text, fontSize: 14, color: colors.muted },
}));
