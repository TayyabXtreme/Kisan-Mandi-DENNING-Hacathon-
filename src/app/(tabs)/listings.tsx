import { useState } from "react";
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Check, Lock, MessageCircle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TAB_BAR_SPACE } from "@/components/kisan/floating-tab-bar";
import { Tap } from "@/components/kisan/tap";
import {
  Button,
  CropIcon,
  CropName,
  GradeBadge,
  IconButton,
  MarketLabelBadge,
  Segmented,
  StateView,
  Tag,
} from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate, useResource, withQuery } from "@/lib/api/resources";
import type { ChatCountsResponse, Listing, MyListingsResponse } from "@/lib/api/types";
import { day, num, rs } from "@/lib/format";

type Status = "active" | "sold";

/** Native confirm dialog; window.confirm on web, where Alert buttons don't run. */
function confirm(title: string, message: string, action: string, onYes: () => void) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: action, style: action === "Delete" ? "destructive" : "default", onPress: onYes },
  ]);
}

/** 10 · My Listings (farmers). Only the owner's own listings, with actions. */
export default function MyListings() {
  const [status, setStatus] = useState<Status>("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, error, loading, refreshing, refresh } = useResource<MyListingsResponse>(
    withQuery("/listings/mine", { status }),
  );
  // "3 chats" chips: how many buyers are talking about each listing.
  const chatCounts = useResource<ChatCountsResponse>("/conversations/counts");

  const run = async (id: string, task: () => Promise<unknown>) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await task();
      await invalidate("/listings");
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      if (Platform.OS === "web") globalThis.alert?.(message);
      else Alert.alert("Couldn't update listing", message);
    } finally {
      setBusyId(null);
    }
  };

  const markSold = (l: Listing) =>
    confirm("Mark as sold?", `${l.crop.name} · ${num(l.quantity)} maund will leave the marketplace.`, "Mark sold", () =>
      void run(l.id, () => api.patch(`/listings/${l.id}`, { status: "sold" })),
    );
  const relist = (l: Listing) =>
    void run(l.id, () => api.patch(`/listings/${l.id}`, { status: "active" }));
  const remove = (l: Listing) =>
    confirm("Delete listing?", `${l.crop.name} · ${num(l.quantity)} maund will be removed for good.`, "Delete", () =>
      void run(l.id, () => api.del(`/listings/${l.id}`)),
    );

  const items = data?.items ?? [];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.green} colors={[theme.green]} />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} accessibilityRole="header">
              My Listings
            </Text>
            <Text style={styles.subtitle}>Only you can edit these</Text>
          </View>
          <Button title="Sell produce" Icon={Plus} small onPress={() => router.push("/sell")} />
        </View>

        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Active", count: data?.counts.active },
            { value: "sold", label: "Sold", count: data?.counts.sold },
          ]}
          style={styles.segmented}
        />

        {loading || (error && !data) ? (
          <StateView loading={loading} error={error} onRetry={() => void refresh()} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <StateView
              empty={status === "active" ? "You haven't posted produce yet." : "Nothing sold yet."}
              style={{ paddingVertical: 28 }}
            />
            {status === "active" && (
              <Button title="Sell produce" Icon={Plus} onPress={() => router.push("/sell")} />
            )}
          </View>
        ) : (
          items.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              chats={chatCounts.data?.counts[l.id] ?? 0}
              busy={busyId === l.id}
              onEdit={() => router.push({ pathname: "/sell", params: { id: l.id } })}
              onSold={() => markSold(l)}
              onRelist={() => relist(l)}
              onDelete={() => remove(l)}
            />
          ))
        )}

        <View style={styles.note}>
          <Lock size={16} color={theme.muted} strokeWidth={2} />
          <Text style={styles.noteText}>
            Edit, Mark sold and Delete only appear on listings you posted.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ListingCard({
  listing: l,
  chats,
  busy,
  onEdit,
  onSold,
  onRelist,
  onDelete,
}: {
  listing: Listing;
  chats: number;
  busy: boolean;
  onEdit: () => void;
  onSold: () => void;
  onRelist: () => void;
  onDelete: () => void;
}) {
  const sold = l.status === "sold";
  return (
    <View style={[styles.card, busy && { opacity: 0.6 }]}>
      <Tap
        onPress={() => router.push({ pathname: "/listing/[id]", params: { id: l.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${l.crop.name}, grade ${l.grade}, ${num(l.quantity)} maund, ${rs(l.askingPrice)} per 40 kg`}
        pressedStyle={{ opacity: 0.8 }}
      >
        <View style={styles.cardTop}>
          <CropIcon icon={l.crop.icon} category={l.crop.category} size={52} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.nameRow}>
              <CropName name={l.crop.name} size={16} style={{ flexShrink: 1 }} />
              <GradeBadge grade={l.grade} />
              {sold && <Tag label="Sold" />}
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {num(l.quantity)} maund · from {day(l.availableFrom)} · {l.district}
            </Text>
          </View>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {rs(l.askingPrice)}
            <Text style={styles.per}> /40kg</Text>
          </Text>
          <View style={styles.badges}>
            {chats > 0 && (
              <Tap
                onPress={() => router.navigate("/chats")}
                accessibilityRole="button"
                accessibilityLabel={`${chats} chat${chats === 1 ? "" : "s"} about this listing. Open Chats`}
                style={styles.chatChip}
              >
                <MessageCircle size={13} color={theme.green} strokeWidth={2.4} />
                <Text style={styles.chatChipText}>
                  {chats} chat{chats === 1 ? "" : "s"}
                </Text>
              </Tap>
            )}
            {l.market && <MarketLabelBadge label={l.market.label} />}
          </View>
        </View>
      </Tap>
      <View style={styles.actions}>
        {sold ? (
          <Button title="Relist" Icon={RotateCcw} small variant="soft" onPress={onRelist} disabled={busy} style={{ flex: 1 }} />
        ) : (
          <>
            <Button title="Edit" Icon={Pencil} small variant="soft" onPress={onEdit} disabled={busy} style={styles.edit} />
            <Button title="Mark sold" Icon={Check} small variant="greenSoft" onPress={onSold} disabled={busy} style={{ flex: 1 }} />
          </>
        )}
        <IconButton Icon={Trash2} label={`Delete ${l.crop.name} listing`} bg={theme.redSoft} color={theme.red} size={42} onPress={onDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: TAB_BAR_SPACE },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontFamily: fonts.bold, fontSize: 26, color: theme.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.regular, fontSize: 13.5, color: theme.muted, marginTop: 2 },
  segmented: { marginTop: 18, marginBottom: 14 },
  empty: { alignItems: "center", gap: 4, paddingBottom: 12 },
  card: { backgroundColor: theme.card, borderRadius: 22, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  meta: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  price: { fontFamily: fonts.bold, fontSize: 19, color: theme.ink },
  per: { fontFamily: fonts.regular, fontSize: 13, color: theme.muted },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  badges: { flexDirection: "row", alignItems: "center", gap: 6 },
  chatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.greenSoft,
  },
  chatChipText: { fontFamily: fonts.bold, fontSize: 11.5, color: theme.green },
  edit: { minWidth: 104 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.2,
    borderStyle: "dashed",
    borderColor: "#D8CFBF",
    borderRadius: 16,
    padding: 14,
    marginTop: 6,
  },
  noteText: { flex: 1, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: theme.muted },
});
