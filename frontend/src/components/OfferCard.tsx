import React from "react";
import { Pressable, Text, View } from "react-native";

import { Badge } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing } from "@/src/theme";
import type { B2BOffer } from "@/src/types";

export function OfferCard({ offer, onPress }: { offer: B2BOffer; onPress: () => void }) {
  const { t } = useT();
  const styles = useStyles();
  return (
    <Pressable testID={`b2b-offer-${offer.id}`} onPress={onPress} style={({ pressed }) => [styles.offerCard, pressed && { opacity: 0.88 }]}>
      <View style={styles.offerTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
          <Text style={styles.muted}>{offer.company_name}</Text>
        </View>
        <Badge
          label={t(offer.status === "open" ? "b2b.open" : offer.status === "in_negotiation" ? "b2b.inNegotiation" : "b2b.closed")}
          tone={offer.status === "open" ? "success" : offer.status === "in_negotiation" ? "warning" : "neutral"}
        />
      </View>
      <Text style={styles.offerDesc} numberOfLines={2}>{offer.description}</Text>
      <View style={styles.offerStats}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>€{offer.unit_price.toFixed(2)}</Text>
          <Text style={styles.statLabel}>/ {offer.unit}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{offer.moq}</Text>
          <Text style={styles.statLabel}>{offer.unit} — {t("b2b.moq").toLowerCase()}</Text>
        </View>
        {offer.origin_region ? (
          <View style={styles.statBox}>
            <Text style={styles.statValue} numberOfLines={1}>{offer.origin_region}</Text>
            <Text style={styles.statLabel}>origine</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  offerCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.divider },
  offerTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  offerTitle: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  offerDesc: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 18 },
  offerStats: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  statBox: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, padding: spacing.md },
  statValue: { fontFamily: fonts.textBold, fontSize: 14, color: colors.brandPrimary },
  statLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.muted },
  muted: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
}));
