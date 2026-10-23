import { useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { format } from "date-fns";
import { router } from "expo-router";
import {
  Check,
  ChevronRight,
  MapPin,
  Phone,
  Plus,
  Search,
  Store,
  X,
} from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { districtLabel } from "@/components/kisan/districts";
import { AddMarketDialog } from "@/components/kisan/market/add-market-dialog";
import { TOPIC_TEXT } from "@/components/kisan/support/contact-admin-dialog";
import { Tap } from "@/components/kisan/tap";
import { Button, ScreenTitle, StateView, Tag } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate, useMarkets, useMe, useResource } from "@/lib/api/resources";
import type { ListResponse, MarketRequest, SupportMessage } from "@/lib/api/types";
import { phoneDisplay } from "@/lib/format";

type Tab = "requests" | "markets" | "messages";

type Person = { name: string; role: "farmer" | "buyer" | null; phone: string | null } | null;

/** Admin panel: market requests, the market list, and messages from users. */
export default function Admin() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const markets = useMarkets();
  const requests = useResource<ListResponse<MarketRequest>>("/market-requests");
  const messages = useResource<ListResponse<SupportMessage>>("/support");
  const [tab, setTab] = useState<Tab>("requests");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  // The card whose button is working (only its buttons spin).
  const [working, setWorking] = useState<{ id: string; action: string } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const run = async (id: string, action: string, task: () => Promise<void>, ok: string) => {
    if (working) return;
    setWorking({ id, action });
    setError("");
    setDone("");
    try {
      await task();
      setDone(ok);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save that. Try again.");
    } finally {
      setWorking(null);
    }
  };

  const resolveRequest = (r: MarketRequest, action: "approve" | "reject") =>
    run(
      r.id,
      action,
      async () => {
        await api.patch(`/market-requests/${r.id}`, { action });
        await invalidate("/market-requests", "/markets");
      },
      action === "approve" ? `${r.name} added to the market list.` : `${r.name} rejected.`,
    );

  const markDone = (m: SupportMessage) =>
    run(
      m.id,
      "done",
      async () => {
        await api.patch(`/support/${m.id}`, {});
        await invalidate("/support");
      },
      "Message marked as done.",
    );

  if (me.data && !me.data.isAdmin)
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.pad}>
          <ScreenTitle title="Admin" />
          <StateView empty="Only the admin can open this page." />
        </View>
      </SafeAreaView>
    );

  const requestItems = requests.data?.items ?? [];
  const messageItems = messages.data?.items ?? [];
  const q = query.trim().toLowerCase();
  const marketItems = (markets.data?.items ?? []).filter(
    (m) => !q || m.name.toLowerCase().includes(q) || m.district.toLowerCase().includes(q),
  );

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "requests", label: "Requests", count: requestItems.length },
    { value: "markets", label: "Markets" },
    { value: "messages", label: "Messages", count: messageItems.length },
  ];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={requests.refreshing || messages.refreshing}
            onRefresh={() => void Promise.all([requests.refresh(), markets.refresh(), messages.refresh()])}
            tintColor={theme.green}
            colors={[theme.green]}
          />
        }
      >
        <ScreenTitle title="Admin" />

        {/* Summary */}
        <View style={styles.summary}>
          <Stat value={markets.data?.items.length} label="Markets" />
          <Stat value={requests.data ? requestItems.length : undefined} label="Requests" highlight={requestItems.length > 0} />
          <Stat value={messages.data ? messageItems.length : undefined} label="Messages" highlight={messageItems.length > 0} />
        </View>

        {/* Tabs */}
        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((t) => {
            const on = t.value === tab;
            return (
              <Tap
                key={t.value}
                onPress={() => {
                  setTab(t.value);
                  setDone("");
                  setError("");
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                  {t.label}
                </Text>
                {!!t.count && (
                  <View style={[styles.badge, on && { backgroundColor: theme.card }]}>
                    <Text style={[styles.badgeText, on && { color: theme.ink }]}>{t.count}</Text>
                  </View>
                )}
              </Tap>
            );
          })}
        </View>

        {!!done && <Text style={styles.done}>{done}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {tab === "requests" &&
          (requests.loading ? (
            <StateView loading />
          ) : requests.error && !requests.data ? (
            <StateView error={requests.error} onRetry={() => void requests.refresh()} />
          ) : requestItems.length === 0 ? (
            <StateView empty="No market requests waiting. Farmers and buyers send them from the market picker." />
          ) : (
            requestItems.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardIcon}>
                    <Store size={20} color={theme.green} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {r.name}
                    </Text>
                    {!!r.nameUr && <Text style={styles.muted}>{r.nameUr}</Text>}
                    <View style={styles.metaRow}>
                      <MapPin size={13} color={theme.muted} strokeWidth={2.2} />
                      <Text style={styles.muted}>{districtLabel(r.district)}</Text>
                    </View>
                  </View>
                </View>
                {!!r.note && <Text style={styles.quote}>“{r.note}”</Text>}
                <Sender person={r.requester} />
                <View style={styles.actions}>
                  <Button
                    title="Reject"
                    Icon={X}
                    variant="danger"
                    small
                    loading={working?.id === r.id && working.action === "reject"}
                    disabled={!!working}
                    onPress={() => void resolveRequest(r, "reject")}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Approve"
                    Icon={Check}
                    variant="green"
                    small
                    loading={working?.id === r.id && working.action === "approve"}
                    disabled={!!working}
                    onPress={() => void resolveRequest(r, "approve")}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ))
          ))}

        {tab === "markets" && (
          <>
            <Button title="Add market" Icon={Plus} variant="green" onPress={() => setAddOpen(true)} />
            <View style={styles.search}>
              <Search size={18} color={theme.muted} strokeWidth={2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search market or district"
                placeholderTextColor={theme.muted}
                autoCorrect={false}
                style={styles.searchInput}
                accessibilityLabel="Search markets"
              />
              {!!query && (
                <Tap onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
                  <X size={16} color={theme.muted} strokeWidth={2.2} />
                </Tap>
              )}
            </View>
            {markets.loading ? (
              <StateView loading />
            ) : markets.error && !markets.data ? (
              <StateView error={markets.error} onRetry={() => void markets.refresh()} />
            ) : marketItems.length === 0 ? (
              <StateView empty={q ? `No markets match “${query}”.` : "No markets yet. Add the first one."} />
            ) : (
              <View style={styles.list}>
                {marketItems.map((m, i) => (
                  <Tap
                    key={m.id}
                    onPress={() => router.push({ pathname: "/admin/market/[id]", params: { id: m.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.name}, ${m.district}. Edit market and prices`}
                    style={[styles.marketRow, i < marketItems.length - 1 && styles.divider]}
                    pressedStyle={{ backgroundColor: "#FAF7F1" }}
                  >
                    <View style={styles.cardIcon}>
                      <Store size={18} color={theme.green} strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {m.name}
                      </Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {districtLabel(m.district)}
                      </Text>
                    </View>
                    <Text style={styles.rowAction}>Prices</Text>
                    <ChevronRight size={18} color={theme.muted} />
                  </Tap>
                ))}
              </View>
            )}
          </>
        )}

        {tab === "messages" &&
          (messages.loading ? (
            <StateView loading />
          ) : messages.error && !messages.data ? (
            <StateView error={messages.error} onRetry={() => void messages.refresh()} />
          ) : messageItems.length === 0 ? (
            <StateView empty="No messages. Farmers and buyers write from Profile → Contact admin." />
          ) : (
            messageItems.map((m) => (
              <View key={m.id} style={styles.card}>
                <View style={styles.messageTop}>
                  <Tag label={TOPIC_TEXT[m.topic]} bg={theme.greenSoft} color={theme.green} />
                  <Text style={styles.muted}>{format(new Date(m.createdAt), "d MMM, h:mm a")}</Text>
                </View>
                <Text style={styles.messageText}>{m.message}</Text>
                <Sender person={m.sender} />
                <View style={styles.actions}>
                  {m.sender?.phone && (
                    <Button
                      title="Call"
                      Icon={Phone}
                      variant="soft"
                      small
                      onPress={() => void Linking.openURL(`tel:${m.sender?.phone}`)}
                      style={{ flex: 1 }}
                    />
                  )}
                  <Button
                    title="Mark done"
                    Icon={Check}
                    variant="green"
                    small
                    loading={working?.id === m.id}
                    disabled={!!working}
                    onPress={() => void markDone(m)}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ))
          ))}
      </ScrollView>

      <AddMarketDialog
        visible={addOpen}
        mode="create"
        defaultDistrict={me.data?.district ?? undefined}
        onClose={() => setAddOpen(false)}
        onAdded={(id) => {
          setAddOpen(false);
          setError("");
          setDone("");
          // Straight to the new market to enter its first prices.
          router.push({ pathname: "/admin/market/[id]", params: { id } });
        }}
      />
    </SafeAreaView>
  );
}

function Stat({ value, label, highlight }: { value?: number; label: string; highlight?: boolean }) {
  return (
    <View style={[styles.stat, highlight && { backgroundColor: theme.mustardSoft }]}>
      <Text style={styles.statValue}>{value ?? "–"}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Who sent a request or message: name, role tag, phone. */
function Sender({ person }: { person: Person }) {
  if (!person) return null;
  return (
    <View style={styles.sender}>
      <Text style={styles.senderName} numberOfLines={1}>
        {person.name || "Someone"}
      </Text>
      {person.role && (
        <Tag
          label={person.role === "farmer" ? "Farmer" : "Buyer"}
          bg={person.role === "farmer" ? theme.greenSoft : theme.mustardSoft}
          color={person.role === "farmer" ? theme.green : theme.ink}
        />
      )}
      {person.phone && (
        <View style={styles.metaRow}>
          <Phone size={13} color={theme.muted} strokeWidth={2.2} />
          <Text style={styles.muted}>{phoneDisplay(person.phone)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  pad: { paddingHorizontal: 20, paddingTop: 12 },
  summary: { flexDirection: "row", gap: 10, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: theme.card, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 12 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 24, color: theme.ink },
  statLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: 12.5, color: theme.muted },
  tabs: {
    flexDirection: "row",
    backgroundColor: theme.sand,
    borderRadius: 22,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
  },
  tabOn: { backgroundColor: theme.ink },
  tabText: { fontFamily: fonts.semibold, fontSize: 13.5, color: theme.ink, flexShrink: 1 },
  tabTextOn: { color: theme.card },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: theme.mustard,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: theme.ink },
  done: { marginBottom: 12, textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: theme.green },
  error: { marginBottom: 12, textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: theme.red },
  card: { backgroundColor: theme.card, borderRadius: 22, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: "row", gap: 12 },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, color: theme.ink },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: theme.muted },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  quote: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.bg,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 19,
    color: theme.ink,
  },
  sender: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.line,
  },
  senderName: { fontFamily: fonts.semibold, fontSize: 14, color: theme.ink, flexShrink: 1 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 12,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.card,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: theme.ink, paddingVertical: 8 },
  list: { backgroundColor: theme.card, borderRadius: 22, paddingHorizontal: 14 },
  marketRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: theme.ink },
  rowAction: { fontFamily: fonts.semibold, fontSize: 13, color: theme.green },
  messageTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  messageText: { marginTop: 10, fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 21, color: theme.ink },
});
