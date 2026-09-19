import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Img } from "@/src/components/Img";
import { Badge } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { Product } from "@/src/types";

export function ProductCard({
  product,
  onPress,
  onAdd,
}: {
  product: Product;
  onPress: () => void;
  onAdd?: () => void;
}) {
  const { colors } = useTheme();
  const { t, lang } = useT();
  const styles = useStyles();

  const name = lang === "en" && product.name_en ? product.name_en : product.name;

  return (
    <View style={styles.card} testID={`product-card-${product.id}`}>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.88 }]}>
        <View>
          <Img uri={product.image_url} style={styles.image} />
          {product.featured && (
            <View style={styles.featuredBadge}>
              <Badge label={t("home.featured")} tone="brand" icon="star" />
            </View>
          )}
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.producer} numberOfLines={1}>
            {product.company_name}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>€{product.price.toFixed(2)}</Text>
            <Text style={styles.unit}>/ {product.unit}</Text>
          </View>
        </View>
      </Pressable>
      {onAdd && (
        <Pressable
          testID={`product-add-${product.id}`}
          onPress={onAdd}
          style={styles.addBtn}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  card: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.divider,
  },
  image: { width: "100%", aspectRatio: 4 / 3 },
  featuredBadge: { position: "absolute", top: spacing.sm, left: spacing.sm },
  addBtn: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: spacing.md, gap: 2 },
  name: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, height: 36 },
  producer: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: spacing.xs },
  price: { fontFamily: fonts.textBold, fontSize: 16, color: colors.brandPrimary },
  unit: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginLeft: 3 },
}));
