import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Check, CheckCheck, CircleCheck, CircleX, Clock, HandCoins, Sparkles, Tag as TagIcon } from "lucide-react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import type { ChatMessage } from "@/lib/api/types";
import { clock, num, rs } from "@/lib/format";
import { Tap } from "../tap";
import { Button } from "../ui";
import { VoicePlayer } from "./voice-player";

export const MY_BUBBLE = theme.greenSoft; // #DDEBD5
export type OfferAction = "accept" | "decline" | "markSold";

type Props = {
  message: ChatMessage;
  /** The other person opened the chat after this message (✓✓ green). */
  read: boolean;
  viewerSide: "buyer" | "farmer";
  listingActive: boolean;
  busy?: boolean;
  onLongPress: () => void;
  onOffer: (action: OfferAction) => void;
  onAskAssistant: () => void;
  onOpenImage: (url: string) => void;
};

function Meta({ m, read }: { m: ChatMessage; read: boolean }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.time}>{clock(m.createdAt)}</Text>
      {m.mine &&
        (read ? (
          <CheckCheck size={15} color={theme.green} strokeWidth={2.4} accessibilityLabel="Read" />
        ) : (
          <Check size={15} color={theme.muted} strokeWidth={2.4} accessibilityLabel="Sent" />
        ))}
    </View>
  );
}

const OFFER_STATUS = {
  pending: { label: "Waiting for farmer", Icon: Clock, bg: theme.mustardSoft, fg: "#7A5A12" },
  accepted: { label: "Accepted", Icon: CircleCheck, bg: theme.greenSoft, fg: theme.green },
  declined: { label: "Declined", Icon: CircleX, bg: theme.redSoft, fg: theme.red },
} as const;

function OfferBody({
  m,
  viewerSide,
  listingActive,
  busy,
  onOffer,
  onAskAssistant,
}: Pick<Props, "viewerSide" | "listingActive" | "busy" | "onOffer" | "onAskAssistant"> & { m: ChatMessage }) {
  const offer = m.offer!;
  const s = OFFER_STATUS[offer.status];
  const farmer = viewerSide === "farmer";
  return (
    <View style={styles.offer}>
      <View style={styles.offerHead}>
        <HandCoins size={18} color={theme.green} strokeWidth={2.2} />
        <Text style={styles.offerTitle}>{m.mine ? "Your offer" : "Price offer"}</Text>
      </View>
      <Text style={styles.offerPrice}>
        {rs(offer.price)}
        <Text style={styles.offerPer}> / 40 kg</Text>
      </Text>
      <Text style={styles.offerQty}>
        × {num(offer.quantity)} maund = {rs(offer.price * offer.quantity)}
      </Text>
      {!!m.body && <Text style={styles.offerNote}>{m.body}</Text>}
      <View style={[styles.offerStatus, { backgroundColor: s.bg }]}>
        <s.Icon size={14} color={s.fg} strokeWidth={2.4} />
        <Text style={[styles.offerStatusText, { color: s.fg }]}>{s.label}</Text>
      </View>
      {farmer && offer.status === "pending" && (
        <View style={styles.offerActions}>
          <Button title="Decline" small variant="danger" style={{ flex: 1 }} disabled={busy} onPress={() => onOffer("decline")} />
          <Button title="Accept" small variant="green" style={{ flex: 1 }} loading={busy} onPress={() => onOffer("accept")} />
        </View>
      )}
      {farmer && offer.status === "accepted" && listingActive && (
        <Button
          title="Mark listing sold"
          Icon={TagIcon}
          small
          variant="greenSoft"
          style={{ marginTop: 10 }}
          loading={busy}
          onPress={() => onOffer("markSold")}
        />
      )}
      <Tap
        onPress={onAskAssistant}
        accessibilityRole="button"
        accessibilityLabel="Ask Kisan Dost if this offer is fair"
        style={styles.ask}
        pressedStyle={{ opacity: 0.6 }}
      >
        <Sparkles size={14} color={theme.green} strokeWidth={2.2} />
        <Text style={styles.askText}>Ask Kisan Dost if this offer is fair</Text>
      </Tap>
    </View>
  );
}

