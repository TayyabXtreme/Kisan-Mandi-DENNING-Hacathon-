import { useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ArrowUpDown, MapPin, Search, SlidersHorizontal, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KisanDostButton } from "@/components/kisan/assistant/kisan-dost-button";
import { TAB_BAR_SPACE } from "@/components/kisan/floating-tab-bar";
import { CropArt } from "@/components/kisan/market/crop-art";
import {
  EMPTY_FILTERS,
  FilterSheet,
  listingsPath,
  type MarketFilters,
} from "@/components/kisan/market/filter-sheet";
import { Tap } from "@/components/kisan/tap";
import { Button, CropName, MarketLabelBadge, StateView } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { useCrops, useMe, useResource } from "@/lib/api/resources";
import type { Listing, ListingsResponse } from "@/lib/api/types";
import { day, initials, rs, todayPK } from "@/lib/format";

/** 07 · Marketplace — active listings with search, filters and sort. */
export default function Marketplace() {
  const insets = useSafeAreaInsets();
  const me = useMe().data;
  const crops = useCrops().data?.items ?? [];
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<MarketFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [today] = useState(() => todayPK(Date.now()));

  // Debounce typing before it becomes part of the request path.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const listings = useResource<ListingsResponse>(listingsPath(filters, q || undefined));
  const items = listings.data?.items ?? [];

  const cropName = (id: string) => crops.find((c) => c.id === id)?.name ?? "Crop";
  const active: { key: string; label: string; clear: () => void }[] = [];
  if (filters.cropId)
    active.push({ key: "crop", label: cropName(filters.cropId), clear: () => setFilters((f) => ({ ...f, cropId: undefined })) });
  if (filters.district)
    active.push({ key: "district", label: filters.district, clear: () => setFilters((f) => ({ ...f, district: undefined })) });
  if (filters.grade)
    active.push({ key: "grade", label: `Grade ${filters.grade}`, clear: () => setFilters((f) => ({ ...f, grade: undefined })) });

  const resetAll = () => {
    setFilters(EMPTY_FILTERS);
    setSearch("");
    setQ("");
  };

  const header = (
    <View>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          {!!me && (
            <View style={styles.whoRow}>
              <MapPin size={13} color={theme.muted} strokeWidth={2} />
              <Text style={styles.who} numberOfLines={1}>
                {me.district ?? "Sindh"} {me.role ?? "buyer"} · {me.name}
              </Text>
            </View>
          )}
          <Text style={styles.title} accessibilityRole="header">
            Marketplace
          </Text>
        </View>
        <Tap
          onPress={() => router.navigate("/profile")}
          accessibilityRole="button"
          accessibilityLabel="Profile and settings"
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{me ? initials(me.name) : ""}</Text>
        </Tap>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Search size={18} color={theme.muted} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search produce..."
            placeholderTextColor={theme.muted}
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Search produce"
          />
          {!!search && (
            <Tap onPress={() => setSearch("")} accessibilityLabel="Clear search" hitSlop={8}>
              <X size={16} color={theme.muted} />
            </Tap>
          )}
        </View>
        <Tap
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Filter and sort${active.length ? `, ${active.length} active` : ""}`}
          style={styles.filterButton}
        >
          <SlidersHorizontal size={20} color={theme.card} strokeWidth={2} />
          {active.length > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{active.length}</Text>
            </View>
          )}
        </Tap>
      </View>

      <View style={styles.chipsRow}>
        <View style={styles.activeChips}>
          {active.map((a) => (
            <Tap
              key={a.key}
              onPress={a.clear}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${a.label}`}
              style={styles.activeChip}
            >
              <Text style={styles.activeChipText}>{a.label}</Text>
              <X size={13} color={theme.green} strokeWidth={2.4} />
            </Tap>
          ))}
        </View>
        <Tap
          onPress={() => setFilters((f) => ({ ...f, sort: f.sort === "newest" ? "price_asc" : "newest" }))}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${filters.sort === "newest" ? "newest" : "price, low to high"}. Tap to change`}
          style={styles.sort}
        >
          <ArrowUpDown size={14} color={theme.ink} strokeWidth={2.2} />
          <Text style={styles.sortText}>{filters.sort === "newest" ? "Newest" : "Price"}</Text>
        </Tap>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => <ListingCard listing={item} today={today} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          listings.loading || listings.error ? (
            <StateView loading={listings.loading} error={listings.error} onRetry={() => void listings.refresh()} />
          ) : (
            <View style={styles.empty}>
              <StateView empty={active.length || q ? "No listings match these filters." : "No produce listed yet."} style={{ paddingBottom: 16 }} />
              {(active.length > 0 || !!q) && <Button title="Reset filters" small variant="soft" onPress={resetAll} />}
            </View>
          )
        }
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_SPACE + insets.bottom,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl refreshing={listings.refreshing} onRefresh={() => void listings.refresh()} tintColor={theme.green} colors={[theme.green]} />
        }
        keyboardShouldPersistTaps="handled"
      />
      <KisanDostButton bottom={TAB_BAR_SPACE} />
      {sheetOpen && (
        <FilterSheet
          visible
          initial={filters}
          q={q || undefined}
          onApply={setFilters}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </View>
  );
}

function ListingCard({ listing, today }: { listing: Listing; today: string }) {
  const available =
    listing.availableFrom <= today ? "Available now" : `Available from ${day(listing.availableFrom)}`;
  return (
    <Tap
      onPress={() => router.push({ pathname: "/listing/[id]", params: { id: listing.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${listing.crop.name}, grade ${listing.grade}, ${listing.quantity} maund in ${listing.district}, ${rs(listing.askingPrice)} per 40 kilograms`}
      style={styles.card}
    >
      <View>
        <CropArt icon={listing.crop.icon} category={listing.crop.category} size={96} />
        <View style={styles.gradeOverlay}>
          <Text style={styles.gradeOverlayText}>Grade {listing.grade}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <CropName name={listing.crop.name} local={listing.crop.nameUr} size={17} />
        <Text style={styles.meta} numberOfLines={1}>
          {listing.quantity.toLocaleString("en-US")} maund · {listing.district}
        </Text>
        <Text style={styles.meta}>{available}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {rs(listing.askingPrice)}
            <Text style={styles.per}> /40kg</Text>
          </Text>
          {listing.market && <MarketLabelBadge label={listing.market.label} />}
        </View>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  whoRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  who: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, flexShrink: 1 },
  title: { fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.5, color: theme.ink, marginTop: 4 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.mustardSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 15, color: "#7A5A12" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  search: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.card,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 10,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15.5, color: theme.ink, paddingVertical: 0 },
  filterButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: theme.mustard,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: { fontFamily: fonts.bold, fontSize: 10, color: theme.ink },
  chipsRow: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 4, minHeight: 32 },
  activeChips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.greenSoft,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activeChipText: { fontFamily: fonts.semibold, fontSize: 13, color: theme.green },
  sort: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6, paddingLeft: 8 },
  sortText: { fontFamily: fonts.semibold, fontSize: 13.5, color: theme.ink },
  card: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: theme.card,
    borderRadius: 22,
    padding: 12,
  },
  gradeOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: theme.card,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  gradeOverlayText: { fontFamily: fonts.bold, fontSize: 10.5, color: theme.ink },
  cardBody: { flex: 1, justifyContent: "center", gap: 3 },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: theme.muted },
  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    columnGap: 8,
    rowGap: 6,
  },
  price: { fontFamily: fonts.bold, fontSize: 17, color: theme.ink },
  per: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted },
  empty: { alignItems: "center" },
});
