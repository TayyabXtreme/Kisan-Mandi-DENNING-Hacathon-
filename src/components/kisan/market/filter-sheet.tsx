import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { useCrops, useResource, withQuery } from "@/lib/api/resources";
import type { ListingsResponse } from "@/lib/api/types";
import { FEATURED_DISTRICTS, type Grade } from "../../../../convex/lib/kisan";
import { Tap } from "../tap";
import { Button, Chip, Segmented, Sheet } from "../ui";

export type MarketFilters = {
  cropId?: string;
  district?: string;
  grade?: Grade;
  sort: "newest" | "price_asc";
};

export const EMPTY_FILTERS: MarketFilters = { sort: "newest" };

export const listingsPath = (f: MarketFilters, q?: string) =>
  withQuery("/listings", { q, cropId: f.cropId, district: f.district, grade: f.grade, sort: f.sort });

const VISIBLE_CROPS = 5;

/** 08 · Filter & sort. Edits a draft; "Show N listings" applies it. */
export function FilterSheet({
  visible,
  initial,
  q,
  onApply,
  onClose,
}: {
  visible: boolean;
  initial: MarketFilters;
  q?: string;
  onApply: (filters: MarketFilters) => void;
  onClose: () => void;
}) {
  // Mounted only while open (see caller), so the draft starts from `initial`.
  const [draft, setDraft] = useState<MarketFilters>(initial);
  const [allCrops, setAllCrops] = useState(false);
  const crops = useCrops().data?.items ?? [];
  // Live count for the draft filters.
  const preview = useResource<ListingsResponse>(visible ? listingsPath(draft, q) : null);
  const set = (next: Partial<MarketFilters>) => setDraft((d) => ({ ...d, ...next }));

  const shownCrops = allCrops ? crops : crops.slice(0, VISIBLE_CROPS);
  const hidden = crops.length - shownCrops.length;
  const count = preview.data?.count;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter & sort"
      maxHeight="88%"
      right={
        <Tap onPress={() => setDraft(EMPTY_FILTERS)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.reset}>Reset</Text>
        </Tap>
      }
    >
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>CROP</Text>
        <View style={styles.wrap}>
          <SandChip label="All crops" selected={!draft.cropId} onPress={() => set({ cropId: undefined })} />
          {shownCrops.map((c) => (
            <SandChip key={c.id} label={c.name} selected={draft.cropId === c.id} onPress={() => set({ cropId: c.id })} />
          ))}
          {hidden > 0 && <SandChip label={`+${hidden} more`} onPress={() => setAllCrops(true)} />}
        </View>

        <Text style={styles.section}>DISTRICT</Text>
        <View style={styles.wrap}>
          <SandChip label="Any" selected={!draft.district} onPress={() => set({ district: undefined })} />
          {FEATURED_DISTRICTS.map((d) => (
            <SandChip key={d} label={d} selected={draft.district === d} onPress={() => set({ district: d })} />
          ))}
        </View>

        <Text style={styles.section}>GRADE</Text>
        <Segmented
          options={[
            { value: "any", label: "Any" },
            { value: "A", label: "A" },
            { value: "B", label: "B" },
            { value: "C", label: "C" },
          ]}
          value={draft.grade ?? "any"}
          onChange={(g) => set({ grade: g === "any" ? undefined : (g as Grade) })}
          activeColor={theme.green}
          style={styles.grades}
        />

        <Text style={styles.section}>SORT BY</Text>
        <Radio label="Newest first" on={draft.sort === "newest"} onPress={() => set({ sort: "newest" })} />
        <View style={styles.divider} />
        <Radio label="Price: low to high" on={draft.sort === "price_asc"} onPress={() => set({ sort: "price_asc" })} />
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={count === undefined ? "Show listings" : `Show ${count} listing${count === 1 ? "" : "s"}`}
          loading={preview.loading}
          onPress={() => {
            onApply(draft);
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}

/** Chip on the white sheet: unselected chips are sand, as in the reference. */
function SandChip(props: { label: string; selected?: boolean; onPress: () => void }) {
  return <Chip {...props} style={props.selected ? undefined : styles.chipOff} />;
}

function Radio({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={styles.radioRow}>
      <Text style={styles.radioLabel}>{label}</Text>
      <View style={[styles.ring, on && styles.ringOn]}>{on && <View style={styles.dot} />}</View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  reset: { fontFamily: fonts.semibold, fontSize: 14, color: theme.green },
  body: { paddingHorizontal: 22, paddingBottom: 8 },
  section: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.8, color: theme.muted, marginTop: 18, marginBottom: 10 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipOff: { backgroundColor: theme.sand },
  grades: { backgroundColor: theme.sand },
  radioRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  radioLabel: { fontFamily: fonts.medium, fontSize: 15.5, color: theme.ink },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, borderColor: theme.line, alignItems: "center", justifyContent: "center" },
  ringOn: { borderColor: theme.green, borderWidth: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.green },
  divider: { height: 1, backgroundColor: theme.line },
  footer: { paddingHorizontal: 22, paddingTop: 12 },
});
