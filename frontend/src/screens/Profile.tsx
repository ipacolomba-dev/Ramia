import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/auth";
import { VerificationBanner } from "@/src/components/VerificationBanner";
import { Screen } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Role } from "@/src/types";

function MenuRow({
  icon,
  label,
  testID,
  onPress,
  tint,
}: {
  icon: string;
  label: string;
  testID: string;
  onPress: () => void;
  tint?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.85 }]}>
      <View style={[styles.menuIcon, { backgroundColor: tint ? `${tint}22` : colors.surfaceTertiary }]}>
        <Ionicons name={icon as any} size={19} color={tint ?? colors.brandPrimary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function ProfileTab() {
  const { colors } = useTheme();
  const { t, L, lang, setLang } = useT();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  if (!user) {
    return (
      <Screen style={{ justifyContent: "center", paddingBottom: insets.bottom }}>
        <Emptyish title={t("auth.loginTitle")} subtitle={t("welcome.guestHint")} />
        <View style={{ flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl }}>
          <Pressable
            testID="profile-login-button"
            onPress={() => router.push("/login")}
            style={[styles.authBtn, { backgroundColor: colors.brandPrimary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.authBtnText, { color: colors.onBrandPrimary }]}>{t("auth.login")}</Text>
          </Pressable>
          <Pressable
            testID="profile-register-button"
            onPress={() => router.push("/register")}
            style={[styles.authBtn, { borderWidth: 1.5, borderColor: colors.brandPrimary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.authBtnText, { color: colors.brandPrimary }]}>{t("auth.register")}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const companyRoute = ({ producer: "/producer/azienda", business: "/buyer/azienda", reseller: "/buyer/azienda", logistics: "/logistics/azienda", collaborator: "/compliance/azienda" } as Record<string, string>)[user.role];

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]} testID="profile-tab">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user.company_name || user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <View style={styles.roleBadge}>
            <Ionicons
              name={user.role === "producer" ? "leaf" : user.role === "business" || user.role === "reseller" ? "briefcase" : user.role === "admin" ? "shield" : user.role === "collaborator" ? "document-text" : user.role === "logistics" ? "car" : "person"}
              size={12}
              color={colors.onBrandPrimary}
            />
            <Text style={styles.roleText}>{t(`role.${user.role}`)}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <VerificationBanner />
        </View>
        <View style={styles.langRow}>
          <Text style={styles.menuLabel}>{t("common.language")}</Text>
          <View style={styles.langToggle}>
            {(["it", "en"] as const).map((l) => (
              <Pressable
                key={l}
                onPress={() => setLang(l)}
                testID={`profile-lang-${l}`}
                style={[styles.langOption, lang === l && { backgroundColor: colors.brandPrimary }]}
                accessibilityRole="button"
              >
                <Text style={[styles.langText, { color: lang === l ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>
                  {l.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.menu}>
          {user.approved === false && (
            <View style={styles.pendingBanner} testID="pending-banner">
              <Ionicons name="time-outline" size={18} color={colors.onWarning} />
              <Text style={styles.pendingText}>{t("pending.banner")}</Text>
            </View>
          )}
          {(user.role === "consumer" || user.role === "business" || user.role === "reseller") && (
            <>
              <MenuRow icon="receipt-outline" label={t("profile.orders")} testID="menu-orders" onPress={() => router.push("/buyer/ordini")} />
              <MenuRow icon="bar-chart-outline" label={L("Analisi acquisti", "Purchase analytics")} testID="menu-buyer-analytics" onPress={() => router.push("/buyer/analisi")} />
            </>
          )}
          {(user.role === "business" || user.role === "reseller") && (
            <>
              <MenuRow icon="megaphone-outline" label={L("Richieste di fornitura", "Supply requests")} testID="menu-rfq" onPress={() => router.push("/buyer/richieste")} />
              <MenuRow icon="cube-outline" label={L("Spedizioni", "Shipments")} testID="menu-buyer-shipping" onPress={() => router.push("/buyer/spedizioni")} />
            </>
          )}
          {user.role === "producer" && (
            <>
              <MenuRow icon="hand-left-outline" label={L("Dichiara affare fuori piattaforma", "Declare off-platform deal")} testID="menu-declare-deal" onPress={() => router.push("/producer/dichiarazioni")} />
              <MenuRow icon="cash-outline" label={L("Incassi", "Earnings")} testID="menu-producer-earnings" onPress={() => router.push("/producer/incassi")} tint={colors.brandSecondary} />
              <MenuRow icon="rocket-outline" label={t("profile.visibility")} testID="menu-visibility" onPress={() => router.push("/producer/visibilita")} tint={colors.brandSecondary} />
              <MenuRow icon="shield-checkmark-outline" label={L("Area compliance", "Compliance area")} testID="menu-compliance" onPress={() => router.push("/compliance/documenti")} />
            </>
          )}
          {user.role === "logistics" && (
            <MenuRow icon="cash-outline" label={L("Incassi", "Earnings")} testID="menu-carrier-earnings" onPress={() => router.push("/logistics/incassi")} tint={colors.brandSecondary} />
          )}
          {["producer", "business", "logistics", "collaborator", "reseller"].includes(user.role) && (
            <>
              <MenuRow icon="clipboard-outline" label={L("Profilo aziendale e onboarding", "Company profile & onboarding")} testID="menu-onboarding" onPress={() => router.push("/onboarding")} />
              <MenuRow icon="shield-checkmark-outline" label={L("Documenti di verifica", "Verification documents")} testID="menu-verification" onPress={() => router.push("/verifica")} />
            </>
          )}
          {(user.role === "admin" || user.role === "business") && (
            <MenuRow icon="key-outline" label={L("Sicurezza e 2FA", "Security & 2FA")} testID="menu-security" onPress={() => router.push("/sicurezza")} />
          )}
          {user.role === "admin" && (
            <MenuRow icon="shield-half-outline" label={L("Console di verifica", "Verification console")} testID="menu-verify-console" onPress={() => router.push("/admin/utenti/verifica")} />
          )}
          {companyRoute && (
            <MenuRow icon="business-outline" label={t("profile.companyProfile")} testID="menu-company-profile" onPress={() => router.push(companyRoute as any)} />
          )}
          {user.role === "admin" && (
            <>
              <MenuRow icon="cash-outline" label={t("profile.earnings")} testID="menu-earnings" onPress={() => router.push("/admin/incassi")} tint={colors.brandSecondary} />
              <MenuRow icon="pricetags-outline" label={L("Categorie", "Categories")} testID="menu-categories" onPress={() => router.push("/admin/categorie")} />
              <MenuRow icon="calculator-outline" label={L("Regole commerciali", "Commercial rules")} testID="menu-rules" onPress={() => router.push("/admin/regole")} />
              <MenuRow icon="list-outline" label={L("Registro attività", "Audit log")} testID="menu-audit" onPress={() => router.push("/admin/audit")} />
              <MenuRow icon="lock-closed-outline" label={L("Pagamenti in garanzia", "Escrow payments")} testID="menu-escrow" onPress={() => router.push("/admin/pagamenti")} />
              <MenuRow icon="git-network-outline" label={L("Registro Match", "Match Registry")} testID="menu-matches" onPress={() => router.push("/admin/match")} />
            </>
          )}
          <MenuRow icon="information-circle-outline" label={t("profile.about")} testID="menu-about" onPress={() => router.push("/chi-siamo")} />
          <MenuRow icon="help-circle-outline" label={L("Come funziona", "How it works")} testID="menu-how" onPress={() => router.push("/come-funziona")} />
        </View>

        <Pressable testID="logout-button" onPress={() => signOut()} style={styles.logoutBtn} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={19} color={colors.error} />
          <Text style={[styles.menuLabel, { color: colors.error }]}>{t("auth.logout")}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Emptyish({ title, subtitle }: { title: string; subtitle: string }) {
  const styles = useStyles();
  return (
    <View style={{ alignItems: "center", marginBottom: spacing.xl, paddingHorizontal: spacing.xl }}>
      <Text style={styles.name}>{title}</Text>
      <Text style={styles.email}>{subtitle}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  header: { alignItems: "center", paddingHorizontal: spacing.xl },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  avatarText: { color: colors.onBrandPrimary, fontFamily: fonts.display, fontSize: 26 },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, textAlign: "center" },
  email: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginTop: 2, textAlign: "center" },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  roleText: { color: colors.onBrandSecondary, fontFamily: fonts.textBold, fontSize: 11 },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  langToggle: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 3 },
  langOption: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  langText: { fontFamily: fonts.textBold, fontSize: 12 },
  menu: { marginTop: spacing.lg },
  pendingBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.warning, borderRadius: radius.md, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  pendingText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 12, color: colors.onWarning, lineHeight: 16 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  menuLabel: { flex: 1, fontFamily: fonts.textMedium, fontSize: 15, color: colors.onSurface },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  authBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.md },
  authBtnText: { fontFamily: fonts.textBold, fontSize: 15 },
}));
