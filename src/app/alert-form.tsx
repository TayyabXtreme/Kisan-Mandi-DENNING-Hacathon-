import { useState } from "react";
import {
  Alert as NativeAlert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MapPin, Trash2 } from "lucide-react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { TextField } from "@/components/kisan/text-field";
import { Tap } from "@/components/kisan/tap";
import {
  Button,
  FieldError,
  FieldLabel,
  ScreenTitle,
  Segmented,
  SelectField,
  SelectSheet,
  StateView,
} from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import {
  invalidate,
  useCrops,
  useMarkets,
  useMe,
  useResource,
  withQuery,
} from "@/lib/api/resources";
import type { Alert, AlertBody, PricesResponse } from "@/lib/api/types";
import { errorText } from "@/lib/form-errors";
import { num, rs } from "@/lib/format";
import { alertSchema, type Condition } from "../../convex/lib/kisan";

type Initial = {
  cropId?: string;
  marketId?: string;
  condition: Condition;
  target: string;
  active: boolean;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 06 · New / edit price alert (modal).
 * Params: id (edit), cropId and marketId (prefill from Crop detail).
 */
export default function AlertFormScreen() {
  const params = useLocalSearchParams<{ id?: string; cropId?: string; marketId?: string }>();
  const id = one(params.id);
  const me = useMe();
  const existing = useResource<Alert>(id ? `/alerts/${id}` : null);

  const ready = !!me.data && (!id || !!existing.data);
  if (!ready) {
    const error = existing.error ?? me.error;
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.pad}>
          <ScreenTitle title={id ? "Edit alert" : "New price alert"} close />
        </View>
        <StateView
          loading={!error}
          error={error}
          onRetry={() => {
            void me.refresh();
            void existing.refresh();
          }}
        />
      </SafeAreaView>
    );
  }

  const a = existing.data;
  const initial: Initial = a
    ? {
        cropId: a.crop.id,
        marketId: a.market.id,
        condition: a.condition,
        target: String(a.targetPrice),
        active: a.active,
      }
    : {
        cropId: one(params.cropId),
        marketId: one(params.marketId) ?? me.data?.marketId ?? undefined,
        condition: "above",
        target: "",
        active: true,
      };
  return <AlertForm id={id} initial={initial} />;
}

