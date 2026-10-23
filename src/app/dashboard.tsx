import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, CircleX, HandCoins, Package, Plus, Receipt, ShoppingBasket, Store } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { notify } from "@/components/kisan/chat/action-sheet";
import { answerOffer, errorText } from "@/components/kisan/chat/chat-api";
import { BudgetChart } from "@/components/kisan/dashboard/budget-chart";
import { WeatherCard } from "@/components/kisan/weather/weather-card";
import { EXPENSE_LABELS } from "@/components/kisan/dashboard/expense-labels";
import { OfferCard } from "@/components/kisan/dashboard/offer-card";
import { Tap } from "@/components/kisan/tap";
import { useConfirm } from "@/components/kisan/use-confirm";
import { Button, CropIcon, ScreenTitle, StateView } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { useResource } from "@/lib/api/resources";
import type { BuyerDashboard, DashboardResponse, FarmerDashboard, OpenOffer, WeatherResponse } from "@/lib/api/types";
import { day, num, rs } from "@/lib/format";

/**
 * Dashboard. Farmers: profit, buyer offers to answer, budget chart, stock,
 * per-crop costs and recent deals. Buyers: open offers and purchases.
 */
export default function Dashboard() {
  const dash = useResource<DashboardResponse>("/dashboard");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const d = dash.data;
  const weather = useResource<WeatherResponse>("/weather");
  const weatherSection = (
    <Section
      title="Weather"
      count={weather.data?.warnings.filter((w) => w.level === "warning").length}
      hint="7-day forecast and farm warnings for your district"
    >
      <WeatherCard data={weather.data} loading={weather.loading} error={weather.error} onRetry={() => void weather.refresh()} />
    </Section>
  );

  const answer = async (o: OpenOffer, action: "accept" | "decline") => {
    setBusyId(o.id);
    try {
      await answerOffer(o.id, action);
    } catch (e) {
      notify("Couldn't update the offer", errorText(e));
    } finally {
      setBusyId(null);
    }
  };
  const accept = (o: OpenOffer, viewer: "farmer" | "buyer") => {
    const terms = `${num(o.quantity)} maund of ${o.listing.crop.name} at ${rs(o.price)}/40kg (total ${rs(o.total)})`;
    const left = o.listing.stock - o.quantity;
    confirm({
      title: "Accept this offer?",
      message:
        viewer === "farmer"
          ? `You sell ${terms} to ${o.other?.name ?? "the buyer"}. ${left > 0 ? `${num(left)} maund stays in stock.` : "The listing will be sold out."}`
          : `You buy ${terms} from ${o.other?.name ?? "the farmer"}.`,
      confirmTitle: "Accept",
      Icon: HandCoins,
      onConfirm: () => answer(o, "accept"),
    });
  };
  const decline = (o: OpenOffer) =>
    confirm({
      title: "Decline this offer?",
      message: `${o.other?.name ?? "They"} will see it in the chat.`,
      confirmTitle: "Decline",
      Icon: CircleX,
      destructive: true,
      onConfirm: () => answer(o, "decline"),
    });

  const offerCards = (offers: OpenOffer[], viewer: "farmer" | "buyer") =>
    offers.map((o) => (
      <OfferCard
        key={o.id}
        offer={o}
        viewer={viewer}
        busy={busyId === o.id}
        onAccept={() => accept(o, viewer)}
        onDecline={() => decline(o)}
      />
    ));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={dash.refreshing} onRefresh={() => void Promise.all([dash.refresh(), weather.refresh()])} tintColor={theme.green} colors={[theme.green]} />
        }
      >
        <ScreenTitle title="My Dashboard" />
        {!d ? (
          <StateView loading={dash.loading} error={dash.error} onRetry={() => void dash.refresh()} />
        ) : d.role === "farmer" ? (
          <FarmerView d={d} offers={offerCards(d.offers, "farmer")} weather={weatherSection} />
        ) : (
          <BuyerView d={d} offers={offerCards(d.offers, "buyer")} weather={weatherSection} />
        )}
      </ScrollView>
      {dialog}
    </SafeAreaView>
  );
}

