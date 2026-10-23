import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router, useLocalSearchParams, type ErrorBoundaryProps, type Href } from "expo-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { format, isToday, isYesterday } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  Ban,
  Camera,
  ChevronDown,
  Copy,
  Flag,
  HandCoins,
  ImageIcon,
  MoreVertical,
  Phone,
  ShieldCheck,
  Store,
  Trash2,
  X,
} from "lucide-react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionSheet, confirmAction, notify, type SheetAction } from "@/components/kisan/chat/action-sheet";
import {
  errorText,
  markChatRead,
  sendMessage,
  uploadChatFile,
  useChatReady,
} from "@/components/kisan/chat/chat-api";
import { Composer } from "@/components/kisan/chat/composer";
import { DateSeparator, MessageBubble, type OfferAction } from "@/components/kisan/chat/message-bubble";
import { OfferSheet } from "@/components/kisan/chat/offer-sheet";
import { Tap } from "@/components/kisan/tap";
import { BackButton, Button, CropIcon, GradeBadge, IconButton, MarketLabelBadge, StateView, Tag } from "@/components/kisan/ui";
import { UserAvatar } from "@/components/user-avatar";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api as rest } from "@/lib/api/client";
import { invalidate } from "@/lib/api/resources";
import type { ChatDetail, ChatMessage } from "@/lib/api/types";
import { num, rs, todayPK } from "@/lib/format";
import { api } from "../../../convex/_generated/api";

const PAGE = 30;

type Item = { kind: "msg"; m: ChatMessage } | { kind: "date"; key: string; label: string };

const dayKey = (ms: number) => format(new Date(ms), "yyyy-MM-dd");
function dayLabel(ms: number) {
  const d = new Date(ms);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, d.getFullYear() === new Date().getFullYear() ? "EEE, d MMM" : "d MMM yyyy");
}

