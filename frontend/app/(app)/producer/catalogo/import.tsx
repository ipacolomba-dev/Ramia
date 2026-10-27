import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as DocumentPicker from "expo-document-picker";

import { uploadPdf } from "@/src/api";
import { Btn, CenterLoader, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ImportCatalog() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const styles = useStyles();

  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; products: any[] } | null>(null);
  const [error, setError] = useState("");

  const pick = async () => {
    setError("");
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      setFileUri(res.assets[0].uri);
      setFileName(res.assets[0].name || "catalogo.pdf");
    }
  };

  const doImport = async () => {
    if (!fileUri) return;
    setError("");
    setLoading(true);
    try {
      const data = await uploadPdf(fileUri, fileName || "catalogo.pdf");
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["my-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pending"] });
      toast.show(t("import.successTitle", { n: data.imported }));
    } catch (e: any) {
      setError(e?.message ?? t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <ScreenHeader title={t("import.title")} onBack={() => router.back()} />
        <View style={styles.successWrap} testID="import-success">
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={38} color={colors.onSuccess} />
          </View>
          <Text style={styles.successTitle}>{t("import.successTitle", { n: result.imported })}</Text>
          <Text style={styles.successSub}>{t("import.successSub")}</Text>
          <View style={styles.list}>
            {result.products.map((p, i) => (
              <View key={i} style={styles.listRow} testID={`import-product-${i}`}>
                <Ionicons name="pricetag-outline" size={16} color={colors.brandSecondary} />
                <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.listPrice}>€{Number(p.price).toFixed(2)}</Text>
              </View>
            ))}
          </View>
          <Btn title={t("import.viewProducts")} testID="import-view-products" onPress={() => router.replace("/producer/dashboard")} />
          <Btn
            title={t("import.again")}
            variant="ghost"
            testID="import-again"
            onPress={() => { setResult(null); setFileUri(null); setFileName(""); }}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("import.title")} onBack={() => router.back()} />
      <View style={styles.body}>
        <View style={styles.infoCard}>
          <Ionicons name="sparkles" size={22} color={colors.brandPrimary} />
          <Text style={styles.infoText}>{t("import.sub")}</Text>
        </View>

        {loading ? (
          <View style={styles.readingBox} testID="import-reading">
            <CenterLoader />
            <Text style={styles.readingText}>{t("import.reading")}</Text>
          </View>
        ) : (
          <Pressable testID="import-pick-file" onPress={pick} style={styles.dropzone} accessibilityRole="button">
            <Ionicons name={fileUri ? "document-text" : "cloud-upload-outline"} size={40} color={fileUri ? colors.brandSecondary : colors.muted} />
            <Text style={styles.dropTitle}>{fileUri ? t("import.picked") : t("import.pick")}</Text>
            {fileUri ? <Text style={styles.dropName} numberOfLines={1}>{fileName}</Text> : null}
            {fileUri ? <Text style={styles.dropChange}>{t("import.change")}</Text> : null}
          </Pressable>
        )}

        {error ? <Text style={styles.error} testID="import-error">{error}</Text> : null}
        <Text style={styles.hint}>{t("import.hint")}</Text>

        {!loading && (
          <Btn
            title={t("import.upload")}
            size="lg"
            icon="download"
            testID="import-upload-button"
            disabled={!fileUri}
            onPress={doImport}
          />
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  body: { flex: 1, padding: spacing.xl },
  infoCard: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  infoText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.onBrandTertiary, lineHeight: 19 },
  dropzone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    paddingVertical: spacing.xxxl,
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  dropTitle: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  dropName: { fontFamily: fonts.text, fontSize: 12, color: colors.brandSecondary },
  dropChange: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary, marginTop: spacing.xs },
  readingBox: { paddingVertical: spacing.xl, alignItems: "center" },
  readingText: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.muted, marginTop: spacing.md },
  error: { color: colors.error, fontFamily: fonts.textMedium, fontSize: 13, marginTop: spacing.lg },
  hint: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginVertical: spacing.lg, lineHeight: 18 },
  successWrap: { flex: 1, padding: spacing.xl, alignItems: "center" },
  successIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  successTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, textAlign: "center" },
  successSub: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, textAlign: "center", marginVertical: spacing.md, lineHeight: 19 },
  list: { alignSelf: "stretch", marginVertical: spacing.md },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  listName: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  listPrice: { fontFamily: fonts.textBold, fontSize: 13, color: colors.brandPrimary },
}));
