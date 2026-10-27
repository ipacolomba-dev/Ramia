import { Platform } from "react-native";

export const usesNativeTabs = false &&
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
