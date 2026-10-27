import React from "react";
import { Pressable, Text, View, ViewStyle } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Small shared building blocks for the role-area screens. */

export function Card({ children, onPress, testID, style }: { children: React.ReactNode; onPress?: () => void; testID?: string; style?: ViewStyle }) {
  const styles = useStyles();
  if (!onPress) return <View testID={testID} style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.88 }]}>
      {children}
    </Pressable>
  );
}

export function Stat({ value, label, testID }: { value: string | number; label: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat} testID={testID}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.md }}>{children}</View>;
}

export function Section({ title, right }: { title: string; right?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function LinkRow({ icon, label, onPress, testID, hint }: { icon: string; label: string; onPress: () => void; testID: string; hint?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.85 }]}>
      <View style={styles.linkIcon}>
        <Ionicons name={icon as any} size={19} color={colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkLabel}>{label}</Text>
        {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.muted}>{children}</Text>;
}

export function Notice({ text, icon = "information-circle" }: { text: string; icon?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.notice}>
      <Ionicons name={icon as any} size={15} color={colors.onBrandTertiary} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable key={o.key} testID={`seg-${o.key}`} onPress={() => onChange(o.key)} accessibilityRole="button"
          style={[styles.segmentBtn, value === o.key && { backgroundColor: colors.brandPrimary }]}>
          <Text style={[styles.segmentText, value === o.key && { color: colors.onBrandPrimary }]} numberOfLines={1}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const fmtEur = (n: number) => `€${(n ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("it-IT") : "—");

const useStyles = makeStyles((colors: ThemeColors) => ({
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md },
  stat: { flexGrow: 1, minWidth: 96, flexBasis: "28%", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  statValue: { fontFamily: fonts.textBold, fontSize: 18, color: colors.brandPrimary },
  statLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 2 },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.onSurface },
  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, minHeight: 56 },
  linkIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  linkLabel: { fontFamily: fonts.textMedium, fontSize: 15, color: colors.onSurface },
  title: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  muted: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  notice: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.md },
  noticeText: { flex: 1, fontFamily: fonts.text, fontSize: 12, color: colors.onBrandTertiary, lineHeight: 16 },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 3, marginBottom: spacing.md },
  segmentBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: "center", minHeight: 36, justifyContent: "center" },
  segmentText: { fontFamily: fonts.textBold, fontSize: 12, color: colors.onSurfaceTertiary },
}));
