import { useRouter } from "expo-router";
import React from "react";
import { ScrollView } from "react-native";

import { Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { Payouts } from "@/src/screens/Payouts";
import { spacing } from "@/src/theme";

export default function CarrierEarnings() {
  const { L } = useT();
  const router = useRouter();
  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Incassi", "Earnings")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Payouts />
      </ScrollView>
    </Screen>
  );
}
