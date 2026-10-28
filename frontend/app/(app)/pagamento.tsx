import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, Screen } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";

interface PayStatus { status: string; payment_status: string; kind: "order" | "shipment" | "visibility"; ref_id: string; amount: number; label?: string }

const MAX_POLLS = 20;

export default function PaymentReturn() {
  const { colors } = useTheme();
  const { L } = useT();
  const { user, refresh } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const params = useLocalSearchParams<{ session_id?: string; cancelled?: string; kind?: string; connect?: string }>();

  const polls = React.useRef(0);
  const q = useQuery({
    queryKey: ["pay-status", params.session_id],
    queryFn: () => {
      polls.current += 1;
      return api<PayStatus>(`/payments/status/${params.session_id}`);
    },
    enabled: !!params.session_id && !!user,
    refetchInterval: (query) => {
      const s = query.state.data;
      if (s && (s.payment_status === "paid" || s.status === "expired")) return false;
      return polls.current >= MAX_POLLS ? false : 2500;
    },
  });

  const d = q.data;
  const paid = d?.payment_status === "paid";
  const expired = d?.status === "expired";
  const gaveUp = !paid && !expired && (q.isError || (polls.current >= MAX_POLLS && !q.isFetching));

  React.useEffect(() => {
    if (paid && d?.kind === "visibility") refresh();
  }, [paid, d?.kind]);

  const area = user?.role === "producer" ? "/producer" : user?.role === "logistics" ? "/logistics" : "/buyer";
  const goNext = () => {
    const kind = d?.kind ?? params.kind;
    if (params.connect) return router.replace(`${area}/incassi` as any);
    if (kind === "visibility") return router.replace("/producer/visibilita");
    if (kind === "shipment") return router.replace((d ? `${area}/spedizioni/${d.ref_id}` : `${area}/spedizioni`) as any);
    return router.replace("/buyer/ordini");
  };

  let icon = "time-outline", tint = colors.brandPrimary, title = L("Verifica del pagamento…", "Checking payment…"), sub = "";
  if (params.connect) {
    icon = "card"; title = L("Configurazione bonifici", "Payout setup");
    sub = L("Torna agli incassi per vedere lo stato del collegamento.", "Go back to earnings to see the connection status.");
  } else if (params.cancelled) {
    icon = "close-circle"; tint = colors.warning; title = L("Pagamento annullato", "Payment cancelled");
    sub = L("Non è stato addebitato nulla. Puoi riprovare quando vuoi.", "Nothing was charged. You can retry anytime.");
  } else if (paid) {
    icon = "checkmark-circle"; tint = colors.success; title = L("Pagamento riuscito", "Payment successful");
    sub = d?.kind === "visibility"
      ? L("La tua visibilità è attiva.", "Your visibility is active.")
      : L("I fondi restano in garanzia su 'Ra mia fino alla consegna, poi vengono girati a chi ha venduto.", "Funds are held by 'Ra mia until delivery, then paid out to the seller.");
  } else if (expired || gaveUp) {
    icon = "alert-circle"; tint = colors.error; title = L("Pagamento non confermato", "Payment not confirmed");
    sub = L("Se l'addebito è avvenuto, la conferma arriverà a breve. Controlla tra qualche minuto.", "If you were charged, confirmation will arrive shortly.");
  }

  return (
    <Screen style={{ justifyContent: "center" }}>
      <View style={styles.box} testID="payment-return">
        {!params.cancelled && !params.connect && !paid && !expired && !gaveUp ? (
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        ) : (
          <Ionicons name={icon as any} size={64} color={tint} />
        )}
        <Text style={styles.title} testID="payment-return-title">{title}</Text>
        {d?.label ? <Text style={styles.meta}>{d.label} · €{d.amount.toFixed(2)}</Text> : null}
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        <Btn title={L("Continua", "Continue")} testID="payment-return-continue" onPress={goNext} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  box: { alignItems: "center", padding: spacing.xl, gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface, textAlign: "center", marginTop: spacing.md },
  meta: { fontFamily: fonts.textBold, fontSize: 14, color: colors.brandPrimary },
  sub: { fontFamily: fonts.text, fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 },
}));
