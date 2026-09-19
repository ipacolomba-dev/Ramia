import React from "react";
import { Platform, View, ViewStyle } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";

import { fullImgUrl } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";

/**
 * Image with auth-aware source resolution.
 * Backend-uploaded files (/api/files/...) need a Bearer header on native and a
 * ?token= query param on web; external URLs (demo catalog) load as-is.
 */
export function Img({
  uri,
  style,
  contentFit = "cover",
  placeholderBg,
}: {
  uri?: string | null;
  style?: ViewStyle | any;
  contentFit?: "cover" | "contain" | "fill";
  placeholderBg?: string;
}) {
  const { colors } = useTheme();
  const { token } = useAuth();

  if (!uri) {
    return (
      <View style={[style, { backgroundColor: placeholderBg ?? colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="image-outline" size={26} color={colors.muted} />
      </View>
    );
  }

  const full = fullImgUrl(uri) ?? uri;
  let source: any;
  if (full.includes("/api/files/")) {
    source =
      Platform.OS === "web"
        ? { uri: token ? `${full}${full.includes("?") ? "&" : "?"}token=${token}` : full }
        : { uri: full, headers: { Authorization: `Bearer ${token}` } };
  } else {
    source = { uri: full };
  }

  return <Image source={source} style={style} contentFit={contentFit} transition={160} recyclingKey={full} placeholder={null} />;
}
