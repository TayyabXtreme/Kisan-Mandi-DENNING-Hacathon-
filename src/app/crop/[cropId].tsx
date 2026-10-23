import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import {
  Bell,
  Calculator,
  ChevronDown,
  MapPin,
  Sparkles,
  Star,
  Volume2,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KisanDostButton } from "@/components/kisan/assistant/kisan-dost-button";
import { HillsScene } from "@/components/kisan/hills-scene";
import { PriceChart } from "@/components/kisan/prices/price-chart";
import { Tap } from "@/components/kisan/tap";
import {
  BackButton,
  Button,
  CATEGORY_LABELS,
  CropName,
  IconButton,
  PriceChangePill,
  SelectSheet,
  StateView,
  Tag,
} from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { useMarkets, useMe, useResource, withQuery } from "@/lib/api/resources";
import type {
  Advice,
  CompareResponse,
  CompareRow,
  HistoryResponse,
} from "@/lib/api/types";
import { day, num, signedRs } from "@/lib/format";

const HEADER_HEIGHT = 230;

const VERDICTS: Record<Advice["verdict"], { label: string; bg: string; fg: string }> = {
  sell_now: { label: "Sell now", bg: theme.greenSoft, fg: theme.green },
  wait: { label: "Wait", bg: theme.mustardSoft, fg: "#8A6A12" },
  sell_elsewhere: { label: "Sell elsewhere", bg: "#E2EBF2", fg: "#3C5A73" },
};

