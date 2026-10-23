import { useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { BadgeCheck, Calculator, ChevronDown, ChevronRight, LayoutDashboard, RefreshCw, Search, X } from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { KisanDostButton } from "@/components/kisan/assistant/kisan-dost-button";
import { TAB_BAR_SPACE } from "@/components/kisan/floating-tab-bar";
import { AddMarketDialog } from "@/components/kisan/market/add-market-dialog";
import { Tap } from "@/components/kisan/tap";
import { WarningBox } from "@/components/kisan/weather/weather-card";
import {
  CATEGORY_LABELS,
  Chip,
  CropIcon,
  CropName,
  IconButton,
  PriceChangePill,
  SelectSheet,
  StateView,
} from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import {
  invalidate,
  load,
  useMarkets,
  useMe,
  useResource,
  withQuery,
} from "@/lib/api/resources";
import type { DashboardResponse, Me, PriceRow, PricesResponse, WeatherResponse } from "@/lib/api/types";
import { clock, dayLong, initials, num, todayPK } from "@/lib/format";
import { CATEGORIES, type Category } from "../../../convex/lib/kisan";

type Filter = "all" | Category;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c].many })),
];

/** "just now" / "3 min ago" / "2 h ago" */
function ago(updatedAt: number | undefined, now: number) {
  if (!updatedAt) return "loading…";
  const min = Math.floor((now - updatedAt) / 60_000);
  if (min < 1) return "updated just now";
  if (min < 60) return `updated ${min} min ago`;
  return `updated ${Math.floor(min / 60)} h ago`;
}