/** Shown when a reactive query throws (e.g. offline): Expo Router error boundary. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingHorizontal: 20 }]}>
      <BackButton fallback="/chats" />
      <StateView error={{ message: error.message || "Couldn't load this chat." }} onRetry={() => void retry()} />
    </View>
  );
}

/** One buyer <-> farmer conversation, WhatsApp style (docs/plan.md §7). */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const ready = useChatReady();
  const [today] = useState(() => todayPK(Date.now()));
  // Reactive reads (documented exception): new messages and ticks arrive live.
  const chat = useQuery(api.conversations.get, ready && id ? { conversationId: id, date: today } : "skip");
  const messages = usePaginatedQuery(
    api.messages.list,
    ready && id ? { conversationId: id } : "skip",
    { initialNumItems: PAGE },
  );

  const list = useRef<FlatList<Item>>(null);
  const [showDown, setShowDown] = useState(false);
  const [sending, setSending] = useState(false);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [accepting, setAccepting] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  // Opening the chat (and every new incoming message while open) marks it read.
  const marking = useRef(false);
  const myUnread = chat?.myUnread ?? 0;
  useEffect(() => {
    if (!id || !chat || myUnread === 0 || marking.current) return;
    marking.current = true;
    markChatRead(id)
      .catch(() => {})
      .finally(() => {
        marking.current = false;
      });
  }, [id, chat, myUnread]);

  const items = useMemo(() => {
    const out: Item[] = [];
    const rows = messages.results;
    rows.forEach((m, i) => {
      out.push({ kind: "msg", m });
      const older = rows[i + 1];
      // Inverted list: the separator sits above the oldest message of each day.
      if (!older || dayKey(older.createdAt) !== dayKey(m.createdAt))
        out.push({ kind: "date", key: `d-${dayKey(m.createdAt)}`, label: dayLabel(m.createdAt) });
    });
    return out;
  }, [messages.results]);

  if (chat === null) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingHorizontal: 20 }]}>
        <BackButton fallback="/chats" />
        <StateView empty="This chat isn't available. It may have been removed, or you aren't part of it." />
        <Button title="Back to chats" variant="soft" onPress={() => router.replace("/chats")} />
      </View>
    );
  }
  if (!chat) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingHorizontal: 20 }]}>
        <BackButton fallback="/chats" />
        <StateView loading />
      </View>
    );
  }

  const c: ChatDetail = chat;
  const other = c.other;
  const listing = c.listing;
  const listingActive = listing?.status === "active";
  const canSend = !c.blockedMe && !c.iBlocked;

  const toBottom = () => list.current?.scrollToOffset({ offset: 0, animated: true });

  const run = async (task: () => Promise<unknown>) => {
    setSending(true);
    try {
      await task();
      toBottom();
    } catch (e) {
      notify("Couldn't send", errorText(e));
      throw e;
    } finally {
      setSending(false);
    }
  };

  const sendText = (body: string) => run(() => sendMessage(c.id, { type: "text", body }));
  const sendVoice = (uri: string, durationMs: number) =>
    run(async () => {
      const storageId = await uploadChatFile(uri, "audio/mp4");
      await sendMessage(c.id, { type: "voice", storageId, durationMs });
    }).catch(() => {});

  const pickImage = async (source: "camera" | "library") => {
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify("Permission needed", `Allow ${source === "camera" ? "camera" : "photo"} access to send photos.`);
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6 };
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    await run(async () => {
      const storageId = await uploadChatFile(asset.uri, asset.mimeType ?? "image/jpeg");
      await sendMessage(c.id, { type: "image", storageId });
    }).catch(() => {});
  };

  const offerAction = async (m: ChatMessage, action: OfferAction, markSold = false) => {
    setBusyOffer(m.id);
    try {
      await rest.post(`/messages/${m.id}/offer`, { action, markSold });
      if (action === "markSold" || markSold) void invalidate("/listings");
    } catch (e) {
      notify("Couldn't update the offer", errorText(e));
    } finally {
      setBusyOffer(null);
    }
  };

  const onOffer = (m: ChatMessage, action: OfferAction) => {
    if (action === "accept") setAccepting(m);
    else if (action === "decline")
      confirmAction("Decline this offer?", "The buyer will see that you declined.", "Decline", () => void offerAction(m, "decline"));
    else
      confirmAction("Mark listing as sold?", "Buyers will no longer see it in the Market.", "Mark sold", () =>
        void offerAction(m, "markSold"),
      );
  };

  const askAssistant = (m: ChatMessage) => {
    if (!m.offer) return;
    const crop = listing ? `${listing.crop.name} (Grade ${listing.grade}) in ${listing.district}` : "my crop";
    const prompt = `A buyer offered ${rs(m.offer.price)} per 40 kg for ${num(m.offer.quantity)} maund of ${crop}.${
      listing ? ` The asking price is ${rs(listing.askingPrice)}.` : ""
    } Is this offer fair compared to today's mandi prices?`;
    // The assistant screen (Kisan Dost) prefills its composer from `prompt`.
    router.push({ pathname: "/assistant", params: { prompt } } as unknown as Href);
  };

  const setFlag = async (path: "archive" | "block", value: boolean) => {
    try {
      await rest.post(`/conversations/${c.id}/${path}`, path === "archive" ? { archived: value } : { blocked: value });
      if (path === "archive" && value) router.back();
    } catch (e) {
      notify("Couldn't update chat", errorText(e));
    }
  };

  const report = async (reason: string) => {
    try {
      await rest.post(`/conversations/${c.id}/report`, { reason });
      notify("Thanks for telling us", "We'll review this chat. You can also block this person.");
    } catch (e) {
      notify("Couldn't send report", errorText(e));
    }
  };

  const deleteForMe = async (m: ChatMessage) => {
    try {
      await rest.del(`/messages/${m.id}`);
    } catch (e) {
      notify("Couldn't delete", errorText(e));
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const down = e.nativeEvent.contentOffset.y > 400;
    if (down !== showDown) setShowDown(down);
  };

  const name = other?.name ?? "Deleted user";
  const subtitle = [other?.role === "buyer" ? "Buyer" : "Farmer", other?.district].filter(Boolean).join(" · ");

  const menu: SheetAction[] = [
    ...(listing
      ? [{ label: "View listing", Icon: Store, onPress: () => router.push({ pathname: "/listing/[id]", params: { id: listing.id } }) }]
      : []),
    c.archived
      ? { label: "Unarchive chat", Icon: ArchiveRestore, onPress: () => void setFlag("archive", false) }
      : { label: "Archive chat", Icon: Archive, onPress: () => void setFlag("archive", true) },
    c.iBlocked
      ? { label: `Unblock ${name}`, Icon: ShieldCheck, onPress: () => void setFlag("block", false) }
      : {
          label: `Block ${name}`,
          Icon: Ban,
          destructive: true,
          onPress: () =>
            confirmAction(`Block ${name}?`, "They won't be able to message you in any chat.", "Block", () =>
              void setFlag("block", true),
            ),
        },
    { label: "Report", Icon: Flag, destructive: true, onPress: () => setReportOpen(true) },
  ];

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <BackButton fallback="/chats" />
        <UserAvatar seed={other?.authId ?? c.id} name={name} image={other?.image} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
            {name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {!!other?.phone && (
          <IconButton Icon={Phone} label={`Call ${name}`} size={40} bg={theme.bg} onPress={() => void Linking.openURL(`tel:${other.phone}`)} />
        )}
        <IconButton Icon={MoreVertical} label="Chat options" size={40} bg={theme.bg} onPress={() => setMenuOpen(true)} />
      </View>

      {/* Pinned listing */}
      {listing ? (
        <Tap
          onPress={() => router.push({ pathname: "/listing/[id]", params: { id: listing.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Listing: ${listing.crop.name}, grade ${listing.grade}, ${rs(listing.askingPrice)} per 40 kg`}
          style={styles.pinned}
        >
          <CropIcon icon={listing.crop.icon} category={listing.crop.category} size={42} faded={!listingActive} />
          <View style={{ flex: 1 }}>
            <View style={styles.pinnedRow}>
              <Text style={styles.pinnedName} numberOfLines={1}>
                {listing.crop.name}
              </Text>
              <GradeBadge grade={listing.grade} />
              {!listingActive && <Tag label="Sold" />}
            </View>
            <Text style={styles.pinnedMeta} numberOfLines={1}>
              {rs(listing.askingPrice)}/40kg · {num(listing.quantity)} maund · {listing.district}
            </Text>
          </View>
          {listing.marketLabel && listingActive && <MarketLabelBadge label={listing.marketLabel} />}
        </Tap>
      ) : (
        <View style={styles.pinned}>
          <Text style={styles.pinnedMeta}>The listing for this chat was removed.</Text>
        </View>
      )}

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {messages.status === "LoadingFirstPage" ? (
            <ActivityIndicator color={theme.green} style={{ marginTop: 40 }} accessibilityLabel="Loading messages" />
          ) : (
            <FlatList
              ref={list}
              inverted
              data={items}
              keyExtractor={(it) => (it.kind === "msg" ? it.m.id : it.key)}
              renderItem={({ item }) =>
                item.kind === "date" ? (
                  <DateSeparator label={item.label} />
                ) : (
                  <MessageBubble
                    message={item.m}
                    read={item.m.mine && c.otherLastReadAt >= item.m.createdAt}
                    viewerSide={c.side}
                    listingActive={listingActive}
                    busy={busyOffer === item.m.id}
                    onLongPress={() => setSelected(item.m)}
                    onOffer={(action) => onOffer(item.m, action)}
                    onAskAssistant={() => askAssistant(item.m)}
                    onOpenImage={setViewer}
                  />
                )
              }
              onEndReached={() => {
                if (messages.status === "CanLoadMore") messages.loadMore(PAGE);
              }}
              onEndReachedThreshold={0.4}
              onScroll={onScroll}
              scrollEventThrottle={100}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingVertical: 10 }}
              ListFooterComponent={
                messages.status === "LoadingMore" ? (
                  <ActivityIndicator color={theme.green} style={{ marginVertical: 12 }} accessibilityLabel="Loading older messages" />
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>Say salam 👋</Text>
                  <Text style={styles.emptyText}>
                    Ask about quality, delivery or price. You can send photos, voice notes and offers.
                  </Text>
                </View>
              }
            />
          )}
          {showDown && (
            <IconButton
              Icon={ChevronDown}
              label="Scroll to latest message"
              size={42}
              onPress={toBottom}
              style={[styles.down, myUnread > 0 && { backgroundColor: theme.greenSoft }]}
            />
          )}
        </View>

        <View style={{ paddingBottom: insets.bottom + 8 }}>
          {canSend ? (
            <Composer onSendText={sendText} onSendVoice={sendVoice} onAttach={() => setAttachOpen(true)} sending={sending} />
          ) : (
            <View style={styles.blocked}>
              <Text style={styles.blockedText}>
                {c.iBlocked ? `You blocked ${name}. Unblock to send messages.` : "You can't reply to this chat."}
              </Text>
              {c.iBlocked && <Button title="Unblock" small variant="soft" onPress={() => void setFlag("block", false)} />}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <ActionSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={name} actions={menu} />
      <ActionSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Why are you reporting?"
        actions={["Spam or scam", "Abusive language", "Fake listing or prices", "Something else"].map((reason) => ({
          label: reason,
          Icon: Flag,
          onPress: () => void report(reason),
        }))}
      />
      <ActionSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        title="Send"
        actions={[
          { label: "Take a photo", Icon: Camera, onPress: () => void pickImage("camera") },
          { label: "Choose from gallery", Icon: ImageIcon, onPress: () => void pickImage("library") },
          ...(c.side === "buyer" && listing && listingActive
            ? [{ label: "Make a price offer", Icon: HandCoins, onPress: () => setOfferOpen(true) }]
            : []),
        ]}
      />
      <ActionSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        actions={
          selected
            ? [
                ...(selected.type === "text"
                  ? [{ label: "Copy", Icon: Copy, onPress: () => void Clipboard.setStringAsync(selected.body) }]
                  : []),
                { label: "Delete for me", Icon: Trash2, destructive: true, onPress: () => void deleteForMe(selected) },
              ]
            : []
        }
      />
      <ActionSheet
        visible={!!accepting}
        onClose={() => setAccepting(null)}
        title="Accept this offer?"
        actions={
          accepting
            ? [
                { label: "Accept offer", Icon: HandCoins, onPress: () => void offerAction(accepting, "accept") },
                ...(listingActive
                  ? [{ label: "Accept and mark listing sold", Icon: Store, onPress: () => void offerAction(accepting, "accept", true) }]
                  : []),
              ]
            : []
        }
      />
      {listing && c.side === "buyer" && (
        <OfferSheet
          visible={offerOpen}
          onClose={() => setOfferOpen(false)}
          listing={listing}
          onSubmit={async (offer) => {
            await sendMessage(c.id, { type: "offer", ...offer });
            toBottom();
          }}
        />
      )}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          {viewer && <Image source={{ uri: viewer }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel="Photo" />}
          <IconButton Icon={X} label="Close photo" onPress={() => setViewer(null)} style={[styles.viewerClose, { top: insets.top + 12 }]} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: theme.card,
  },
  name: { fontFamily: fonts.bold, fontSize: 17, color: theme.ink },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 1 },
  pinned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 10,
    paddingRight: 12,
    borderRadius: 18,
    backgroundColor: theme.card,
  },
  pinnedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pinnedName: { fontFamily: fonts.bold, fontSize: 15, color: theme.ink, flexShrink: 1 },
  pinnedMeta: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 2 },
  down: {
    position: "absolute",
    right: 14,
    bottom: 10,
    shadowColor: theme.ink,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  empty: { alignItems: "center", paddingHorizontal: 40, paddingVertical: 40, gap: 6, transform: [{ scaleY: -1 }] },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 17, color: theme.ink },
  emptyText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: theme.muted, textAlign: "center" },
  blocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.card,
  },
  blockedText: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5, color: theme.muted },
  viewer: { flex: 1, backgroundColor: "#000" },
  viewerClose: { position: "absolute", right: 16 },
});