function AlertForm({ id, initial }: { id?: string; initial: Initial }) {
  const insets = useSafeAreaInsets();
  const crops = useCrops();
  const markets = useMarkets();
  const [cropId, setCropId] = useState(initial.cropId);
  const [marketId, setMarketId] = useState(initial.marketId);
  const [condition, setCondition] = useState<Condition>(initial.condition);
  const [target, setTarget] = useState(initial.target);
  const [active, setActive] = useState(initial.active);
  const [marketOpen, setMarketOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  const prices = useResource<PricesResponse>(
    marketId ? withQuery("/prices", { marketId }) : null,
  );
  const market = markets.data?.items.find((m) => m.id === marketId);
  const crop = crops.data?.items.find((c) => c.id === cropId);
  const latest = prices.data?.items.find((r) => r.crop.id === cropId)?.price ?? null;
  const targetNum = Number(target);
  const sign = condition === "above" ? "≥" : "≤";

  const save = async () => {
    if (busy) return;
    const parsed = alertSchema.safeParse({
      cropId: cropId ?? "",
      marketId: marketId ?? "",
      condition,
      targetPrice: target === "" ? Number.NaN : targetNum,
      active,
    });
    if (!parsed.success) {
      const next: Record<string, string | undefined> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "root");
        next[key] ??= errorText(issue.message);
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setServerError("");
    setBusy("save");
    const body: AlertBody = {
      cropId: parsed.data.cropId,
      marketId: parsed.data.marketId,
      condition: parsed.data.condition,
      targetPrice: Math.round(parsed.data.targetPrice),
      active: parsed.data.active,
    };
    try {
      if (id) await api.patch(`/alerts/${id}`, body);
      else await api.post("/alerts", body);
      await invalidate("/alerts");
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.field) setErrors({ [e.field]: errorText(e.code) ?? e.message });
      else setServerError(e instanceof ApiError ? e.message : "Couldn't save the alert. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = () => {
    if (!id) return;
    NativeAlert.alert("Delete alert?", "You won't be notified for this target any more.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy("delete");
          try {
            await api.del(`/alerts/${id}`);
            await invalidate("/alerts");
            router.back();
          } catch (e) {
            setServerError(e instanceof ApiError ? e.message : "Couldn't delete the alert.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.pad}
      >
        <ScreenTitle title={id ? "Edit alert" : "New price alert"} close />

        <FieldLabel>Crop</FieldLabel>
        {crops.data ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {crops.data.items.map((c) => {
              const on = c.id === cropId;
              return (
                <Tap
                  key={c.id}
                  onPress={() => setCropId(c.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
                </Tap>
              );
            })}
          </ScrollView>
        ) : (
          <StateView loading={!crops.error} error={crops.error} onRetry={() => void crops.refresh()} style={styles.miniState} />
        )}
        <FieldError>{errors.cropId}</FieldError>

        <FieldLabel>Market</FieldLabel>
        <SelectField
          Icon={MapPin}
          value={market?.name}
          placeholder="Choose a market"
          onPress={() => setMarketOpen(true)}
          error={!!errors.marketId}
          accessibilityLabel={`Market, ${market?.name ?? "not chosen"}`}
        />
        <FieldError>{errors.marketId}</FieldError>
        {latest !== null && crop && market && (
          <Text style={styles.hint}>
            Latest {crop.name} price in {market.name}:{" "}
            <Text style={styles.hintStrong}>{rs(latest)}</Text>
          </Text>
        )}

        <FieldLabel>Notify me when price is</FieldLabel>
        <Segmented
          options={[
            { value: "above", label: "Above (≥)" },
            { value: "below", label: "Below (≤)" },
          ]}
          value={condition}
          onChange={setCondition}
          activeColor={theme.green}
        />

        <FieldLabel>Target price (Rs per 40 kg)</FieldLabel>
        <TextField
          prefix="Rs"
          bold
          value={target ? num(Number(target)) : ""}
          onChangeText={(t) => setTarget(t.replace(/\D/g, "").replace(/^0+/, "").slice(0, 8))}
          keyboardType="number-pad"
          placeholder={latest !== null ? num(latest) : "0"}
          accessibilityLabel="Target price in rupees per 40 kg"
          error={errors.targetPrice}
          hint={
            targetNum > 0
              ? `Triggers when the latest price ${sign} ${rs(targetNum)}`
              : undefined
          }
          returnKeyType="done"
        />

        <View style={styles.activeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeTitle}>Alert active</Text>
            <Text style={styles.activeBody}>Paused alerts are kept but not checked</Text>
          </View>
          <Switch
            value={active}
            onValueChange={setActive}
            trackColor={{ true: theme.green, false: "#DDD6CA" }}
            thumbColor={theme.card}
            ios_backgroundColor="#DDD6CA"
            accessibilityLabel="Alert active"
          />
        </View>

        {!!serverError && (
          <Text style={styles.serverError} accessibilityLiveRegion="polite">
            {serverError}
          </Text>
        )}

        {id && (
          <Button
            title="Delete alert"
            variant="danger"
            Icon={Trash2}
            onPress={remove}
            loading={busy === "delete"}
            disabled={!!busy}
            style={{ marginTop: 20 }}
          />
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          title={id ? "Save changes" : "Save alert"}
          onPress={() => void save()}
          loading={busy === "save"}
          disabled={!!busy}
        />
      </View>

      <SelectSheet
        visible={marketOpen}
        title="Choose market"
        options={(markets.data?.items ?? []).map((m) => ({
          value: m.id,
          label: m.name,
          hint: m.district,
        }))}
        value={marketId}
        onSelect={setMarketId}
        onClose={() => setMarketOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  pad: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  chips: { gap: 8, paddingRight: 8 },
  chip: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 16,
    backgroundColor: theme.card,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: theme.green },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: theme.ink },
  chipTextOn: { color: theme.card },
  miniState: { paddingVertical: 12 },
  hint: { marginTop: 8, fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted },
  hintStrong: { fontFamily: fonts.bold, color: theme.ink },
  activeRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
  },
  activeTitle: { fontFamily: fonts.semibold, fontSize: 15, color: theme.ink },
  activeBody: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 2 },
  serverError: {
    marginTop: 16,
    textAlign: "center",
    fontFamily: fonts.medium,
    fontSize: 13,
    color: theme.red,
  },
  footer: { paddingHorizontal: 20, paddingTop: 8, backgroundColor: theme.bg },
});
