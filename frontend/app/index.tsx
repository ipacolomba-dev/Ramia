import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Img } from "@/src/components/Img";
import { Btn } from "@/src/components/ui";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1567072629554-20e689de2400?auto=format&fit=crop&w=1200&q=70";

export default function Welcome() {
  const { colors } = useTheme();
  const { t, lang, setLang } = useT();
  const { user, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <Img uri={HERO} style={styles.hero} contentFit="cover" />
      <LinearGradient
        colors={["rgba(44,34,30,0.15)", "rgba(44,34,30,0.55)", "rgba(44,34,30,0.92)"]}
        style={styles.scrim}
      />
      <View style={[styles.langRow, { top: insets.top + spacing.md }]}>
        <View style={styles.langToggle} testID="welcome-language-toggle">
          {(["it", "en"] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLang(l)}
              style={[styles.langOption, lang === l && { backgroundColor: colors.onSurfaceInverse }]}
              testID={`welcome-lang-${l}`}
              accessibilityRole="button"
            >
              <Text style={[styles.langText, { color: lang === l ? colors.onSurface : colors.onSurfaceInverse }]}>
                {l.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.wordmarkRow}>
          <Ionicons name="leaf" size={22} color={colors.brandTertiary} style={{ marginRight: spacing.sm }} />
          <Text style={styles.overline}>MEDIAZIONE AGROALIMENTARE · SICILIA</Text>
        </View>
        <Text style={styles.title}>{t("app.name")}</Text>
        <Text style={styles.subtitle}>{t("app.welcome")}</Text>
        <Text style={styles.body}>{t("app.welcomeSub")}</Text>
        <View style={styles.ctaRow}>
          {!loading && user ? (
            <Btn
              title={t("welcome.enter")}
              size="lg"
              icon="arrow-forward"
              testID="welcome-enter-button"
              style={{ flex: 1 }}
              onPress={() => router.replace("/(tabs)")}
            />
          ) : (
            <>
              <Btn
                title={t("welcome.login")}
                size="lg"
                variant="ghost"
                testID="welcome-login-button"
                style={{ flex: 1, backgroundColor: "rgba(246,241,235,0.14)", borderWidth: 1.5, borderColor: "rgba(246,241,235,0.6)" }}
                onPress={() => router.push("/auth/login")}
              />
              <Btn
                title={t("welcome.register")}
                size="lg"
                testID="welcome-register-button"
                style={{ flex: 1 }}
                onPress={() => router.push("/auth/register")}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  container: { flex: 1, backgroundColor: colors.surfaceInverse },
  hero: { ...({} as any), position: "absolute", width: "100%", height: "100%" },
  scrim: { position: "absolute", width: "100%", height: "100%" },
  langRow: { position: "absolute", left: 0, right: 0, alignItems: "flex-end", paddingHorizontal: spacing.lg },
  langToggle: {
    flexDirection: "row",
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(246,241,235,0.5)",
  },
  langOption: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  langText: { fontFamily: fonts.textBold, fontSize: 12 },
  content: { flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.xl },
  wordmarkRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  overline: { fontFamily: fonts.textBold, fontSize: 12, letterSpacing: 2, color: colors.brandTertiary },
  title: { fontFamily: fonts.display, fontSize: 44, color: "#F6F1EB", lineHeight: 50 },
  subtitle: { fontFamily: fonts.textBold, fontSize: 18, color: "#E5D4C0", marginTop: spacing.md },
  body: { fontFamily: fonts.text, fontSize: 14, color: "rgba(246,241,235,0.85)", marginTop: spacing.sm, lineHeight: 20 },
  ctaRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
}));
