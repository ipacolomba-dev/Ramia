import { useRouter } from "expo-router";
import React from "react";
import { Text } from "react-native";

import { Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";

const BODY_IT = `Ultimo aggiornamento: giugno 2026 (versione 2026-06)

1. Titolare del trattamento
Il titolare è l'operatore del marketplace 'Ra mia. Per esercitare i tuoi diritti puoi contattare il titolare tramite i recapiti indicati nella pagina "Chi siamo".

2. Dati trattati
Dati di registrazione e account (nome, e-mail), dati aziendali e fiscali per gli operatori professionali, dati di contatto del referente, dati di fatturazione, informazioni commerciali e documenti caricati a fini di verifica.

3. Finalità
Erogazione del servizio, creazione e gestione dell'account, verifica degli operatori professionali, fatturazione, assistenza e, solo con consenso separato e facoltativo, comunicazioni marketing.

4. Base giuridica
Esecuzione del contratto e misure precontrattuali, obblighi di legge (es. fatturazione), e consenso per il marketing.

5. Conservazione e sicurezza
I dati sono conservati per il tempo necessario alle finalità e agli obblighi di legge. Le password sono gestite in forma cifrata; i documenti aziendali sono archiviati in modo protetto e non accessibile pubblicamente.

6. Diritti dell'interessato
Hai diritto di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità, oltre al diritto di revocare il consenso marketing in qualsiasi momento senza che ciò pregiudichi l'uso del servizio.

7. Marketing facoltativo
Il consenso marketing è separato e non è necessario per utilizzare la piattaforma.

Questo testo è una bozza operativa e sarà integrato con l'informativa legale definitiva.`;

export default function PrivacyScreen() {
  const { t } = useT();
  const router = useRouter();
  const styles = useStyles();
  return (
    <Screen scroll>
      <ScreenHeader title={t("legal.privacy.title")} onBack={() => router.back()} />
      <Text style={styles.body} testID="legal-privacy-body">{BODY_IT}</Text>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  body: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 20, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
}));