function FarmerView({ d, offers, weather }: { d: FarmerDashboard; offers: ReactNode[]; weather: ReactNode }) {
  const t = d.totals;
  const loss = t.profit < 0;
  const waiting = d.offers.filter((o) => o.awaitingMe).length;
  const maxCategory = Math.max(1, ...d.categories.map((c) => c.amount));
  return (
    <>
      <View style={[styles.hero, loss && { backgroundColor: theme.red }]}>
        <Text style={styles.heroLabel}>{loss ? "NET LOSS SO FAR" : "NET PROFIT SO FAR"}</Text>
        <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1}>
          {loss ? "−" : ""}
          {rs(Math.abs(t.profit))}
        </Text>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroSmall}>Earned from deals</Text>
            <Text style={styles.heroNum}>{rs(t.earned)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroSmall}>Spent on crops</Text>
            <Text style={styles.heroNum}>{rs(t.spent)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tiles}>
        <Tile Icon={Package} label="In stock" value={`${num(t.stockQty)} maund`} sub={`worth ${rs(t.stockValue)}`} />
        <Tile Icon={HandCoins} label="Deals done" value={String(t.deals)} sub={`${num(t.soldQty)} maund sold`} />
      </View>

      <Section title="Buyer offers" count={waiting} hint={waiting ? `${waiting} waiting for your answer` : undefined}>
        {offers.length ? (
          offers
        ) : (
          <Empty text="No offers right now. When a buyer offers a price for your stock, it shows up here." />
        )}
      </Section>

      {weather}

      <Section
        title="Budget"
        action={<Button title="Add expense" Icon={Plus} small variant="greenSoft" onPress={() => router.push("/expense-form")} />}
      >
        <View style={styles.card}>
          <BudgetChart months={d.months} />
        </View>
        {d.categories.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Where the money went</Text>
            {d.categories.map((c) => {
              const { label, Icon } = EXPENSE_LABELS[c.category];
              return (
                <View key={c.category} style={styles.catRow}>
                  <View style={styles.catIcon}>
                    <Icon size={16} color={theme.green} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.catTop}>
                      <Text style={styles.catLabel}>{label}</Text>
                      <Text style={styles.catAmount}>{rs(c.amount)}</Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${(c.amount / maxCategory) * 100}%` }]} />
                    </View>
                  </View>
                </View>
              );
            })}
            <Tap onPress={() => router.push("/expenses")} accessibilityRole="button" style={styles.link}>
              <Text style={styles.linkText}>See all expenses</Text>
              <ChevronRight size={16} color={theme.green} strokeWidth={2.4} />
            </Tap>
          </View>
        )}
      </Section>

      <Section
        title="My stock"
        action={<Button title="Sell produce" Icon={Plus} small variant="greenSoft" onPress={() => router.push("/sell")} />}
      >
        {d.stock.length ? (
          <View style={styles.card}>
            {d.stock.map((s, i) => (
              <Tap
                key={s.crop.id}
                onPress={() => router.navigate("/listings")}
                accessibilityRole="button"
                accessibilityLabel={`${s.crop.name}: ${num(s.quantity)} maund in stock, worth ${rs(s.value)}. Open my listings`}
                style={[styles.row, i > 0 && styles.rowDivider]}
              >
                <CropIcon icon={s.crop.icon} category={s.crop.category} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{s.crop.name}</Text>
                  <Text style={styles.rowSub}>
                    {s.listings} listing{s.listings === 1 ? "" : "s"} · worth {rs(s.value)}
                  </Text>
                </View>
                <Text style={styles.rowValue}>{num(s.quantity)} md</Text>
              </Tap>
            ))}
          </View>
        ) : (
          <Empty text="Nothing listed. Post your produce so buyers can make offers." />
        )}
      </Section>

      <Section title="Crop costs" hint="What each crop cost you and earned">
        {d.crops.length ? (
          d.crops.map((c) => {
            const loss = c.profit < 0;
            return (
              <View key={c.crop.id} style={styles.card}>
                <Tap
                  onPress={() => router.push({ pathname: "/expenses", params: { cropId: c.crop.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.crop.name}: spent ${rs(c.spent)}, earned ${rs(c.earned)}. Open expenses`}
                  style={styles.cropHead}
                >
                  <CropIcon icon={c.crop.icon} category={c.crop.category} size={40} />
                  <Text style={[styles.rowTitle, { flex: 1 }]}>{c.crop.name}</Text>
                  <Text style={[styles.profit, { color: loss ? theme.red : theme.green }]}>
                    {loss ? "−" : "+"}
                    {rs(Math.abs(c.profit))}
                  </Text>
                </Tap>
                <View style={styles.cropStats}>
                  <Stat label="Spent" value={rs(c.spent)} color={theme.red} />
                  <Stat label="Earned" value={rs(c.earned)} color={theme.green} />
                  <Stat label="Stock" value={`${num(c.stockQty)} md`} />
                </View>
                <Button
                  title={`Add ${c.crop.name} expense`}
                  Icon={Plus}
                  small
                  variant="soft"
                  onPress={() => router.push({ pathname: "/expense-form", params: { cropId: c.crop.id } })}
                  style={{ marginTop: 12 }}
                />
              </View>
            );
          })
        ) : (
          <Empty text="Record seed, fertilizer, labour and other costs for each crop to see your profit." />
        )}
      </Section>

      <Section title="Recent deals">
        {d.sales.length ? (
          <View style={styles.card}>
            {d.sales.map((s, i) => (
              <Tap
                key={s.id}
                onPress={() => router.push({ pathname: "/chat/[id]", params: { id: s.conversationId } })}
                accessibilityRole="button"
                style={[styles.row, i > 0 && styles.rowDivider]}
              >
                <CropIcon icon={s.crop.icon} category={s.crop.category} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {s.crop.name} · {num(s.quantity)} maund
                  </Text>
                  <Text style={styles.rowSub}>
                    {s.other?.name ?? "Buyer"} · {rs(s.price)}/40kg · {day(s.date)}
                  </Text>
                </View>
                <Text style={[styles.rowValue, { color: theme.green }]}>{rs(s.total)}</Text>
              </Tap>
            ))}
          </View>
        ) : (
          <Empty text="Accepted offers appear here." />
        )}
      </Section>
    </>
  );
}

