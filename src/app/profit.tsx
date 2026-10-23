import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PercentSlider } from "@/components/kisan/sell/percent-slider";
import { TextField } from "@/components/kisan/text-field";
import {
  FieldLabel,
  ScreenTitle,
  SelectField,
  SelectSheet,
  StateView,
} from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { useCrops, useMarkets, useMe, useResource, withQuery } from "@/lib/api/resources";
import type { PricesResponse } from "@/lib/api/types";
import { num, rs } from "@/lib/format";
import { profit, WHAT_IF_RANGE } from "../../convex/lib/kisan";

const digits = (text: string) => text.replace(/\D/g, "").slice(0, 9);
const toNumber = (text: string) => {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
};

/** 12 · Profit calculator with a ±20% what-if on today's mandi price. */
export default function Profit() {
  const params = useLocalSearchParams<{ cropId?: string; marketId?: string }>();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const crops = useCrops();
  const markets = useMarkets();

  const [cropChoice, setCropChoice] = useState<string | undefined>(
    typeof params.cropId === "string" ? params.cropId : undefined,
  );
  const [marketChoice, setMarketChoice] = useState<string | undefined>(
    typeof params.marketId === "string" ? params.marketId : undefined,
  );
  const [quantity, setQuantity] = useState("100");
  const [cost, setCost] = useState("");
  const [shift, setShift] = useState(0);
  const [sheet, setSheet] = useState<"crop" | "market" | null>(null);

  // Defaults: params, else the first crop and the user's own mandi.
  const cropId = cropChoice ?? crops.data?.items[0]?.id;
  const marketId = marketChoice ?? me.data?.marketId ?? markets.data?.items[0]?.id;
  const crop = crops.data?.items.find((c) => c.id === cropId);
  const market = markets.data?.items.find((m) => m.id === marketId);

  const prices = useResource<PricesResponse>(marketId ? withQuery("/prices", { marketId }) : null);
  const row = prices.data?.items.find((r) => r.crop.id === cropId);
  const today = row?.price ?? null;

  const qty = toNumber(quantity);
  const costPerUnit = toNumber(cost);
  const what = today !== null ? profit({ qty, costPerUnit, price: today, shiftPct: shift }) : null;
  const base = today !== null ? profit({ qty, costPerUnit, price: today, shiftPct: 0 }) : null;
  const loss = !!what && what.profit < 0;

  const shiftLabel = `${shift > 0 ? "+" : shift < 0 ? "−" : ""}${Math.abs(shift)}%`;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <ScreenTitle title="Profit calculator" />

        <View style={styles.row}>
          <View style={styles.col}>
            <FieldLabel>Crop</FieldLabel>
            <SelectField value={crop?.name} placeholder="Choose" onPress={() => setSheet("crop")} />
          </View>
          <View style={styles.col}>
            <FieldLabel>Market</FieldLabel>
            <SelectField value={market?.name} placeholder="Choose" onPress={() => setSheet("market")} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <FieldLabel>Quantity (maund)</FieldLabel>
            <TextField
              value={quantity}
              onChangeText={(t) => setQuantity(digits(t))}
              keyboardType="number-pad"
              placeholder="0"
              accessibilityLabel="Quantity in maund"
            />
          </View>
          <View style={styles.col}>
            <FieldLabel>Cost per maund</FieldLabel>
            <TextField
              prefix="Rs"
              bold
              value={cost}
              onChangeText={(t) => setCost(digits(t))}
              keyboardType="number-pad"
              placeholder="0"
              accessibilityLabel="Cost of production per maund in rupees"
            />
          </View>
        </View>

        {today === null || !what || !base ? (
          <StateView
            loading={prices.loading || crops.loading || markets.loading}
            error={prices.error}
            onRetry={() => void prices.refresh()}
            empty={crop && market ? `No ${crop.name} price in ${market.name} yet.` : "Choose a crop and market."}
          />
        ) : (
          <>
            <View style={[styles.card, styles.whatIf]}>
              <View style={styles.whatIfHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>What if price changes?</Text>
                  <Text style={styles.cardSub}>
                    Today {rs(today)} → {rs(what.adjPrice)}
                  </Text>
                </View>
                <View style={[styles.shiftPill, shift < 0 && { backgroundColor: theme.redSoft }]}>
                  <Text style={[styles.shiftText, shift < 0 && { color: theme.red }]}>{shiftLabel}</Text>
                </View>
              </View>
              <PercentSlider value={shift} onChange={setShift} range={WHAT_IF_RANGE} />
            </View>

            <View style={[styles.result, loss && { backgroundColor: theme.red }]} accessibilityLiveRegion="polite">
              <View style={styles.resultHead}>
                <Text style={styles.resultLabel}>{loss ? "ESTIMATED LOSS" : "ESTIMATED PROFIT"}</Text>
                <View style={styles.marginPill}>
                  <Text style={styles.marginText}>{what.margin.toFixed(1)}% margin</Text>
                </View>
              </View>
              <Text style={styles.resultValue} adjustsFontSizeToFit numberOfLines={1}>
                {loss ? "−" : ""}
                {rs(Math.abs(what.profit))}
              </Text>
              <Text style={styles.resultFoot}>
                At today&apos;s price: {base.profit < 0 ? "−" : ""}
                {rs(Math.abs(base.profit))} · {base.margin.toFixed(1)}% margin
              </Text>
            </View>

            <View style={styles.card}>
              <Line label="Revenue" sub={`${num(qty)} × ${rs(what.adjPrice)}`} value={rs(what.revenue)} />
              <View style={styles.divider} />
              <Line
                label="Total cost"
                sub={`${num(qty)} × ${rs(costPerUnit)}`}
                value={`− ${rs(what.totalCost)}`}
                color={theme.red}
              />
              <View style={styles.divider} />
              <Line
                label={loss ? "Loss" : "Profit"}
                value={`${loss ? "− " : ""}${rs(Math.abs(what.profit))}`}
                color={loss ? theme.red : theme.green}
              />
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      <SelectSheet
        visible={sheet === "crop"}
        title="Crop"
        value={cropId}
        options={(crops.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.name}  ${c.nameUr}` }))}
        onSelect={(v) => setCropChoice(v)}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === "market"}
        title="Market"
        value={marketId}
        options={(markets.data?.items ?? []).map((m) => ({ value: m.id, label: m.name, hint: m.district }))}
        onSelect={(v) => setMarketChoice(v)}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

function Line({ label, sub, value, color = theme.ink }: { label: string; sub?: string; value: string; color?: string }) {
  return (
    <View style={styles.line}>
      <View style={{ flex: 1 }}>
        <Text style={styles.lineLabel}>{label}</Text>
        {!!sub && <Text style={styles.lineSub}>{sub}</Text>}
      </View>
      <Text style={[styles.lineValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  card: { backgroundColor: theme.card, borderRadius: 22, padding: 18, marginTop: 14 },
  whatIf: { marginTop: 20, gap: 14 },
  whatIfHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 15, color: theme.ink },
  cardSub: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 3 },
  shiftPill: { backgroundColor: theme.greenSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  shiftText: { fontFamily: fonts.bold, fontSize: 14, color: theme.green },
  result: { backgroundColor: theme.green, borderRadius: 22, padding: 20, marginTop: 14 },
  resultHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultLabel: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.8, color: "rgba(255,255,255,0.85)" },
  marginPill: { backgroundColor: theme.mustard, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  marginText: { fontFamily: fonts.bold, fontSize: 12, color: theme.ink },
  resultValue: { fontFamily: fonts.extrabold, fontSize: 40, color: theme.card, marginTop: 10, letterSpacing: -1 },
  resultFoot: { fontFamily: fonts.medium, fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 8 },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  lineLabel: { fontFamily: fonts.semibold, fontSize: 14.5, color: theme.ink },
  lineSub: { fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 2 },
  lineValue: { fontFamily: fonts.bold, fontSize: 15.5 },
  divider: { height: 1, backgroundColor: theme.line, marginVertical: 10 },
});
