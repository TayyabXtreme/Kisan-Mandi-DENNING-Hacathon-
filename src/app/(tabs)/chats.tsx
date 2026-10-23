import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { Archive, ArchiveRestore, MessageCircle, Search, Store, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionSheet, notify } from "@/components/kisan/chat/action-sheet";
import { errorText, useChatReady } from "@/components/kisan/chat/chat-api";
import { ChatListRow } from "@/components/kisan/chat/chat-row";
import { TAB_BAR_SPACE } from "@/components/kisan/floating-tab-bar";
import { Tap } from "@/components/kisan/tap";
import { Button, Segmented } from "@/components/kisan/ui";
import { UserAvatar } from "@/components/user-avatar";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api as rest } from "@/lib/api/client";
import { useMe } from "@/lib/api/resources";
import type { ChatRow } from "@/lib/api/types";
import { api } from "../../../convex/_generated/api";

type Filter = "active" | "archived";

/** Chats tab: WhatsApp-style list of buyer <-> farmer conversations. */
export default function ChatsTab() {
  const me = useMe();
  const ready = useChatReady();
  const [filter, setFilter] = useState<Filter>("active");
  const [q, setQ] = useState("");
  const [menuFor, setMenuFor] = useState<ChatRow | null>(null);
  // Reactive: new messages and unread counts update live.
  const rows = useQuery(api.conversations.list, ready ? { archived: filter === "archived" } : "skip");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!rows || !needle) return rows ?? [];
    return rows.filter((r) =>
      [r.other?.name, r.listing?.crop.name, r.listing?.crop.nameUr, r.lastMessage]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const archive = async (row: ChatRow, archived: boolean) => {
    try {
      await rest.post(`/conversations/${row.id}/archive`, { archived });
    } catch (e) {
      notify("Couldn't update chat", errorText(e));
    }
  };

  const isFarmer = me.data?.role === "farmer";
  const loading = rows === undefined;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">
            Chats
          </Text>
          <Text style={styles.subtitle}>
            {isFarmer ? "Buyers asking about your produce" : "Talk to farmers directly"}
          </Text>
        </View>
        {me.data && (
          <Tap
            onPress={() => router.navigate("/profile")}
            accessibilityRole="button"
            accessibilityLabel="Profile and settings"
          >
            <UserAvatar seed={me.data.authId} name={me.data.name} image={me.data.image} size={46} />
          </Tap>
        )}
      </View>

      <View style={styles.search}>
        <Search size={18} color={theme.muted} strokeWidth={2} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name or crop"
          placeholderTextColor={theme.muted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search chats"
        />
        {!!q && (
          <Tap onPress={() => setQ("")} accessibilityLabel="Clear search" hitSlop={8}>
            <X size={18} color={theme.muted} />
          </Tap>
        )}
      </View>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ]}
        style={styles.segmented}
      />

      {loading ? (
        <ActivityIndicator color={theme.green} style={{ marginTop: 48 }} accessibilityLabel="Loading chats" />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ChatListRow
              row={item}
              onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })}
              onLongPress={() => setMenuFor(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MessageCircle size={30} color={theme.green} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>
                {q ? "No chats match your search" : filter === "archived" ? "No archived chats" : "No chats yet"}
              </Text>
              {!q && filter === "active" && (
                <>
                  <Text style={styles.emptyText}>
                    {isFarmer
                      ? "When a buyer taps Chat on one of your listings, the conversation shows up here."
                      : "Open a listing in the Market and tap Chat to talk to the farmer. Your number stays private."}
                  </Text>
                  {!isFarmer && (
                    <Button title="Browse market" Icon={Store} small onPress={() => router.navigate("/marketplace")} />
                  )}
                </>
              )}
            </View>
          }
        />
      )}

      <ActionSheet
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={menuFor?.other?.name}
        actions={
          menuFor
            ? [
                filter === "archived"
                  ? { label: "Unarchive chat", Icon: ArchiveRestore, onPress: () => void archive(menuFor, false) }
                  : { label: "Archive chat", Icon: Archive, onPress: () => void archive(menuFor, true) },
              ]
            : []
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 16 },
  title: { fontFamily: fonts.bold, fontSize: 26, color: theme.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.regular, fontSize: 13.5, color: theme.muted, marginTop: 2 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.card,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: theme.ink, paddingVertical: 0 },
  segmented: { marginHorizontal: 20, marginTop: 12, marginBottom: 8 },
  sep: { height: 1, backgroundColor: theme.line, marginLeft: 86, marginRight: 20 },
  empty: { alignItems: "center", gap: 12, paddingHorizontal: 32, paddingTop: 48 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 17, color: theme.ink, textAlign: "center" },
  emptyText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: theme.muted, textAlign: "center" },
});