function BuyerView({ d, offers, weather }: { d: BuyerDashboard; offers: ReactNode[]; weather: ReactNode }) {
  const t = d.totals;
  return (
    <>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>TOTAL BOUGHT</Text>
        <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1}>
          {rs(t.spent)}
        </Text>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroSmall}>Produce</Text>
            <Text style={styles.heroNum}>{num(t.boughtQty)} maund</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroSmall}>Deals</Text>
            <Text style={styles.heroNum}>{t.deals}</Text>
          </View>
        </View>
      </View>

      {weather}

      <Section
        title="My offers"
        count={d.offers.filter((o) => o.awaitingMe).length}
        hint={t.openOffers ? `${t.openOffers} open` : undefined}
        action={<Button title="Market" Icon={Store} small variant="greenSoft" onPress={() => router.navigate("/marketplace")} />}
      >
        {offers.length ? (
          offers
        ) : (
          <Empty text="Open a listing in the Market, choose how much you want and make an offer." />
        )}
      </Section>

      <Section title="Purchases">
        {d.purchases.length ? (
          <View style={styles.card}>
            {d.purchases.map((s, i) => (
              <Tap
                key={s.id}
                onPress={() => router.push({ pathname: "/chat/[id]", params: { id: s.conversationId } })}
                accessibilityRole="button"
                style={[styles.row, i > 0 && styles.rowDivider]}
              >
                <CropIcon icon={s.crop.icon} category={s.crop.category} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {s.crop.name} · {num(s.quantity)} maund
                  </Text>
                  <Text style={styles.rowSub}>
                    {s.other?.name ?? "Farmer"} · {rs(s.price)}/40kg · {day(s.date)}
                  </Text>
                </View>
                <Text style={styles.rowValue}>{rs(s.total)}</Text>
              </Tap>
            ))}
          </View>
        ) : (
          <Empty text="Offers a farmer accepts appear here." Icon={ShoppingBasket} />
        )}
      </Section>
    </>
  );
}

