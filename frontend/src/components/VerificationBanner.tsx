import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const PRO_ROLES = ["producer", "business", "logistics", "collaborator", "reseller"];

/** Email + company verification status, with the next action. Hidden when everything is done. */
export function VerificationBanner() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { L } = useT();
  const router = useRouter();
  const styles = useStyles();
  const resend = useMutation({ mutationFn: () => api("/auth/request-verification", { method: "POST" }) });
  const ob = useQuery({ queryKey: ["onboarding"], queryFn: () => api<{ status: string | null }>("/onboarding"), enabled: !!user && PRO_ROLES.includes(user.role) });
  if (!user) return null;
  const status = ob.data?.status ?? (user as any).verification_status;
  const needsEmail = user.email_verified === false;
  const needsCompany = PRO_ROLES.includes(user.role) && status && status !== "approved";
  if (!needsEmail && !needsCompany) return null;

  const companyText: Record<string, [string, string]> = {
    draft: ["Completa il profilo aziendale e carica i documenti: le funzioni B2B si attivano dopo la verifica.", "Complete your company profile and documents: B2B features unlock after verification."],
    pending: ["Verifica in corso: il team 'Ra mia sta controllando i tuoi documenti.", "Verification in progress: our team is reviewing your documents."],
    rejected: ["Verifica respinta: controlla i documenti segnalati e invia di nuovo.", "Verification rejected: check the flagged documents and resubmit."],
    suspended: ["Azienda sospesa: contatta l'amministratore.", "Company suspended: contact the administrator."],
  };
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }} testID="verification-banner">
      {needsEmail && (
        <View style={styles.box}>
          <Ionicons name="mail-unread-outline" size={18} color={colors.onWarning} />
          <Text style={styles.text}>{resend.isSuccess ? L("Email inviata: controlla la posta.", "Email sent: check your inbox.") : L("Verifica la tua email.", "Verify your email.")}</Text>
          {!resend.isSuccess && (
            <Pressable testID="banner-resend-email" onPress={() => resend.mutate()} accessibilityRole="button" style={styles.btn}>
              <Text style={styles.btnText}>{L("Invia di nuovo", "Resend")}</Text>
            </Pressable>
          )}
        </View>
      )}
      {needsCompany && (
        <Pressable testID="banner-verification" style={styles.box} accessibilityRole="button" onPress={() => router.push(status === "draft" || status === "rejected" ? "/onboarding" : "/verifica")}>
          <Ionicons name="shield-half-outline" size={18} color={colors.onWarning} />
          <Text style={styles.text}>{L(...(companyText[status] ?? companyText.draft))}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.onWarning} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  box: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.warning, borderRadius: radius.md, padding: spacing.md, minHeight: 48 },
  text: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.onWarning, lineHeight: 18 },
  btn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.onWarning, minHeight: 32, justifyContent: "center" },
  btnText: { fontFamily: fonts.textBold, fontSize: 12, color: colors.onWarning },
}));
