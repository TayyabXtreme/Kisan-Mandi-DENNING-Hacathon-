import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { confirmAction } from "@/components/kisan/chat/action-sheet";
import { EXPENSE_LABELS } from "@/components/kisan/dashboard/expense-labels";
import { Tap } from "@/components/kisan/tap";
import { TextField } from "@/components/kisan/text-field";
import { Button, Chip, FieldError, FieldLabel, ScreenTitle, StateView } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate, useCrops, useResource } from "@/lib/api/resources";
import type { ExpenseBody, ExpensesResponse } from "@/lib/api/types";
import { errorText } from "@/lib/form-errors";
import { num, todayPK } from "@/lib/format";
import { addDays, EXPENSE_CATEGORIES, expenseSchema, type ExpenseCategory } from "../../convex/lib/kisan";

type Initial = { cropId?: string; category?: ExpenseCategory; amount: string; note: string; date: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** New / edit crop expense (modal). Params: id (edit), cropId (prefill). */
export default function ExpenseFormScreen() {
  const params = useLocalSearchParams<{ id?: string; cropId?: string }>();
  const id = one(params.id);
  const list = useResource<ExpensesResponse>(id ? "/expenses" : null);
  const [today] = useState(() => todayPK(Date.now()));

  const existing = id ? list.data?.items.find((e) => e.id === id) : undefined;
  if (id && !existing) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.pad}>
          <ScreenTitle title="Edit expense" close />
        </View>
        <StateView
          loading={list.loading}
          error={list.error}
          empty="This expense was deleted."
          onRetry={() => void list.refresh()}
        />
      </SafeAreaView>
    );
  }
  const initial: Initial = existing
    ? {
        cropId: existing.crop.id,
        category: existing.category,
        amount: String(existing.amount),
        note: existing.note ?? "",
        date: existing.date,
      }
    : { cropId: one(params.cropId), amount: "", note: "", date: today };
  return <ExpenseForm id={id} initial={initial} today={today} />;
}

function ExpenseForm({ id, initial, today }: { id?: string; initial: Initial; today: string }) {
  const insets = useSafeAreaInsets();
  const crops = useCrops();
  const [cropId, setCropId] = useState(initial.cropId);
  const [category, setCategory] = useState(initial.category);
  const [amount, setAmount] = useState(initial.amount);
  const [note, setNote] = useState(initial.note);
  const [date, setDate] = useState(initial.date);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const yesterday = addDays(today, -1);

  const save = async () => {
    if (busy) return;
    const parsed = expenseSchema(today).safeParse({
      cropId: cropId ?? "",
      category,
      amount: amount === "" ? Number.NaN : Number(amount),
      note: note.trim() || undefined,
      date: date.trim(),
    });
    if (!parsed.success) {
      const next: Record<string, string | undefined> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0] ?? "root")] ??= errorText(issue.message);
      setErrors(next);
      return;
    }
    setErrors({});
    setServerError("");
    setBusy("save");
    const body: ExpenseBody = { ...parsed.data, amount: Math.round(parsed.data.amount) };
    try {
      if (id) await api.patch(`/expenses/${id}`, body);
      else await api.post("/expenses", body);
      await invalidate("/expenses", "/dashboard");
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.field) setErrors({ [e.field]: errorText(e.code) ?? e.message });
      else setServerError(e instanceof ApiError ? e.message : "Couldn't save the expense. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    id &&
    confirmAction("Delete expense?", "It will be removed from your budget.", "Delete", async () => {
      setBusy("delete");
      try {
        await api.del(`/expenses/${id}`);
        await invalidate("/expenses", "/dashboard");
        router.back();
      } catch (e) {
        setServerError(e instanceof ApiError ? e.message : "Couldn't delete the expense.");
      } finally {
        setBusy(null);
      }
    });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pad}>
        <ScreenTitle title={id ? "Edit expense" : "Add expense"} close />

        <FieldLabel>Crop</FieldLabel>
        {crops.data ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {crops.data.items.map((c) => (
              <Chip key={c.id} label={c.name} selected={c.id === cropId} onPress={() => setCropId(c.id)} />
            ))}
          </ScrollView>
        ) : (
          <StateView loading={!crops.error} error={crops.error} onRetry={() => void crops.refresh()} style={{ paddingVertical: 12 }} />
        )}
        <FieldError>{errors.cropId}</FieldError>

        <FieldLabel>What did you spend on?</FieldLabel>
        <View style={styles.grid}>
          {EXPENSE_CATEGORIES.map((c) => {
            const { label, Icon } = EXPENSE_LABELS[c];
            const on = c === category;
            return (
              <Tap
                key={c}
                onPress={() => setCategory(c)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={label}
                style={[styles.cat, on && styles.catOn]}
              >
                <Icon size={20} color={on ? theme.card : theme.green} strokeWidth={2.2} />
                <Text style={[styles.catText, on && { color: theme.card }]}>{label}</Text>
              </Tap>
            );
          })}
        </View>
        <FieldError>{errors.category}</FieldError>

        <FieldLabel>Amount</FieldLabel>
        <TextField
          prefix="Rs"
          bold
          value={amount ? num(Number(amount)) : ""}
          onChangeText={(t) => setAmount(t.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9))}
          keyboardType="number-pad"
          placeholder="0"
          accessibilityLabel="Amount in rupees"
          error={errors.amount}
        />

        <FieldLabel>Date</FieldLabel>
        <View style={styles.dateRow}>
          <Chip label="Today" selected={date === today} onPress={() => setDate(today)} />
          <Chip label="Yesterday" selected={date === yesterday} onPress={() => setDate(yesterday)} />
        </View>
        <TextField
          value={date}
          onChangeText={(t) => setDate(t.replace(/[^\d-]/g, "").slice(0, 10))}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="Date, year month day"
          error={errors.date}
          containerStyle={{ marginTop: 8 }}
        />

        <FieldLabel>Note (optional)</FieldLabel>
        <TextField value={note} onChangeText={setNote} placeholder="e.g. 2 bags DAP" maxLength={200} error={errors.note} />

        {!!serverError && (
          <Text style={styles.serverError} accessibilityLiveRegion="polite">
            {serverError}
          </Text>
        )}

        {id && (
          <Button
            title="Delete expense"
            variant="danger"
            Icon={Trash2}
            onPress={() => void remove()}
            loading={busy === "delete"}
            disabled={!!busy}
            style={{ marginTop: 20 }}
          />
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button title={id ? "Save changes" : "Save expense"} onPress={() => void save()} loading={busy === "save"} disabled={!!busy} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  pad: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  chips: { gap: 8, paddingRight: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cat: {
    width: "23%",
    flexGrow: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: theme.card,
  },
  catOn: { backgroundColor: theme.green },
  catText: { fontFamily: fonts.semibold, fontSize: 12, color: theme.ink },
  dateRow: { flexDirection: "row", gap: 8 },
  serverError: { marginTop: 16, textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: theme.red },
  footer: { paddingHorizontal: 20, paddingTop: 8, backgroundColor: theme.bg },
});