function Section({
  title,
  count,
  hint,
  action,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {title}
            </Text>
            {!!count && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{count}</Text>
              </View>
            )}
          </View>
          {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function Tile({ Icon, label, value, sub }: { Icon: typeof Package; label: string; value: string; sub: string }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileIcon}>
        <Icon size={18} color={theme.green} strokeWidth={2.2} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.tileSub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

function Stat({ label, value, color = theme.ink }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Empty({ text, Icon = Receipt }: { text: string; Icon?: typeof Receipt }) {
  return (
    <View style={styles.empty}>
      <Icon size={20} color={theme.muted} strokeWidth={2} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  hero: { backgroundColor: theme.green, borderRadius: 24, padding: 20, marginTop: 8 },
  heroLabel: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.8, color: "rgba(255,255,255,0.85)" },
  heroValue: { fontFamily: fonts.extrabold, fontSize: 36, color: theme.card, marginTop: 6, letterSpacing: -1 },
  heroRow: { flexDirection: "row", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.25)" },
  heroSmall: { fontFamily: fonts.medium, fontSize: 12, color: "rgba(255,255,255,0.8)" },
  heroNum: { fontFamily: fonts.bold, fontSize: 16, color: theme.card, marginTop: 2 },
  tiles: { flexDirection: "row", gap: 10, marginTop: 10 },
  tile: { flex: 1, backgroundColor: theme.card, borderRadius: 20, padding: 14 },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontFamily: fonts.medium, fontSize: 12.5, color: theme.muted, marginTop: 10 },
  tileValue: { fontFamily: fonts.extrabold, fontSize: 20, color: theme.ink, marginTop: 2 },
  tileSub: { fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 2 },
  section: { marginTop: 26 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 18, color: theme.ink },
  sectionHint: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: theme.red, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: theme.card },
  card: { backgroundColor: theme.card, borderRadius: 22, padding: 16, marginBottom: 10 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 15, color: theme.ink, marginBottom: 4 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  catIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.greenSoft, alignItems: "center", justifyContent: "center" },
  catTop: { flexDirection: "row", justifyContent: "space-between" },
  catLabel: { fontFamily: fonts.semibold, fontSize: 13.5, color: theme.ink },
  catAmount: { fontFamily: fonts.bold, fontSize: 13.5, color: theme.ink },
  track: { height: 6, borderRadius: 3, backgroundColor: theme.sand, marginTop: 6, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: theme.green },
  link: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 14, paddingVertical: 4 },
  linkText: { fontFamily: fonts.semibold, fontSize: 13.5, color: theme.green },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line },
  rowTitle: { fontFamily: fonts.bold, fontSize: 14.5, color: theme.ink },
  rowSub: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 2 },
  rowValue: { fontFamily: fonts.bold, fontSize: 14.5, color: theme.ink },
  cropHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  profit: { fontFamily: fonts.extrabold, fontSize: 16 },
  cropStats: { flexDirection: "row", gap: 10, marginTop: 12, backgroundColor: theme.bg, borderRadius: 14, padding: 10 },
  statLabel: { fontFamily: fonts.regular, fontSize: 11.5, color: theme.muted },
  statValue: { fontFamily: fonts.bold, fontSize: 14, marginTop: 2 },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.2,
    borderStyle: "dashed",
    borderColor: "#D8CFBF",
    borderRadius: 16,
    padding: 14,
  },
  emptyText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: theme.muted },
});
