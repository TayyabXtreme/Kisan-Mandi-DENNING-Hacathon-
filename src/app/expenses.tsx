import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Plus, Trash2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { confirmAction, notify } from "@/components/kisan/chat/action-sheet";
import { errorText } from "@/components/kisan/chat/chat-api";
import { EXPENSE_LABELS } from "@/components/kisan/dashboard/expense-labels";
import { Tap } from "@/components/kisan/tap";
import { Button, Chip, IconButton, ScreenTitle, StateView } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api } from "@/lib/api/client";
import { invalidate, useResource } from "@/lib/api/resources";
import type { Expense, ExpensesResponse } from "@/lib/api/types";
import { day, rs } from "@/lib/format";

/** A farmer's crop expenses, all crops or one (param cropId). Tap to edit. */
export default function Expenses() {
  const params = useLocalSearchParams<{ cropId?: string }>();
  const [cropId, setCropId] = useState(typeof params.cropId === "string" ? params.cropId : undefined);
  const all = useResource<ExpensesResponse>("/expenses");
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = (all.data?.items ?? []).filter((e) => !cropId || e.crop.id === cropId);
  const total = items.reduce((sum, e) => sum + e.amount, 0);
  // Crops that have expenses, for the filter chips.
  const crops = [...new Map((all.data?.items ?? []).map((e) => [e.crop.id, e.crop])).values()];

  const remove = (e: Expense) =>
    confirmAction("Delete expense?", `${EXPENSE_LABELS[e.category].label} · ${rs(e.amount)} on ${e.crop.name}`, "Delete", async () => {
      setBusyId(e.id);
      try {
        await api.del(`/expenses/${e.id}`);
        await invalidate("/expenses", "/dashboard");
      } catch (err) {
        notify("Couldn't delete", errorText(err));
      } finally {
        setBusyId(null);
      }
    });

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={all.refreshing} onRefresh={() => void all.refresh()} tintColor={theme.green} colors={[theme.green]} />
        }
      >
        <ScreenTitle title="Crop expenses" />

        {crops.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
            <Chip label="All crops" selected={!cropId} onPress={() => setCropId(undefined)} />
            {crops.map((c) => (
              <Chip key={c.id} label={c.name} selected={cropId === c.id} onPress={() => setCropId(c.id)} />
            ))}
          </ScrollView>
        )}

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total spent{cropId ? ` on ${crops.find((c) => c.id === cropId)?.name ?? "this crop"}` : ""}</Text>
          <Text style={styles.totalValue}>{rs(total)}</Text>
        </View>

        {!all.data ? (
          <StateView loading={all.loading} error={all.error} onRetry={() => void all.refresh()} />
        ) : items.length === 0 ? (
          <StateView empty="No expenses yet. Add what you spent on seed, fertilizer, labour and more." />
        ) : (
          <View style={styles.card}>
            {items.map((e, i) => {
              const { label, Icon } = EXPENSE_LABELS[e.category];
              return (
                <View key={e.id} style={[styles.row, i > 0 && styles.divider, busyId === e.id && { opacity: 0.5 }]}>
                  <Tap
                    onPress={() => router.push({ pathname: "/expense-form", params: { id: e.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} for ${e.crop.name}, ${rs(e.amount)} on ${day(e.date)}. Edit`}
                    style={styles.rowMain}
                  >
                    <View style={styles.icon}>
                      <Icon size={18} color={theme.green} strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>
                        {label} · {e.crop.name}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1}>
                        {day(e.date)}
                        {e.note ? ` · ${e.note}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.amount}>{rs(e.amount)}</Text>
                  </Tap>
                  <IconButton Icon={Trash2} label={`Delete ${label} expense`} size={36} bg={theme.redSoft} color={theme.red} onPress={() => remove(e)} />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title="Add expense"
          Icon={Plus}
          variant="green"
          onPress={() => router.push({ pathname: "/expense-form", params: cropId ? { cropId } : {} })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  chipsScroll: { marginTop: 14, flexGrow: 0 },
  chips: { gap: 8 },
  total: { backgroundColor: theme.card, borderRadius: 20, padding: 16, marginTop: 14, marginBottom: 12 },
  totalLabel: { fontFamily: fonts.medium, fontSize: 13, color: theme.muted },
  totalValue: { fontFamily: fonts.extrabold, fontSize: 26, color: theme.red, marginTop: 4 },
  card: { backgroundColor: theme.card, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.greenSoft, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.bold, fontSize: 14.5, color: theme.ink },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 2 },
  amount: { fontFamily: fonts.bold, fontSize: 14.5, color: theme.ink },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
});