/** One chat bubble: text, photo, voice note, offer card or system note. */
export const MessageBubble = memo(function MessageBubble(props: Props) {
  const { message: m, read, onLongPress, onOpenImage } = props;
  if (m.type === "system")
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.system}>{m.body}</Text>
      </View>
    );

  const bubbleStyle = [
    styles.bubble,
    m.mine ? styles.mine : styles.theirs,
    m.type === "image" && styles.imageBubble,
    m.type === "offer" && styles.offerBubble,
  ];
  return (
    <View style={[styles.line, m.mine ? styles.lineMine : styles.lineTheirs]}>
      <Tap
        onLongPress={onLongPress}
        onPress={m.type === "image" && m.url ? () => onOpenImage(m.url!) : undefined}
        delayLongPress={350}
        accessibilityHint="Long press for options"
        style={bubbleStyle}
        pressedStyle={{ opacity: 0.92 }}
      >
        {m.type === "text" && (
          <Text style={styles.text} selectable={false}>
            {m.body}
          </Text>
        )}
        {m.type === "image" &&
          (m.url ? (
            <Image
              source={{ uri: m.url }}
              style={styles.image}
              contentFit="cover"
              transition={150}
              accessibilityLabel="Photo"
            />
          ) : (
            <View style={[styles.image, styles.imageMissing]}>
              <Text style={styles.time}>Photo unavailable</Text>
            </View>
          ))}
        {m.type === "image" && !!m.body && <Text style={[styles.text, styles.caption]}>{m.body}</Text>}
        {m.type === "voice" && <VoicePlayer url={m.url} durationMs={m.durationMs ?? 0} mine={m.mine} />}
        {m.type === "offer" && m.offer && <OfferBody m={m} {...props} />}
        <Meta m={m} read={read} />
      </Tap>
    </View>
  );
});

/** "Today" / "Yesterday" / "Mon, 12 Oct" pill between days. */
export function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.dateWrap} accessibilityRole="header">
      <Text style={styles.date}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { paddingHorizontal: 12, marginVertical: 2, flexDirection: "row" },
  lineMine: { justifyContent: "flex-end" },
  lineTheirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    shadowColor: theme.ink,
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  mine: { backgroundColor: MY_BUBBLE, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: theme.card, borderBottomLeftRadius: 6 },
  imageBubble: { padding: 4, paddingBottom: 4 },
  offerBubble: { width: 260 },
  text: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 21, color: theme.ink },
  caption: { paddingHorizontal: 6, paddingTop: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-end", marginTop: 2, paddingHorizontal: 2 },
  time: { fontFamily: fonts.regular, fontSize: 11, color: theme.muted },
  image: { width: 220, height: 220, borderRadius: 14, backgroundColor: theme.sand },
  imageMissing: { alignItems: "center", justifyContent: "center" },
  systemWrap: { alignItems: "center", marginVertical: 8, paddingHorizontal: 32 },
  system: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: "#6B5B2E",
    backgroundColor: theme.mustardSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    textAlign: "center",
    overflow: "hidden",
  },
  dateWrap: { alignItems: "center", marginVertical: 10 },
  date: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: theme.muted,
    backgroundColor: theme.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: "hidden",
  },
  offer: { paddingTop: 2 },
  offerHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  offerTitle: { fontFamily: fonts.semibold, fontSize: 13, color: theme.green },
  offerPrice: { fontFamily: fonts.extrabold, fontSize: 24, color: theme.ink, marginTop: 6, letterSpacing: -0.4 },
  offerPer: { fontFamily: fonts.regular, fontSize: 13, color: theme.muted, letterSpacing: 0 },
  offerQty: { fontFamily: fonts.medium, fontSize: 13.5, color: theme.ink, marginTop: 2 },
  offerNote: { fontFamily: fonts.regular, fontSize: 14, color: theme.ink, marginTop: 8 },
  offerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 10,
  },
  offerStatusText: { fontFamily: fonts.bold, fontSize: 12 },
  offerActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  ask: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingVertical: 4 },
  askText: { fontFamily: fonts.semibold, fontSize: 12.5, color: theme.green, textDecorationLine: "underline" },
});