/** 04 · Crop detail: 14-day trend, min/max/average and market comparison. */
export default function CropDetail() {
  const params = useLocalSearchParams<{ cropId: string; marketId?: string }>();
  const cropId = String(params.cropId);
  const me = useMe();
  const markets = useMarkets();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const marketId =
    picked ??
    (typeof params.marketId === "string" ? params.marketId : null) ??
    me.data?.marketId ??
    markets.data?.items[0]?.id ??
    null;

  const history = useResource<HistoryResponse>(
    marketId ? withQuery("/prices/history", { cropId, marketId, days: 14 }) : null,
  );
  const compare = useResource<CompareResponse>(
    withQuery("/prices/compare", { cropId, marketId }),
  );
  const isFarmer = me.data?.role === "farmer";

  const crop = history.data?.crop;
  const market = history.data?.market ?? markets.data?.items.find((m) => m.id === marketId);
  const latest = history.data?.latest;
  const stats = history.data?.stats;
  const points = history.data?.points ?? [];

  const speak = () => {
    if (!crop || !latest) return;
    const dir = latest.change > 0 ? "up" : latest.change < 0 ? "down" : "unchanged";
    const delta = latest.change ? ` ${num(Math.abs(latest.change))} rupees` : "";
    void Speech.stop();
    Speech.speak(
      `${crop.name} in ${market?.name ?? "your market"}: ${num(latest.price)} rupees per 40 kilo, ${dir}${delta} today.`,
      { language: "en-US" },
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Illustrated header */}
        <View style={{ height: HEADER_HEIGHT }}>
          <HillsScene width={width} height={HEADER_HEIGHT + 30} compact />
          <View style={[styles.headerBar, { top: insets.top + 8 }]}>
            <BackButton />
            <Tap
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Market ${market?.name ?? ""}. Change market`}
              style={styles.marketPill}
            >
              <MapPin size={16} color={theme.green} strokeWidth={2.2} />
              <Text style={styles.marketPillText} numberOfLines={1}>
                {market?.name ?? "Choose market"}
              </Text>
              <ChevronDown size={16} color={theme.ink} strokeWidth={2.2} />
            </Tap>
          </View>
        </View>

        <View style={styles.sheet}>
          {history.loading ? (
            <StateView loading />
          ) : history.error && !history.data ? (
            <StateView error={history.error} onRetry={() => void history.refresh()} />
          ) : !crop || !latest ? (
            <StateView empty="No prices for this crop in this market yet." />
          ) : (
            <>
              {/* Title + price */}
              <View style={styles.titleRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <CropName name={crop.name} local={crop.nameUr} size={26} />
                  <Text style={styles.sub}>
                    {CATEGORY_LABELS[crop.category].one} · Rs per 40 kg
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={styles.priceLine}>
                    <IconButton
                      Icon={Volume2}
                      label="Read price aloud"
                      size={32}
                      bg={theme.sand}
                      onPress={speak}
                    />
                    <Text style={styles.bigPrice}>Rs {num(latest.price)}</Text>
                  </View>
                  <PriceChangePill
                    change={latest.change}
                    changePct={latest.changePct}
                    suffix="today"
                    style={{ marginTop: 6 }}
                  />
                </View>
              </View>

              {/* Chart */}
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Last {points.length} days</Text>
                {points.length > 1 && (
                  <Text style={styles.sectionHint}>
                    {day(points[0].date).split(" ")[0]} – {day(points[points.length - 1].date)}
                  </Text>
                )}
              </View>
              <PriceChart points={points} width={width - 40} />

              {/* Stats */}
              {stats && (
                <View style={styles.stats}>
                  <Stat label="MIN" color={theme.red} value={num(stats.min.price)} sub={day(stats.min.date)} />
                  <Stat label="MAX" color={theme.green} value={num(stats.max.price)} sub={day(stats.max.date)} divider />
                  <Stat label="AVERAGE" color={theme.muted} value={num(stats.avg)} sub={`${stats.days} days`} divider />
                </View>
              )}
            </>
          )}

          {/* Compare markets */}
          <View style={[styles.sectionRow, { marginTop: 26 }]}>
            <Text style={styles.sectionTitle}>Compare markets</Text>
            <Text style={styles.sectionHint}>Best price first</Text>
          </View>
          {compare.loading ? (
            <StateView loading style={{ paddingVertical: 24 }} />
          ) : compare.error && !compare.data ? (
            <StateView error={compare.error} onRetry={() => void compare.refresh()} style={{ paddingVertical: 24 }} />
          ) : (compare.data?.markets.length ?? 0) === 0 ? (
            <StateView empty="No market prices to compare yet." style={{ paddingVertical: 24 }} />
          ) : (
            compare.data!.markets.map((row) => (
              <CompareCard
                key={row.market.id}
                row={row}
                onPress={() => setPicked(row.market.id)}
              />
            ))
          )}

          {crop && marketId && <AdviceCard cropId={cropId} marketId={marketId} />}
        </View>
      </ScrollView>

      {crop && (
        <KisanDostButton
          bottom={96}
          label="Ask"
          prompt={`Should I sell ${crop.name} in ${market?.name ?? "my market"} now or wait?`}
        />
      )}

      {/* Footer actions */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {isFarmer && (
          <Button
            title="Set alert"
            Icon={Bell}
            variant="soft"
            style={{ flex: 1 }}
            onPress={() =>
              router.push({
                pathname: "/alert-form",
                params: { cropId, ...(marketId ? { marketId } : {}) },
              })
            }
          />
        )}
        <Button
          title="Estimate profit"
          Icon={Calculator}
          style={{ flex: isFarmer ? 1.25 : 1 }}
          onPress={() =>
            router.push({
              pathname: "/profit",
              params: { cropId, ...(marketId ? { marketId } : {}) },
            })
          }
        />
      </View>

      <SelectSheet
        visible={pickerOpen}
        title="Choose market"
        value={marketId ?? undefined}
        options={(markets.data?.items ?? []).map((m) => ({
          value: m.id,
          label: m.name,
          hint: m.district,
        }))}
        onSelect={setPicked}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

function Stat({
  label,
  color,
  value,
  sub,
  divider,
}: {
  label: string;
  color: string;
  value: string;
  sub: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.stat, divider && styles.statDivider]}>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

function CompareCard({ row, onPress }: { row: CompareRow; onPress: () => void }) {
  const diff = row.diffVsSelected;
  if (row.best) {
    const line = row.selected
      ? `${row.market.district} · Your mandi pays best today`
      : diff !== null
        ? `${row.market.district} · ${signedRs(diff)} vs your mandi`
        : row.market.district;
    return (
      <Tap
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Best place to sell today: ${row.market.name}, Rs ${num(row.price)}`}
        style={styles.bestCard}
      >
        <View style={styles.bestTop}>
          <Star size={13} color={theme.mustard} fill={theme.mustard} />
          <Text style={styles.bestLabel}>BEST PLACE TO SELL TODAY</Text>
        </View>
        <View style={styles.compareRow}>
          <Text style={[styles.rank, { color: theme.card }]}>1</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.compareName, { color: theme.card }]} numberOfLines={1}>
              {row.market.name}
            </Text>
            <Text style={[styles.compareSub, { color: "#DDEBD5" }]} numberOfLines={1}>
              {line}
            </Text>
          </View>
          <Text style={[styles.comparePrice, { color: theme.card }]}>Rs {num(row.price)}</Text>
        </View>
      </Tap>
    );
  }
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.rank}. ${row.market.name}, Rs ${num(row.price)}${row.selected ? ", selected" : ""}`}
      style={styles.compareCard}
    >
      <View style={styles.compareRow}>
        <Text style={styles.rank}>{row.rank}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.compareName} numberOfLines={1}>
              {row.market.name}
            </Text>
            {row.selected && <Tag label="Selected" bg={theme.card} color={theme.ink} />}
          </View>
          <Text style={styles.compareSub} numberOfLines={1}>
            {row.market.district}
            {!row.selected && diff !== null ? ` · ${signedRs(diff)}` : ""}
          </Text>
        </View>
        <Text style={styles.comparePrice}>Rs {num(row.price)}</Text>
      </View>
    </Tap>
  );
}

/** Bedrock "sell now or wait?" advice, fetched on demand. */
function AdviceCard({ cropId, marketId }: { cropId: string; marketId: string }) {
  const [state, setState] = useState<{
    key: string;
    busy: boolean;
    advice?: Advice;
    error?: string;
  } | null>(null);
  const key = `${cropId}|${marketId}`;
  const current = state?.key === key ? state : null;

  const ask = async () => {
    setState({ key, busy: true });
    try {
      const advice = await api.post<Advice>("/ai/advice", { cropId, marketId });
      setState({ key, busy: false, advice });
    } catch (e) {
      setState({
        key,
        busy: false,
        error: e instanceof ApiError ? e.message : "Couldn't get advice. Try again.",
      });
    }
  };

  const verdict = current?.advice ? VERDICTS[current.advice.verdict] : null;
  return (
    <View style={styles.adviceCard}>
      <View style={styles.adviceHead}>
        <Sparkles size={18} color={theme.green} strokeWidth={2.2} />
        <Text style={styles.adviceTitle}>AI price advice</Text>
        {verdict && <Tag label={verdict.label} bg={verdict.bg} color={verdict.fg} />}
      </View>
      {current?.busy ? (
        <ActivityIndicator color={theme.green} style={{ marginVertical: 14 }} />
      ) : current?.advice ? (
        <>
          <Text style={styles.adviceHeadline}>{current.advice.headline}</Text>
          {current.advice.reasons.slice(0, 3).map((r) => (
            <Text key={r} style={styles.adviceReason}>
              • {r}
            </Text>
          ))}
          <Text style={styles.adviceNote}>
            Based only on the last 14 days of mandi prices. Not a guarantee.
          </Text>
        </>
      ) : (
        <>
          {!!current?.error && <Text style={styles.adviceError}>{current.error}</Text>}
          <Button
            title="Ask AI: sell now or wait?"
            variant="greenSoft"
            small
            onPress={() => void ask()}
            style={{ marginTop: 10, alignSelf: "flex-start" }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.card },
  headerBar: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  marketPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.card,
    borderRadius: 22,
    height: 44,
    paddingHorizontal: 16,
    maxWidth: 230,
  },
  marketPillText: { fontFamily: fonts.semibold, fontSize: 14, color: theme.ink, flexShrink: 1 },
  sheet: {
    marginTop: -30,
    backgroundColor: theme.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sub: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, color: theme.muted },
  priceLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  bigPrice: { fontFamily: fonts.extrabold, fontSize: 24, color: theme.ink, letterSpacing: -0.4 },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 16, color: theme.ink },
  sectionHint: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted },
  stats: {
    flexDirection: "row",
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 18,
    paddingVertical: 14,
  },
  stat: { flex: 1, alignItems: "center" },
  statDivider: { borderLeftWidth: 1, borderLeftColor: theme.line },
  statLabel: { fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.6 },
  statValue: { marginTop: 4, fontFamily: fonts.bold, fontSize: 18, color: theme.ink },
  statSub: { marginTop: 2, fontFamily: fonts.regular, fontSize: 12, color: theme.muted },
  bestCard: { backgroundColor: theme.green, borderRadius: 20, padding: 16, marginBottom: 10 },
  bestTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  bestLabel: { fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.6, color: theme.mustard },
  compareCard: { backgroundColor: theme.bg, borderRadius: 20, padding: 16, marginBottom: 10 },
  compareRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  rank: { width: 18, fontFamily: fonts.bold, fontSize: 18, color: theme.muted, textAlign: "center" },
  compareName: { fontFamily: fonts.bold, fontSize: 15.5, color: theme.ink, flexShrink: 1 },
  compareSub: { marginTop: 2, fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted },
  comparePrice: { fontFamily: fonts.bold, fontSize: 16, color: theme.ink },
  adviceCard: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.line,
    padding: 16,
  },
  adviceHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  adviceTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: theme.ink },
  adviceHeadline: { marginTop: 10, fontFamily: fonts.semibold, fontSize: 15, color: theme.ink, lineHeight: 21 },
  adviceReason: { marginTop: 6, fontFamily: fonts.regular, fontSize: 13.5, color: theme.ink, lineHeight: 19 },
  adviceNote: { marginTop: 10, fontFamily: fonts.regular, fontSize: 11.5, color: theme.muted },
  adviceError: { marginTop: 8, fontFamily: fonts.medium, fontSize: 12.5, color: theme.red },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: theme.card,
  },
});
