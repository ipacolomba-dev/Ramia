import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Img } from "@/src/components/Img";
import { Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1452195100486-6cc337d52439?auto=format&fit=crop&w=1200&q=70";

function Paragraphs({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <>
      {text.split("\n\n").map((p, i) => (
        <Text key={i} style={styles.body}>
          {p}
        </Text>
      ))}
    </>
  );
}

export default function About() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const services = [
    { icon: "cube", label: t("about.serviceLogistics") },
    { icon: "airplane", label: t("about.serviceShipping") },
    { icon: "document-text", label: t("about.serviceDocs") },
  ];
  const who = [t("about.who1"), t("about.who2"), t("about.who3")];

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("about.title")} onBack={() => router.back()} />
      <Screen scroll contentStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.hero} testID="about-hero">
          <Img uri={HERO} style={{ width: "100%", height: "100%" }} />
          <LinearGradient
            colors={["rgba(44,34,30,0.15)", "rgba(44,34,30,0.55)", "rgba(44,34,30,0.92)"]}
            style={styles.heroScrim}
          />
          <View style={styles.heroContent}>
            <View style={styles.leafRow}>
              <Image source={require("../../assets/images/logo-emblem.png")} style={styles.aboutEmblem} contentFit="contain" />
              <Text style={styles.overline}>{t("about.tagline").toUpperCase()}</Text>
            </View>
            <Text style={styles.wordmark}>’Ra mia</Text>
            <Text style={styles.heroTitle}>{t("about.hero")}</Text>
          </View>
        </View>

        <View style={styles.section} testID="about-intro">
          <Paragraphs text={t("about.intro")} />
        </View>

        <View style={styles.divider} />

        <View style={styles.section} testID="about-what">
          <View style={styles.headingRow}>
            <View style={styles.headingBar} />
            <Text style={styles.heading}>{t("about.whatTitle")}</Text>
          </View>
          <Paragraphs text={t("about.whatBody")} />
          <View style={styles.serviceGrid}>
            {services.map((s) => (
              <View key={s.label} style={styles.serviceCard}>
                <View style={styles.serviceIcon}>
                  <Ionicons name={s.icon as any} size={20} color={colors.onBrandSecondary} />
                </View>
                <Text style={styles.serviceLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.section} testID="about-who">
          <View style={styles.headingRow}>
            <View style={styles.headingBar} />
            <Text style={styles.heading}>{t("about.whoTitle")}</Text>
          </View>
          {who.map((w, i) => (
            <View key={i} style={styles.whoRow}>
              <Ionicons name="ellipse" size={7} color={colors.brandPrimary} style={{ marginTop: 7 }} />
              <Text style={styles.whoText}>{w}</Text>
            </View>
          ))}
        </View>

        <View style={styles.visionCard} testID="about-vision">
          <Ionicons name="compass" size={24} color={colors.brandTertiary} />
          <Text style={styles.visionTitle}>{t("about.visionTitle")}</Text>
          <Text style={styles.visionBody}>{t("about.visionBody")}</Text>
        </View>
      </Screen>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  hero: { height: 240, position: "relative" },
  heroScrim: { position: "absolute", width: "100%", height: "100%" },
  heroContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.xl },
  leafRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  aboutEmblem: { width: 72, height: 72 },
  overline: { fontFamily: fonts.textBold, fontSize: 11, letterSpacing: 2, color: colors.brandTertiary },
  wordmark: { fontFamily: fonts.display, fontSize: 40, color: "#F6F1EB", lineHeight: 44 },
  heroTitle: { fontFamily: fonts.textMedium, fontSize: 16, color: "#E5D4C0", marginTop: spacing.xs },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  body: { fontFamily: fonts.text, fontSize: 15, color: colors.onSurfaceSecondary, lineHeight: 24, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.divider, marginHorizontal: spacing.xl, marginTop: spacing.md },
  headingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  headingBar: { width: 4, height: 22, borderRadius: 2, backgroundColor: colors.brandPrimary },
  heading: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  serviceGrid: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  serviceCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  serviceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  serviceLabel: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurface, textAlign: "center" },
  whoRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  whoText: { flex: 1, fontFamily: fonts.text, fontSize: 15, color: colors.onSurfaceSecondary, lineHeight: 22 },
  visionCard: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  visionTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurfaceInverse },
  visionBody: { fontFamily: fonts.text, fontSize: 15, color: "rgba(246,241,235,0.9)", lineHeight: 23 },
}));
