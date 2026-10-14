import { useRouter } from "expo-router";
import React from "react";
import { Text } from "react-native";

import { Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing } from "@/src/theme";

const BODY_IT = `Ultimo aggiornamento: giugno 2026 (versione 2026-06)

1. Oggetto
Le presenti Condizioni disciplinano l'uso del marketplace 'Ra mia, che mette in contatto produttori e operatori del settore agroalimentare siciliano con compratori professionali, clienti privati, operatori logistici e professionisti della conformità.

2. Registrazione e account
L'utente fornisce informazioni veritiere e aggiornate. Alcuni account (compratore professionale, logistica, laboratorio) sono soggetti a verifica e approvazione prima dell'abilitazione completa delle funzionalità professionali.

3. Ruoli e responsabilità
Ogni utente è responsabile della correttezza dei dati aziendali e fiscali inseriti. Le verifiche sintattiche dei dati non costituiscono certificazione dell'esistenza o regolarità dell'azienda.

4. Contenuti e transazioni
'Ra mia facilita l'incontro tra domanda e offerta; le condizioni commerciali, i pagamenti e le spedizioni restano responsabilità delle parti, salvo i servizi esplicitamente offerti dalla piattaforma.

5. Consulenza informativa
Gli strumenti di analisi normativa e di export forniti dall'assistente sono di orientamento e non sostituiscono un consulente fiscale/legale né le autorità competenti.

6. Limitazioni
La piattaforma non garantisce esiti commerciali né l'accuratezza assoluta delle informazioni di terze parti.

7. Modifiche
Le presenti Condizioni possono essere aggiornate; la versione applicabile è quella accettata al momento della registrazione o del successivo rinnovo del consenso.

Questo testo è una bozza operativa e sarà integrato con le clausole legali definitive.`;

export default function TermsScreen() {
  const { t } = useT();
  const router = useRouter();
  const styles = useStyles();
  return (
    <Screen scroll>
      <ScreenHeader title={t("legal.terms.title")} onBack={() => router.back()} />
      <Text style={styles.body} testID="legal-terms-body">{BODY_IT}</Text>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  body: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 20, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
}));
