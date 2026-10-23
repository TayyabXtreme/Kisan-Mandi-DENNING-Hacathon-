import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Clock, MessagesSquare } from "lucide-react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import type { OpenOffer } from "@/lib/api/types";
import { num, rs } from "@/lib/format";
import { UserAvatar } from "@/components/user-avatar";
import { Tap } from "../tap";
import { Button, CropIcon, GradeBadge } from "../ui";

/**
 * An offer waiting in one of my chats. When it's mine to answer: Accept
 * (deal, stock goes down), Negotiate (open the chat to talk or counter) or
 * Decline. Otherwise it shows who we're waiting for.
 */
export function OfferCard({
  offer: o,
  viewer,
  busy,
  onAccept,
  onDecline,
}: {
  offer: OpenOffer;
  viewer: "farmer" | "buyer";
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const diffPct = ((o.price - o.listing.askingPrice) / o.listing.askingPrice) * 100;
  const openChat = () => router.push({ pathname: "/chat/[id]", params: { id: o.conversationId } });
  const name = o.other?.name ?? "Deleted user";
  const verb = viewer === "farmer" ? (o.awaitingMe ? "wants to buy" : "your offer to") : o.awaitingMe ? "offers you" : "your offer for";
  return (
    <View style={[styles.card, o.awaitingMe && styles.cardNew, busy && { opacity: 0.6 }]}>
      <Tap onPress={openChat} accessibilityRole="button" accessibilityLabel={`Offer from ${name}. Open chat`} pressedStyle={{ opacity: 0.8 }}>
        <View style={styles.head}>
          <UserAvatar seed={o.other?.authId ?? o.id} name={name} image={o.other?.image} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {o.awaitingMe ? verb : `Waiting for ${viewer === "farmer" ? "the buyer" : "the farmer"}`}
              {o.other?.district ? ` · ${o.other.district}` : ""}
            </Text>
          </View>
          {!o.awaitingMe && <Clock size={18} color={theme.muted} strokeWidth={2} />}
        </View>

        <View style={styles.deal}>
          <CropIcon icon={o.listing.crop.icon} category={o.listing.crop.category} size={44} />
          <View style={{ flex: 1 }}>
            <View style={styles.cropRow}>
              <Text style={styles.crop}>{o.listing.crop.name}</Text>
              <GradeBadge grade={o.listing.grade} />
            </View>
            <Text style={styles.terms}>
              <Text style={styles.strong}>{num(o.quantity)} maund</Text> × {rs(o.price)}/40kg
            </Text>
            <Text style={[styles.vs, { color: diffPct < 0 ? theme.red : theme.green }]}>
              {diffPct === 0
                ? "Same as your asking price"
                : `${Math.abs(diffPct).toFixed(1)}% ${diffPct < 0 ? "below" : "above"} asking ${rs(o.listing.askingPrice)}`}
            </Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{rs(o.total)}</Text>
          </View>
        </View>
        {!!o.note && <Text style={styles.note}>“{o.note}”</Text>}
        {viewer === "farmer" && (
          <Text style={styles.stock}>
            In stock: {num(o.listing.stock)} maund
            {o.quantity < o.listing.stock ? ` → ${num(o.listing.stock - o.quantity)} left after this deal` : " → sold out after this deal"}
          </Text>
        )}
      </Tap>

      {o.awaitingMe ? (
        <View style={styles.actions}>
          <Button title="Decline" small variant="danger" disabled={busy} onPress={onDecline} style={styles.decline} />
          <Button title="Negotiate" Icon={MessagesSquare} small variant="soft" disabled={busy} onPress={openChat} style={{ flex: 1 }} />
          <Button title="Accept" small variant="green" loading={busy} onPress={onAccept} style={{ flex: 1 }} />
        </View>
      ) : (
        <Button title="Open chat" Icon={MessagesSquare} small variant="soft" onPress={openChat} style={{ marginTop: 12 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.card, borderRadius: 22, padding: 14, marginBottom: 10 },
  cardNew: { borderWidth: 1.5, borderColor: theme.mustard },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: theme.ink },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 1 },
  deal: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, backgroundColor: theme.bg, borderRadius: 16, padding: 10 },
  cropRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  crop: { fontFamily: fonts.bold, fontSize: 14.5, color: theme.ink },
  terms: { fontFamily: fonts.regular, fontSize: 13.5, color: theme.ink, marginTop: 3 },
  strong: { fontFamily: fonts.bold },
  vs: { fontFamily: fonts.medium, fontSize: 11.5, marginTop: 2 },
  totalBox: { alignItems: "flex-end" },
  totalLabel: { fontFamily: fonts.regular, fontSize: 11, color: theme.muted },
  total: { fontFamily: fonts.extrabold, fontSize: 15.5, color: theme.ink, marginTop: 2 },
  note: { fontFamily: fonts.regular, fontSize: 13, color: theme.ink, marginTop: 10 },
  stock: { fontFamily: fonts.medium, fontSize: 12, color: theme.muted, marginTop: 8 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  decline: { paddingHorizontal: 14 },
});
