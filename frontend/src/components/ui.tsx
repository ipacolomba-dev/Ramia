import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

// ---------------------------------------------------------------- Toast

type ToastKind = "success" | "error" | "info";
interface ToastCtx {
  show: (msg: string, kind?: ToastKind) => void;
}
const ToastContext = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind; id: number } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();

  const show = useCallback((msg: string, kind: ToastKind = "success") => {
    setToast({ msg, kind, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
    }, 2600);
    return () => clearTimeout(timer);
  }, [toast, opacity]);

  const bg = toast?.kind === "error" ? colors.error : toast?.kind === "info" ? colors.info : colors.surfaceInverse;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            { top: insets.top + spacing.sm, backgroundColor: bg, opacity, zIndex: 1000, elevation: 1000 },
          ]}
        >
          <Text style={styles.toastText} numberOfLines={3}>
            {toast.msg}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------- Screen

export function Screen({
  children,
  scroll = false,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: any;
  contentStyle?: any;
}) {
  const { colors } = useTheme();
  if (scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.surface }, style]}>
        <ScrollView
          contentContainerStyle={[{ flexGrow: 1 }, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={[{ flex: 1, backgroundColor: colors.surface }, style]}>{children}</View>
  );
}

// ---------------------------------------------------------------- Buttons

export function Btn({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  testID?: string;
  style?: any;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isDisabled = disabled || loading;

  const bg =
    variant === "primary"
      ? colors.brandPrimary
      : variant === "secondary"
        ? colors.brandSecondary
        : variant === "danger"
          ? colors.error
          : variant === "outline"
            ? "transparent"
            : "transparent";
  const fg =
    variant === "primary"
      ? colors.onBrandPrimary
      : variant === "secondary"
        ? colors.onBrandSecondary
        : variant === "danger"
          ? colors.onError
          : variant === "outline"
            ? colors.brandPrimary
            : colors.brandPrimary;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        size === "sm" ? styles.btnSm : size === "lg" ? styles.btnLg : styles.btnMd,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "outline" && { borderWidth: 1.5, borderColor: colors.brandPrimary },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon as any} size={size === "sm" ? 15 : 18} color={fg} style={{ marginRight: spacing.xs }} />}
          <Text style={[styles.btnText, { color: fg }, size === "sm" && { fontSize: 13 }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Inputs

export function Input(props: TextInputProps & { testID?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: "top" }, props.style]}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------- Chip

export function Chip({
  label,
  selected,
  onPress,
  icon,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { flexShrink: 0, opacity: pressed ? 0.8 : 1 },
        selected && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon as any}
          size={14}
          color={selected ? colors.onBrandPrimary : colors.onSurfaceTertiary}
          style={{ marginRight: 4 }}
        />
      ) : null}
      <Text style={[styles.chipText, selected && { color: colors.onBrandPrimary, fontFamily: fonts.textBold }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- Badge

export function Badge({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: "success" | "warning" | "error" | "info" | "brand" | "neutral";
  icon?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const colorMap: Record<string, { bg: string; fg: string }> = {
    success: { bg: colors.success, fg: colors.onSuccess },
    warning: { bg: colors.warning, fg: colors.onWarning },
    error: { bg: colors.error, fg: colors.onError },
    info: { bg: colors.info, fg: colors.onInfo },
    brand: { bg: colors.brandPrimary, fg: colors.onBrandPrimary },
    neutral: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
  };
  const c = colorMap[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      {icon ? <Ionicons name={icon as any} size={11} color={c.fg} style={{ marginRight: 3 }} /> : null}
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- States

export function CenterLoader() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxxl }}>
      <ActivityIndicator size="large" color={colors.brandPrimary} testID="loading-indicator" />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.empty} testID="empty-state">
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceTertiary }]}>
        <Ionicons name={icon as any} size={28} color={colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  const styles = useStyles();
  return (
    <View style={styles.errorBanner} testID="error-banner">
      <Ionicons name="alert-circle" size={18} color="#FFFFFF" style={{ marginRight: spacing.sm }} />
      <Text style={styles.errorBannerText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.errorRetry} testID="error-retry-button">
          <Text style={styles.errorRetryText}>{t("common.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- Header

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]} testID="screen-header">
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12} testID="header-back-button" accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
      ) : (
        <View style={styles.backBtn} />
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 40, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

// ---------------------------------------------------------------- Sheet (modal)

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" testID="sheet-backdrop" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------- Styles

const useStyles = makeStyles((colors: ThemeColors) => ({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  toastText: { color: "#FFFFFF", fontFamily: fonts.textMedium, fontSize: 14 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  btnSm: { paddingHorizontal: spacing.md, paddingVertical: 8, minHeight: 36 },
  btnMd: { paddingHorizontal: spacing.lg, paddingVertical: 12, minHeight: 48 },
  btnLg: { paddingHorizontal: spacing.xl, paddingVertical: 16, minHeight: 56 },
  btnText: { fontFamily: fonts.textBold, fontSize: 15 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    fontFamily: fonts.text,
    color: colors.onSurface,
  },
  fieldLabel: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm },
  fieldHint: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurfaceTertiary },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: fonts.textBold, fontSize: 11 },
  empty: { alignItems: "center", paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  emptyTitle: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface, marginBottom: spacing.sm, textAlign: "center" },
  emptySub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, textAlign: "center" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.error,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  errorBannerText: { flex: 1, color: colors.onError, fontFamily: fonts.textMedium, fontSize: 13 },
  errorRetry: { marginLeft: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.2)" },
  errorRetryText: { color: colors.onError, fontFamily: fonts.textBold, fontSize: 13 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  backBtn: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, textAlign: "center" },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(44,34,30,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    maxHeight: "85%",
  },
  sheetHandle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: spacing.lg },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: spacing.lg },
}));

export { KeyboardAwareScrollView };
