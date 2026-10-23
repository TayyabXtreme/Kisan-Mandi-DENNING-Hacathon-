import { useState } from "react";
import {
  Alert as RNAlert,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Check, MessageCircle, MessagesSquare, Pencil, Phone, Share2, Trash2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorText, openChatFor } from "@/components/kisan/chat/chat-api";
import { HillsScene } from "@/components/kisan/hills-scene";
import {
  BackButton,
  Button,
  CropName,
  GradeBadge,
  IconButton,
  MarketLabelBadge,
  StateView,
  Tag,
} from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate, useResource } from "@/lib/api/resources";
import type { ListingDetail } from "@/lib/api/types";
import { day, initials, num, phoneDisplay, rs, todayPK } from "@/lib/format";
import { AT_MARKET_BAND } from "../../../convex/lib/kisan";

const HERO = 290;
/** The position bar spans ±20% around the average. */
const BAR_RANGE = 0.2;

/** 09 · Listing detail with Call / WhatsApp (or owner actions). */
export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listing = useResource<ListingDetail>(id ? `/listings/${id}` : null);
  const [busy, setBusy] = useState<"sold" | "delete" | "chat" | null>(null);
  const [today] = useState(() => todayPK(Date.now()));

  const l = listing.data;

  if (!l) {
    const gone = listing.error?.status === 404 || listing.error?.code === "BAD_REQUEST";
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingHorizontal: 20 }]}>
        <BackButton fallback="/marketplace" />
        <StateView
          loading={listing.loading}
          error={gone ? undefined : listing.error}
          empty={gone ? "This listing is no longer available." : undefined}
          onRetry={() => void listing.refresh()}
        />
      </View>
    );
  }

  const share = () =>
    void Share.share({
      message: `${l.crop.name} · Grade ${l.grade} · ${num(l.quantity)} maund at ${rs(l.askingPrice)}/40kg in ${l.district}. ${
        l.availableFrom <= today ? "Available now" : `Available from ${day(l.availableFrom)}`
      } — KisanMandi`,
    });

  const digits = l.contactPhone.replace(/\D/g, "");
  const call = () => void Linking.openURL(`tel:${l.contactPhone}`);
  const whatsapp = () =>
    void Linking.openURL(
      `https://wa.me/${digits}?text=${encodeURIComponent(
        `Salam, I saw your ${l.crop.name} listing on KisanMandi (${num(l.quantity)} maund, Grade ${l.grade}, ${rs(l.askingPrice)}/40kg). Is it still available?`,
      )}`,
    );

  const fail = (e: unknown) =>
    RNAlert.alert("Something went wrong", e instanceof ApiError ? e.message : "Please try again.");

  // In-app chat with the farmer (find or create, one chat per buyer per listing).
  const chat = async () => {
    setBusy("chat");
    try {
      const chatId = await openChatFor(l.id);
      router.push({ pathname: "/chat/[id]", params: { id: chatId } });
    } catch (e) {
      RNAlert.alert("Couldn't open chat", errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const markSold = () =>
    RNAlert.alert("Mark as sold?", "Buyers will no longer see this listing.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark sold",
        onPress: async () => {
          setBusy("sold");
          try {
            await api.patch(`/listings/${l.id}`, { status: "sold" });
            await invalidate("/listings");
          } catch (e) {
            fail(e);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const remove = () =>
    RNAlert.alert("Delete listing?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy("delete");
          try {
            await api.del(`/listings/${l.id}`);
            void invalidate("/listings");
            if (router.canGoBack()) router.back();
            else router.replace("/listings");
          } catch (e) {
            fail(e);
            setBusy(null);
          }
        },
      },
    ]);

  const m = l.market;
  // Asking price position on the bar (0 = −20%, 1 = +20%).
  const pos = m
    ? Math.min(1, Math.max(0, ((l.askingPrice - m.average) / m.average + BAR_RANGE) / (2 * BAR_RANGE)))
    : 0.5;
  const bandStart = 0.5 - AT_MARKET_BAND / (2 * BAR_RANGE);
  const bandWidth = AT_MARKET_BAND / BAR_RANGE;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} bounces={false}>
        <View style={{ height: HERO }}>
          <HillsScene width={width} height={HERO + 40} compact />
          <View style={[styles.heroButtons, { top: insets.top + 8 }]}>
            <BackButton fallback="/marketplace" />
            <IconButton Icon={Share2} label="Share listing" onPress={share} />
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.tags}>
            <GradeBadge grade={l.grade} />
            <Tag label={l.status === "sold" ? "Sold" : "Active"} />
          </View>
          <CropName name={l.crop.name} local={l.crop.nameUr} size={30} style={styles.name} />

          <View style={styles.priceCard}>
            <View style={styles.priceTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.caption}>Asking price</Text>
                <Text style={styles.bigPrice}>
                  {rs(l.askingPrice)}
                  <Text style={styles.perUnit}> / 40 kg</Text>
                </Text>
              </View>
              {m && <MarketLabelBadge label={m.label} onCard style={styles.labelBadge} />}
            </View>

            {m && (
              <>
                <View style={styles.bar} accessibilityElementsHidden>
                  <View style={[styles.band, { left: `${bandStart * 100}%`, width: `${bandWidth * 100}%` }]} />
                  <View style={styles.avgTick} />
                  <View style={[styles.dot, { left: `${pos * 100}%` }]} />
                </View>
                <View style={styles.barLabels}>
                  <Text style={styles.barLabel}>Below</Text>
                  <Text style={styles.barLabel}>Avg {num(m.average)}</Text>
                  <Text style={styles.barLabel}>Above</Text>
                </View>
                <Text style={styles.explain}>
                  {m.diff === 0
                    ? `Exactly the average of ${m.markets} market${m.markets === 1 ? "" : "s"} today.`
                    : `Rs ${num(Math.abs(m.diff))} (${Math.abs(m.diffPct).toFixed(1)}%) ${m.diff < 0 ? "under" : "over"} the average of ${m.markets} market${m.markets === 1 ? "" : "s"} today.`}{" "}
                  Within ±5% counts as at market.
                </Text>
              </>
            )}
          </View>

          <View style={styles.info}>
            <Info label="Quantity" value={`${num(l.quantity)} maund`} />
            <View style={styles.infoDivider} />
            <Info label="District" value={l.district} />
            <View style={styles.infoDivider} />
            <Info label="Available" value={l.availableFrom <= today ? "Now" : day(l.availableFrom)} />
          </View>

          {l.seller && (
            <View style={styles.seller}>
              <View style={styles.sellerAvatar}>
                <Text style={styles.sellerInitials}>{initials(l.seller.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sellerName}>{l.seller.name}</Text>
                <Text style={styles.sellerMeta}>
                  {l.seller.role === "buyer" ? "Buyer" : "Farmer"} · {phoneDisplay(l.contactPhone)}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {l.isOwner ? (
          <>
            {l.status === "active" && (
              <>
                <Button
                  title="Edit"
                  Icon={Pencil}
                  variant="soft"
                  style={styles.flex}
                  onPress={() => router.push({ pathname: "/sell", params: { id: l.id } })}
                />
                <Button
                  title="Mark sold"
                  Icon={Check}
                  variant="greenSoft"
                  style={styles.flex}
                  loading={busy === "sold"}
                  disabled={!!busy}
                  onPress={markSold}
                />
              </>
            )}
            <IconButton
              Icon={Trash2}
              label="Delete listing"
              size={56}
              bg={theme.redSoft}
              color={theme.red}
              onPress={busy ? () => {} : remove}
            />
          </>
        ) : (
          <>
            <Button
              title="Chat"
              Icon={MessagesSquare}
              variant="green"
              style={styles.flex}
              loading={busy === "chat"}
              disabled={l.status !== "active"}
              onPress={() => void chat()}
              accessibilityLabel={`Chat with ${l.seller?.name ?? "the farmer"} in the app`}
            />
            <IconButton Icon={Phone} label="Call" size={56} bg={theme.ink} color={theme.card} onPress={call} />
            <IconButton Icon={MessageCircle} label="WhatsApp" size={56} bg={theme.greenSoft} color={theme.green} onPress={whatsapp} />
          </>
        )}
      </View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.card },
  flex: { flex: 1 },
  heroButtons: { position: "absolute", left: 20, right: 20, flexDirection: "row", justifyContent: "space-between" },
  body: {
    marginTop: -32,
    backgroundColor: theme.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 26,
  },
  tags: { flexDirection: "row", gap: 8 },
  name: { marginTop: 10 },
  priceCard: { marginTop: 16, backgroundColor: "#F3EEE4", borderRadius: 22, padding: 16 },
  priceTop: { flexDirection: "row", alignItems: "center" },
  caption: { fontFamily: fonts.regular, fontSize: 13, color: theme.muted },
  bigPrice: { fontFamily: fonts.extrabold, fontSize: 30, color: theme.ink, marginTop: 4, letterSpacing: -0.5 },
  perUnit: { fontFamily: fonts.regular, fontSize: 15, color: theme.muted, letterSpacing: 0 },
  labelBadge: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "center" },
  bar: { marginTop: 22, height: 8, borderRadius: 4, backgroundColor: theme.line },
  band: { position: "absolute", top: 0, bottom: 0, backgroundColor: "#C6DDB9", borderRadius: 4 },
  avgTick: { position: "absolute", left: "50%", top: -5, width: 2, height: 18, marginLeft: -1, backgroundColor: theme.ink },
  dot: {
    position: "absolute",
    top: -4,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: theme.green,
    borderWidth: 2,
    borderColor: "#F3EEE4",
  },
  barLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  barLabel: { fontFamily: fonts.regular, fontSize: 11.5, color: theme.muted },
  explain: { marginTop: 12, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: theme.muted },
  info: {
    marginTop: 14,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 18,
    paddingVertical: 12,
  },
  infoCell: { flex: 1, paddingHorizontal: 14 },
  infoDivider: { width: 1, backgroundColor: theme.line },
  infoLabel: { fontFamily: fonts.regular, fontSize: 12, color: theme.muted },
  infoValue: { fontFamily: fonts.bold, fontSize: 15.5, color: theme.ink, marginTop: 4 },
  seller: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  sellerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sellerInitials: { fontFamily: fonts.bold, fontSize: 15, color: theme.green },
  sellerName: { fontFamily: fonts.bold, fontSize: 16, color: theme.ink },
  sellerMeta: { fontFamily: fonts.regular, fontSize: 13, color: theme.muted, marginTop: 2 },
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
