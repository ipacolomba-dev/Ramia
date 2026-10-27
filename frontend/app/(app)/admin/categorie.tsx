import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { Card, Muted, Section } from "@/src/components/blocks";
import { Btn, CenterLoader, Field, Input, KeyboardAwareScrollView, Screen, ScreenHeader, useToast } from "@/src/components/ui";
import { useT } from "@/src/i18n";
import { ThemeColors, fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { Category } from "@/src/types";

export default function Categories() {
  const { colors } = useTheme();
  const { L } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const styles = useStyles();
  const q = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const create = useMutation({
    mutationFn: () => api("/categories", { method: "POST", body: { slug, name, name_en: nameEn || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); setName(""); setNameEn(""); toast.show(L("Categoria creata", "Category created")); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const remove = useMutation({
    mutationFn: (s: string) => api(`/categories/${s}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScreenHeader title={L("Categorie", "Categories")} onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} bottomOffset={24} testID="admin-categories">
        {q.isLoading ? <CenterLoader /> : (q.data ?? []).map((c) => (
          <Card key={c.slug} testID={`cat-${c.slug}`} style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.name}{c.name_en ? ` / ${c.name_en}` : ""}</Text>
              <Muted>{c.slug} · {L(`${c.products} prodotti`, `${c.products} products`)}</Muted>
            </View>
            {c.products === 0 && (
              <Pressable testID={`cat-delete-${c.slug}`} onPress={() => remove.mutate(c.slug)} hitSlop={10} accessibilityRole="button" style={{ padding: spacing.sm }}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Pressable>
            )}
          </Card>
        ))}
        <Section title={L("Nuova categoria", "New category")} />
        <Field label={L("Nome (IT)", "Name (IT)")}><Input testID="cat-name" value={name} onChangeText={setName} placeholder="Miele" /></Field>
        <Field label={L("Nome (EN)", "Name (EN)")}><Input testID="cat-name-en" value={nameEn} onChangeText={setNameEn} placeholder="Honey" /></Field>
        {slug ? <Muted>{L("Codice", "Code")}: {slug}</Muted> : null}
        <Btn title={L("Aggiungi", "Add")} testID="cat-submit" disabled={slug.length < 2} loading={create.isPending} onPress={() => create.mutate()} style={{ marginTop: spacing.md }} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  name: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
}));