/** Re-renders every 30 s so relative times stay fresh. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** 03 · Today's Prices for the selected mandi, with daily change. */
export default function Prices() {
  const me = useMe();
  const markets = useMarkets();
  const [picked, setPicked] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addMarketOpen, setAddMarketOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [marketError, setMarketError] = useState("");
  const now = useNow();

  const marketId = picked ?? me.data?.marketId ?? markets.data?.items[0]?.id ?? null;
  const prices = useResource<PricesResponse>(marketId ? withQuery("/prices", { marketId }) : null);
  const isFarmer = me.data?.role === "farmer";
  const isAdmin = !!me.data?.isAdmin;
  // Offers waiting for my answer, for the dashboard card badge.
  const dashboard = useResource<DashboardResponse>(me.data?.role ? "/dashboard" : null);
  const waitingOffers = dashboard.data?.offers.filter((o) => o.awaitingMe).length ?? 0;
  // The most serious weather warning for my district (Open-Meteo), if any.
  const weather = useResource<WeatherResponse>(me.data?.district ? "/weather" : null);
  const topWarning = weather.data?.warnings[0];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (prices.data?.items ?? []).filter(
      (row) =>
        (filter === "all" || row.crop.category === filter) &&
        (!q ||
          [row.crop.name, row.crop.nameUr, row.crop.nameSd].some((n) =>
            n.toLowerCase().includes(q),
          )),
    );
  }, [prices.data, query, filter]);

  // Pull to refresh reloads prices and re-evaluates the farmer's alerts (badge).
  const onRefresh = async () => {
    await Promise.all([prices.refresh(), isFarmer ? load("/alerts") : null, load("/dashboard"), load("/weather")]);
  };

  const chooseMarket = async (id: string) => {
    setPicked(id);
    setMarketError("");
    try {
      await api.patch<Me>("/users/me", { marketId: id });
      await invalidate("/users/me");
    } catch (e) {
      setMarketError(
        e instanceof ApiError ? e.message : "Couldn't save your market. Showing it for now.",
      );
    }
  };

  const firstName = me.data?.name.split(" ")[0] ?? "";
  const market = prices.data?.market ?? markets.data?.items.find((m) => m.id === marketId);
  const dateKey = prices.data?.asOf ?? prices.data?.today ?? todayPK(now);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={prices.refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.green}
            colors={[theme.green]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Tap
            onPress={() => router.navigate("/profile")}
            accessibilityRole="button"
            accessibilityLabel="Profile and settings"
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initials(me.data?.name ?? "")}</Text>
          </Tap>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Salam, {firstName}</Text>
            <Text style={styles.title} accessibilityRole="header">
              Today&apos;s Prices
            </Text>
          </View>
          <IconButton
            Icon={Calculator}
            label="Profit calculator"
            size={48}
            onPress={() =>
              router.push({ pathname: "/profit", params: marketId ? { marketId } : {} })
            }
          />
        </View>

        {/* Selected market */}
        <Tap
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Selected market ${market?.name ?? ""}. Change market`}
          style={styles.marketCard}
          pressedStyle={{ opacity: 0.92 }}
        >
          <Svg
            width={170}
            height={90}
            viewBox="0 0 170 90"
            style={styles.marketArt}
            pointerEvents="none"
          >
            <Path d="M0 70 C 40 40 80 50 110 34 C 135 22 155 22 170 18 L170 90 L0 90 Z" fill="#E5BE5E" />
            <Path d="M30 90 C 70 64 120 70 170 52 L170 90 Z" fill="#8FAE5D" />
            <Circle cx="132" cy="22" r="10" fill="#F6E3A6" />
          </Svg>
          <View style={styles.marketTop}>
            <Text style={styles.marketLabel}>Selected market</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                Live · {prices.updatedAt ? clock(prices.updatedAt) : "…"}
              </Text>
            </View>
          </View>
          <View style={styles.marketNameRow}>
            <Text style={styles.marketName} numberOfLines={1}>
              {market?.name ?? "Choose a market"}
            </Text>
            <ChevronDown size={22} color={theme.ink} strokeWidth={2.4} />
          </View>
          <Text style={styles.marketDate}>{dayLong(dateKey)} · Rs per 40 kg</Text>
          {prices.data?.publishedBy && (
            <View style={styles.publishedPill}>
              <BadgeCheck size={13} color={theme.green} strokeWidth={2.4} />
              <Text style={styles.publishedText} numberOfLines={1}>
                Published by {prices.data.publishedBy.name}
              </Text>
            </View>
          )}
        </Tap>
        {!!marketError && <Text style={styles.inlineError}>{marketError}</Text>}

        {/* Dashboard: stock, budget and buyer offers (farmers); offers and purchases (buyers). */}
        {!!me.data?.role && (
          <Tap
            onPress={() => router.push("/dashboard")}
            accessibilityRole="button"
            accessibilityLabel={`Open my dashboard${waitingOffers ? `, ${waitingOffers} offers waiting` : ""}`}
            style={styles.dashCard}
            pressedStyle={{ opacity: 0.9 }}
          >
            <View style={styles.dashIcon}>
              <LayoutDashboard size={22} color={theme.card} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dashTitle}>My Dashboard</Text>
              <Text style={styles.dashSub} numberOfLines={1}>
                {waitingOffers
                  ? `${waitingOffers} offer${waitingOffers === 1 ? "" : "s"} waiting for you`
                  : isFarmer
                    ? "Stock, budget, expenses & buyer offers"
                    : "Your offers and purchases"}
              </Text>
            </View>
            {waitingOffers > 0 && (
              <View style={styles.dashBadge}>
                <Text style={styles.dashBadgeText}>{waitingOffers}</Text>
              </View>
            )}
            <ChevronRight size={20} color={theme.card} strokeWidth={2.4} />
          </Tap>
        )}
        {topWarning && weather.data && (
          <Tap
            onPress={() => router.push("/dashboard")}
            accessibilityRole="button"
            accessibilityHint="Opens the 7-day forecast"
            style={styles.weatherBanner}
            pressedStyle={{ opacity: 0.85 }}
          >
            <WarningBox w={topWarning} today={weather.data.days[0]?.date ?? ""} />
          </Tap>
        )}

        {/* Search */}
        <View style={styles.search}>
          <Search size={18} color={theme.muted} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search crops..."
            placeholderTextColor={theme.muted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search crops"
          />
          {!!query && (
            <Tap onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
              <X size={18} color={theme.muted} />
            </Tap>
          )}
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsScroll}
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              selected={filter === f.value}
              onPress={() => setFilter(f.value)}
            />
          ))}
        </ScrollView>

        {/* List panel */}
        <View style={styles.panel}>
          <View style={styles.refreshHint}>
            <RefreshCw size={13} color={theme.green} strokeWidth={2.4} />
            <Text style={styles.refreshText}>
              Pull to refresh · {ago(prices.updatedAt, now)}
            </Text>
          </View>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderText}>
              {rows.length} {rows.length === 1 ? "CROP" : "CROPS"}
            </Text>
            <Text style={styles.listHeaderText}>TODAY · VS YESTERDAY</Text>
          </View>

          {prices.loading || (!marketId && (me.loading || markets.loading)) ? (
            <StateView loading />
          ) : prices.error && !prices.data ? (
            <StateView error={prices.error} onRetry={() => void prices.refresh()} />
          ) : !marketId || prices.data?.items.length === 0 ? (
            <StateView empty="No prices published for this market yet. Pull down to check again." />
          ) : rows.length === 0 ? (
            <StateView empty={`No crops match “${query}”.`} />
          ) : (
            rows.map((row, i) => (
              <PriceRowView
                key={row.crop.id}
                row={row}
                last={i === rows.length - 1}
                onPress={() =>
                  router.push({
                    pathname: "/crop/[cropId]",
                    params: { cropId: row.crop.id, ...(marketId ? { marketId } : {}) },
                  })
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <KisanDostButton bottom={TAB_BAR_SPACE} />

      <SelectSheet
        visible={pickerOpen}
        title="Choose market"
        value={marketId ?? undefined}
        options={(markets.data?.items ?? []).map((m) => ({
          value: m.id,
          label: m.name,
          hint: m.district,
        }))}
        searchable
        searchPlaceholder="Search market or district"
        onAdd={() => setAddMarketOpen(true)}
        addLabel={isAdmin ? "Add market" : "Request market"}
        onSelect={(id) => void chooseMarket(id)}
        onClose={() => setPickerOpen(false)}
      />

      <AddMarketDialog
        visible={addMarketOpen}
        mode={isAdmin ? "create" : "request"}
        defaultDistrict={me.data?.district ?? undefined}
        onClose={() => setAddMarketOpen(false)}
        onAdded={(id) => {
          setAddMarketOpen(false);
          void chooseMarket(id);
        }}
      />
    </SafeAreaView>
  );
}

function PriceRowView({
  row,
  last,
  onPress,
}: {
  row: PriceRow;
  last: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.crop.name}, Rs ${num(row.price)}. Open trend`}
      style={[styles.row, !last && styles.rowDivider]}
      pressedStyle={{ backgroundColor: "#FAF7F1" }}
    >
      <CropIcon icon={row.crop.icon} category={row.crop.category} size={46} />
      <View style={styles.rowMain}>
        <CropName name={row.crop.name} local={row.crop.nameUr} size={16} />
        <Text style={styles.rowSub}>{CATEGORY_LABELS[row.crop.category].one}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowPrice}>Rs {num(row.price)}</Text>
        <PriceChangePill change={row.change} changePct={row.changePct} style={{ marginTop: 4 }} />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  scroll: { flexGrow: 1, paddingTop: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 16, color: theme.green },
  hello: { fontFamily: fonts.regular, fontSize: 13, color: theme.muted },
  title: { fontFamily: fonts.bold, fontSize: 21, color: theme.ink, letterSpacing: -0.3 },
  marketCard: {
    marginTop: 18,
    marginHorizontal: 20,
    backgroundColor: theme.mustard,
    borderRadius: 24,
    padding: 18,
    overflow: "hidden",
  },
  marketArt: { position: "absolute", right: 0, bottom: 0 },
  marketTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  marketLabel: { fontFamily: fonts.medium, fontSize: 13, color: theme.ink },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FBF0CF",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.green },
  liveText: { fontFamily: fonts.semibold, fontSize: 12, color: theme.ink },
  marketNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  marketName: { fontFamily: fonts.extrabold, fontSize: 24, color: theme.ink, letterSpacing: -0.4, flexShrink: 1 },
  marketDate: { marginTop: 8, fontFamily: fonts.regular, fontSize: 13, color: theme.ink },
  publishedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "#FBF0CF",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: "70%",
  },
  publishedText: { fontFamily: fonts.semibold, fontSize: 12, color: theme.ink, flexShrink: 1 },
  weatherBanner: { marginTop: 10, marginHorizontal: 20 },
  dashCard: {
    marginTop: 12,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.green,
    borderRadius: 22,
    padding: 14,
  },
  dashIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  dashTitle: { fontFamily: fonts.bold, fontSize: 16, color: theme.card },
  dashSub: { fontFamily: fonts.regular, fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 1 },
  dashBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: theme.mustard,
    alignItems: "center",
    justifyContent: "center",
  },
  dashBadgeText: { fontFamily: fonts.bold, fontSize: 12.5, color: theme.ink },
  inlineError: { marginHorizontal: 20, marginTop: 6, fontFamily: fonts.medium, fontSize: 12.5, color: theme.red },
  search: {
    marginTop: 16,
    marginHorizontal: 20,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.card,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 10,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: theme.ink, paddingVertical: 10 },
  chipsScroll: { marginTop: 14, flexGrow: 0 },
  chips: { paddingHorizontal: 20, gap: 8 },
  panel: {
    flexGrow: 1,
    marginTop: 16,
    backgroundColor: theme.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: TAB_BAR_SPACE,
  },
  refreshHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  refreshText: { fontFamily: fonts.regular, fontSize: 12, color: theme.muted },
  listHeader: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, marginBottom: 4 },
  listHeaderText: { fontFamily: fonts.semibold, fontSize: 11.5, letterSpacing: 0.6, color: theme.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line },
  rowMain: { flex: 1, minWidth: 0 },
  rowSub: { marginTop: 2, fontFamily: fonts.regular, fontSize: 13, color: theme.muted },
  rowRight: { alignItems: "flex-end" },
  rowPrice: { fontFamily: fonts.bold, fontSize: 16, color: theme.ink },
});
