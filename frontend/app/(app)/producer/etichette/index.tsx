import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Btn, CenterLoader, EmptyState, ErrorBanner, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { LabelRequest } from "@/src/types";

export default function ProducerLabels() {
  const { colors } = useTheme();
  const { t } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const styles = useStyles();

  const labels = useQuery({
    queryKey: ["label-requests", "producer", user?.id],
    queryFn: () => api<LabelRequest[]>("/labels/requests?mine=1"),
    enabled: !!user && user.role === "producer",
  });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader
        title={t("labelsProducer.title")}
        onBack={() => router.back()}
        right={
          <Pressable testID="producer-labels-new-button" onPress={() => router.push("/producer/etichette/form")} accessibilityRole="button">
            <Ionicons name="add-circle" size={26} color={colors.brandPrimary} />
          </Pressable>
        }
      />
      <View style={{ flex: 1 }}>
        <View style={styles.infoCard}>
          <Ionicons name="document-text" size={20} color={colors.brandSecondary} />
          <Text style={styles.infoText}>{t("labelsProducer.sub")}</Text>
        </View>

        {labels.isLoading ? (
          <CenterLoader />
        ) : labels.isError ? (
          <ErrorBanner message={t("common.error")} onRetry={() => labels.refetch()} />
        ) : (labels.data ?? []).length === 0 ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState icon="document-text-outline" title={t("labelsProducer.empty")} subtitle={t("labelsProducer.emptySub")} />
            <Btn title={t("labelsProducer.new")} icon="add" testID="producer-labels-empty-cta" onPress={() => router.push("/producer/etichette/form")} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            {labels.data!.map((req) => (
              <Pressable
                key={req.id}
                testID={`producer-label-${req.id}`}
                onPress={() => router.push(`/producer/etichette/${req.id}`)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.product}>{req.product_name}</Text>
                  <Text style={styles.market}>{req.target_market}</Text>
                  <Text style={styles.offers}>
                    {req.offers.length} {t("label.offers").toLowerCase()}
                  </Text>
                </View>
                <Badge
                  label={t(req.status === "open" ? "label.open" : req.status === "in_progress" ? "label.inProgress" : "label.done")}
                  tone={req.status === "open" ? "warning" : req.status === "in_progress" ? "info" : "success"}
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  infoCard: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    margin: spacing.lg,
  },
  infoText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.onBrandTertiary, lineHeight: 19 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  product: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  market: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary, marginTop: 2 },
  offers: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: spacing.xs },
}));
