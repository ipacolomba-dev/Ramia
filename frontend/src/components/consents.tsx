import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";

export interface ConsentsState {
  terms: boolean;
  privacy: boolean;
  marketing: boolean;
  setTerms: (v: boolean) => void;
  setPrivacy: (v: boolean) => void;
  setMarketing: (v: boolean) => void;
}

export function useConsents(): ConsentsState {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  return { terms, privacy, marketing, setTerms, setPrivacy, setMarketing };
}

function Checkbox({ checked, onToggle, label, testID }: { checked: boolean; onToggle: () => void; label: React.ReactNode; testID: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Pressable style={[styles.box, checked && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]} onPress={onToggle} testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked }} hitSlop={8}>
        {checked ? <Ionicons name="checkmark" size={13} color={colors.onBrandPrimary} /> : null}
      </Pressable>
      <Pressable style={{ flex: 1 }} onPress={onToggle}>
        {label}
      </Pressable>
    </View>
  );
}

export function ConsentsBlock({ state }: { state: ConsentsState }) {
  const { t } = useT();
  const styles = useStyles();
  const router = useRouter();

  return (
    <View style={styles.wrap} testID="consents-block">
      <Checkbox
        checked={state.terms}
        onToggle={() => state.setTerms(!state.terms)}
        testID="consent-terms"
        label={
          <Text style={styles.label}>
            {t("reg.consent.termsPre")}{" "}
            <Text style={styles.link} onPress={() => router.push("/legal/terms")}>{t("reg.consent.terms")}</Text>
            {" *"}
          </Text>
        }
      />
      <Checkbox
        checked={state.privacy}
        onToggle={() => state.setPrivacy(!state.privacy)}
        testID="consent-privacy"
        label={
          <Text style={styles.label}>
            {t("reg.consent.privacyPre")}{" "}
            <Text style={styles.link} onPress={() => router.push("/legal/privacy")}>{t("reg.consent.privacy")}</Text>
            {" *"}
          </Text>
        }
      />
      <Checkbox
        checked={state.marketing}
        onToggle={() => state.setMarketing(!state.marketing)}
        testID="consent-marketing"
        label={<Text style={styles.label}>{t("reg.consent.marketing")}</Text>}
      />
      <Text style={styles.hint}>{t("reg.consent.required")}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  wrap: { marginTop: spacing.md, marginBottom: spacing.lg, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
  label: { flex: 1, fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 18 },
  link: { fontFamily: fonts.textBold, color: colors.brandPrimary, textDecorationLine: "underline" },
  hint: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginTop: spacing.xs },
}));
