import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Btn, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const STEPS: { icon: string; it: [string, string]; en: [string, string] }[] = [
  { icon: "person-add", it: ["Registrati", "Scegli il tuo profilo: produttore, compratore, cliente, logistica o laboratorio."], en: ["Sign up", "Pick your profile: producer, buyer, customer, logistics or lab."] },
  { icon: "shield-checkmark", it: ["Verifica", "Controlliamo i profili professionali prima di attivare le funzioni B2B."], en: ["Verification", "We check professional profiles before enabling B2B features."] },
  { icon: "leaf", it: ["Catalogo e lotti", "I produttori pubblicano prodotti, lotti tracciati e offerte all'ingrosso."], en: ["Catalog & lots", "Producers publish products, traced lots and wholesale offers."] },
  { icon: "chatbubbles", it: ["Richieste e trattative", "I compratori cercano, inviano richieste e trattano direttamente con i produttori."], en: ["Requests & deals", "Buyers search, send requests and negotiate directly with producers."] },
  { icon: "earth", it: ["Export e conformità", "Analisi di mercato con fonti ufficiali, requisiti, documenti ed etichette."], en: ["Export & compliance", "Market analysis on official sources, requirements, documents and labels."] },
  { icon: "cube", it: ["Spedizione", "Le aziende di trasporto inviano preventivi e aggiornano il tracciamento."], en: ["Shipping", "Carriers send quotes and update tracking."] },
];

export default function HowItWorks() {
  const { colors } = useTheme();
  const { L, lang } = useT();
  const router = useRouter();
  const styles = useStyles();
  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Come funziona", "How it works")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }} testID="how-it-works">
        {STEPS.map((s, i) => {
          const [title, body] = lang === "en" ? s.en : s.it;
          return (
            <View key={s.icon} style={styles.row}>
              <View style={styles.icon}><Ionicons name={s.icon as any} size={20} color={colors.onBrandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{i + 1}. {title}</Text>
                <Text style={styles.body}>{body}</Text>
              </View>
            </View>
          );
        })}
        <Btn title={L("Inizia ora", "Get started")} size="lg" testID="how-register" onPress={() => router.push("/register")} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  row: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  icon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  body: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 19 },
}));
