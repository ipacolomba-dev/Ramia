// Design tokens for this app. Light theme only (single warm Mediterranean palette
// from design_guidelines.json). Keys match the "color" block of that file.
//
// <View style={{ backgroundColor: colors.brandPrimary }}>
//   <Text style={{ color: colors.onBrandPrimary }}>Continue</Text>
// </View>
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//   }));
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.
// Never call StyleSheet.create with color values at module level.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // Surfaces
  surface: "#F6F1EB",
  onSurface: "#2C221E",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#2C221E",
  surfaceTertiary: "#EDE5DC",
  onSurfaceTertiary: "#5C4A3E",
  surfaceInverse: "#2C221E",
  onSurfaceInverse: "#F6F1EB",
  muted: "#7C6A5E",

  // Brand
  brand: "#C05632",
  onBrand: "#FFFFFF",
  brandPrimary: "#C05632",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#5E6C3A",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E5D4C0",
  onBrandTertiary: "#4A382D",

  // Status
  success: "#5E6C3A",
  onSuccess: "#FFFFFF",
  warning: "#D69E2E",
  onWarning: "#2C221E",
  error: "#9B2C2C",
  onError: "#FFFFFF",
  info: "#2B6CB0",
  onInfo: "#FFFFFF",

  // Lines
  border: "rgba(44, 34, 30, 0.12)",
  borderStrong: "rgba(44, 34, 30, 0.35)",
  divider: "rgba(44, 34, 30, 0.08)",
};

export type ThemeColors = typeof light;

// Editorial typography (loaded with expo-font in the root layout).
export const fonts = {
  display: "PlayfairDisplay-Bold",
  text: "DMSans-Regular",
  textMedium: "DMSans-Medium",
  textBold: "DMSans-Bold",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
