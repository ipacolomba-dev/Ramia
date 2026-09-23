import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Btn, CenterLoader, Input, Screen, ScreenHeader } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { AdvisorReply } from "@/src/types";

interface Msg {
  role: "user" | "assistant";
  text: string;
  citations?: string[];
  live?: boolean;
}

export default function Advisor() {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const styles = useStyles();
  const params = useLocalSearchParams<{ context?: string }>();

  const sessionId = useMemo(() => `s${Date.now().toString(36)}`, []);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const history = useQuery({
    queryKey: ["advisor-history", sessionId],
    queryFn: () => api<Msg[]>(`/advisor/history/${sessionId}`),
  });

  const send = useMutation({
    mutationFn: (message: string) =>
      api<AdvisorReply>("/advisor/chat", {
        method: "POST",
        body: { session_id: sessionId, message, context: params.context || null },
      }),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply, citations: data.citations, live: data.live }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    },
    onError: (e: Error) =>
      setMessages((prev) => [...prev, { role: "assistant", text: e.message }]),
  });

  const submit = (value?: string) => {
    const msg = (value ?? text).trim();
    if (!msg || send.isPending) return;
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setText("");
    send.mutate(msg);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  };

  const suggestions = [t("advisor.suggest1"), t("advisor.suggest2"), t("advisor.suggest3")];

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={t("advisor.title")} onBack={() => router.back()} />
      <View style={styles.disclaimer} testID="advisor-disclaimer">
        <Ionicons name="information-circle" size={15} color={colors.brandSecondary} />
        <Text style={styles.disclaimerText}>{t("advisor.disclaimer")}</Text>
      </View>
      <KeyboardAwareScrollView
        ref={scrollRef as any}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
        bottomOffset={90}
        testID="advisor-messages"
      >
        {history.isLoading && messages.length === 0 ? (
          <CenterLoader />
        ) : messages.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles" size={26} color={colors.brandPrimary} />
            </View>
            <Text style={styles.emptyTitle}>{t("advisor.sub")}</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.md, width: "100%" }}>
              {suggestions.map((s, i) => (
                <Pressable key={i} testID={`advisor-suggest-${i}`} onPress={() => submit(s)} style={({ pressed }) => [styles.suggest, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="arrow-forward-circle-outline" size={18} color={colors.brandPrimary} />
                  <Text style={styles.suggestText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAi]} testID={`advisor-msg-${i}`}>
              {m.role === "assistant" && m.live !== undefined && (
                <View style={styles.liveRow}>
                  <Ionicons name={m.live ? "globe" : "bulb"} size={12} color={m.live ? colors.success : colors.muted} />
                  <Text style={[styles.liveText, { color: m.live ? colors.success : colors.muted }]}>
                    {m.live ? t("advisor.live") : t("advisor.offline")}
                  </Text>
                </View>
              )}
              <Text style={[styles.bubbleText, m.role === "user" && { color: colors.onBrandPrimary }]}>{m.text}</Text>
              {m.citations && m.citations.length > 0 && (
                <View style={styles.sources}>
                  <Text style={styles.sourcesTitle}>{t("advisor.sources")}</Text>
                  {m.citations.slice(0, 5).map((c, j) => (
                    <Pressable key={j} onPress={() => Linking.openURL(c)} testID={`advisor-source-${i}-${j}`}>
                      <Text style={styles.sourceLink} numberOfLines={1}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
        {send.isPending && (
          <View style={[styles.bubble, styles.bubbleAi]}>
            <Text style={[styles.bubbleText, { color: colors.muted }]}>…</Text>
          </View>
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView bottomOffset={0}>
        <View style={styles.inputBar}>
          <Input
            testID="advisor-input"
            value={text}
            onChangeText={setText}
            placeholder={t("advisor.placeholder")}
            style={{ flex: 1 }}
            multiline
          />
          <Pressable testID="advisor-send" onPress={() => submit()} style={styles.sendBtn} accessibilityRole="button">
            <Ionicons name="send" size={18} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardStickyView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  disclaimer: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.brandTertiary, marginHorizontal: spacing.lg, borderRadius: radius.sm, padding: spacing.md },
  disclaimerText: { flex: 1, fontFamily: fonts.text, fontSize: 11, color: colors.onBrandTertiary, lineHeight: 15 },
  emptyBox: { alignItems: "center", paddingVertical: spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.muted, textAlign: "center" },
  suggest: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  suggestText: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  bubble: { maxWidth: "92%", borderRadius: radius.md, padding: spacing.md },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary },
  bubbleAi: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurface, lineHeight: 21 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.xs },
  liveText: { fontFamily: fonts.textBold, fontSize: 10 },
  sources: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm, gap: 3 },
  sourcesTitle: { fontFamily: fonts.textBold, fontSize: 11, color: colors.muted },
  sourceLink: { fontFamily: fonts.text, fontSize: 11, color: colors.info },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  sendBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
