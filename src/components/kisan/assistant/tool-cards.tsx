// Cards for Kisan Dost tool results (shapes from the tools in convex/assistant.ts).
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, Polyline } from "react-native-svg";
import { Bell, BellOff, Check, ChevronRight, Star } from "lucide-react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { day, num, signedRs } from "@/lib/format";
import type { Category } from "../../../../convex/lib/kisan";
import { Tap } from "../tap";
import { Button, CropIcon, PriceChangePill, Tag } from "../ui";

// ---- output shapes ----

type PricesOut = {
  kind: "prices";
  market: string;
  asOf: string | null;
  items: {
    crop: string;
    cropUr: string;
    icon: string;
    category: Category;
    price: number;
    date: string;
    change: number;
    changePct: number;
  }[];
};
type TrendOut = {
  kind: "trend";
  crop: string;
  cropUr: string;
  market: string;
  latest: { price: number; date: string; change: number; changePct: number };
  stats: { min: { price: number; date: string }; max: { price: number; date: string }; avg: number; days: number } | null;
  points: { date: string; price: number }[];
};
type CompareOut = {
  kind: "compare";
  crop: string;
  cropUr: string;
  markets: { market: string; district: string; price: number; date: string; best: boolean; yours: boolean; diffVsYours: number | null }[];
};
type ListingsOut = {
  kind: "listings";
  total: number;
  items: {
    id: string;
    crop: string;
    icon: string;
    category: Category;
    quantityMaund: number;
    askingPrice: number;
    grade: string;
    district: string;
    seller: string | null;
    vsMarket: "below" | "at" | "above" | null;
  }[];
};
type AlertsOut = {
  kind: "alerts";
  alerts: { crop: string; market: string; condition: "above" | "below"; targetPrice: number; latest: number | null; status: "paused" | "triggered" | "waiting"; toGo: number | null }[];
};
type ProfitOut = {
  kind: "profit";
  crop: string;
  market: string;
  priceDate: string;
  marketPrice: number;
  quantity: number;
  adjPrice: number;
  revenue: number;
  totalCost: number;
  profit: number;
  margin: number;
};
type AlertCreatedOut =
  | { ok: true; kind: "alertCreated"; crop: string; market: string; condition: "above" | "below"; targetPrice: number }
  | { ok: false; error: string };

export type AlertInput = { crop: string; market?: string; condition: "above" | "below"; targetPrice: number };

/** A tool part as stored by @convex-dev/agent (AI SDK UI message part). */
export type ToolPart = {
  type: string;
  state: string;
  input?: unknown;
  output?: unknown;
  approval?: { id: string; approved?: boolean };
};

const LOADING_LABELS: Record<string, string> = {
  getTodayPrices: "Checking today's prices…",
  getPriceTrend: "Reading the 14-day trend…",
  compareMarkets: "Comparing mandis…",
  searchListings: "Searching the marketplace…",
  getMyAlerts: "Checking your alerts…",
  estimateProfit: "Working out profit…",
  createAlert: "Preparing the alert…",
};

export function ToolCard({
  part,
  onRespond,
  busy,
}: {
  part: ToolPart;
  onRespond: (approvalId: string, approved: boolean) => void;
  /** Confirm/Cancel request in flight for this card. */
  busy?: boolean;
}) {
  const name = part.type.replace(/^tool-/, "");
  if (name === "createAlert") return <AlertProposal part={part} onRespond={onRespond} busy={busy} />;
  if (part.state === "input-streaming" || part.state === "input-available")
    return <Working label={LOADING_LABELS[name] ?? "Working…"} />;
  if (part.state !== "output-available") return null;
  const out = part.output as { kind?: string; error?: string } | undefined;
  if (!out || out.error) return null; // the reply explains errors
  switch (out.kind) {
    case "prices":
      return <PricesCard data={out as PricesOut} />;
    case "trend":
      return <TrendCard data={out as TrendOut} />;
    case "compare":
      return <CompareCard data={out as CompareOut} />;
    case "listings":
      return <ListingsCard data={out as ListingsOut} />;
    case "alerts":
      return <AlertsCard data={out as AlertsOut} />;
    case "profit":
      return <ProfitCard data={out as ProfitOut} />;
    default:
      return null;
  }
}

function Working({ label }: { label: string }) {
  return (
    <View style={styles.working}>
      <ActivityIndicator size="small" color={theme.green} />
      <Text style={styles.workingText}>{label}</Text>
    </View>
  );
}

function CardHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {title}
      </Text>
      {!!sub && <Text style={styles.cardSub}>{sub}</Text>}
    </View>
  );
}

function PricesCard({ data }: { data: PricesOut }) {
  return (
    <View style={styles.card}>
      <CardHead
        title={data.market}
        sub={`${data.asOf ? day(data.asOf) : "Latest"} · Rs per 40 kg`}
      />
      {data.items.slice(0, 8).map((row) => (
        <View key={row.crop} style={styles.row}>
          <CropIcon icon={row.icon} category={row.category} size={30} />
          <Text style={styles.rowName} numberOfLines={1}>
            {row.crop} <Text style={styles.rowLocal}>{row.cropUr}</Text>
          </Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.rowPrice}>Rs {num(row.price)}</Text>
            <PriceChangePill change={row.change} changePct={row.changePct} style={{ marginTop: 2 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Mini 14-day line. */
export function Sparkline({
  points,
  width,
  height = 56,
}: {
  points: { price: number }[];
  width: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const pad = 4;
  const xy = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * (width - pad * 2),
    y: pad + (1 - (p - min) / span) * (height - pad * 2),
  }));
  const end = xy[xy.length - 1];
  const up = prices[prices.length - 1] >= prices[0];
  const color = up ? theme.green : theme.red;
  return (
    <Svg width={width} height={height} accessibilityLabel={`Price ${up ? "rose" : "fell"} over ${points.length} days`}>
      <Polyline
        points={xy.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={end.x} cy={end.y} r={4} fill={color} />
    </Svg>
  );
}

function TrendCard({ data }: { data: TrendOut }) {
  return (
    <View style={styles.card}>
      <CardHead title={`${data.crop} · ${data.market}`} sub={`Last ${data.points.length} days · Rs per 40 kg`} />
      <View style={styles.trendTop}>
        <Text style={styles.big}>Rs {num(data.latest.price)}</Text>
        <PriceChangePill change={data.latest.change} changePct={data.latest.changePct} suffix={day(data.latest.date)} />
      </View>
      <View style={{ marginVertical: 8 }}>
        <Sparkline points={data.points} width={236} />
      </View>
      {data.stats && (
        <View style={styles.statsRow}>
          <Stat label="MIN" value={num(data.stats.min.price)} color={theme.red} />
          <Stat label="MAX" value={num(data.stats.max.price)} color={theme.green} />
          <Stat label="AVG" value={num(data.stats.avg)} color={theme.muted} />
        </View>
      )}
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function CompareCard({ data }: { data: CompareOut }) {
  return (
    <View style={styles.card}>
      <CardHead title={`${data.crop}: best price first`} sub="Rs per 40 kg" />
      {data.markets.map((m, i) => (
        <View key={m.market} style={[styles.row, m.best && styles.bestRow]}>
          <Text style={[styles.rank, m.best && { color: theme.card }]}>{i + 1}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {m.best && <Star size={12} color={theme.mustard} fill={theme.mustard} />}
              <Text style={[styles.rowName, m.best && { color: theme.card }]} numberOfLines={1}>
                {m.market}
              </Text>
            </View>
            <Text style={[styles.rowSub, m.best && { color: theme.greenSoft }]} numberOfLines={1}>
              {m.yours ? "Your mandi" : m.diffVsYours !== null ? `${signedRs(m.diffVsYours)} vs yours` : m.district}
              {" · "}
              {day(m.date)}
            </Text>
          </View>
          <Text style={[styles.rowPrice, m.best && { color: theme.card }]}>Rs {num(m.price)}</Text>
        </View>
      ))}
    </View>
  );
}

const VS_MARKET = {
  below: { label: "Below market", bg: theme.greenSoft, fg: theme.green },
  at: { label: "At market", bg: theme.sand, fg: theme.muted },
  above: { label: "Above market", bg: theme.redSoft, fg: theme.red },
} as const;

function ListingsCard({ data }: { data: ListingsOut }) {
  if (data.items.length === 0)
    return (
      <View style={styles.card}>
        <Text style={styles.cardSub}>No matching listings right now.</Text>
      </View>
    );
  return (
    <View style={styles.card}>
      <CardHead title="Marketplace" sub={`${data.total} listing${data.total === 1 ? "" : "s"} · Rs per 40 kg`} />
      {data.items.map((l) => (
        <Tap
          key={l.id}
          onPress={() => router.push({ pathname: "/listing/[id]", params: { id: l.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${l.crop}, ${num(l.quantityMaund)} maund at Rs ${num(l.askingPrice)}, ${l.district}. Open listing`}
          style={styles.row}
        >
          <CropIcon icon={l.icon} category={l.category} size={30} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowName} numberOfLines={1}>
              {l.crop} · {num(l.quantityMaund)} maund
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              Grade {l.grade} · {l.district}
              {l.seller ? ` · ${l.seller}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            <Text style={styles.rowPrice}>Rs {num(l.askingPrice)}</Text>
            {l.vsMarket && (
              <Tag label={VS_MARKET[l.vsMarket].label} bg={VS_MARKET[l.vsMarket].bg} color={VS_MARKET[l.vsMarket].fg} />
            )}
          </View>
          <ChevronRight size={16} color={theme.muted} />
        </Tap>
      ))}
    </View>
  );
}

function AlertsCard({ data }: { data: AlertsOut }) {
  if (data.alerts.length === 0)
    return (
      <View style={styles.card}>
        <Text style={styles.cardSub}>You have no price alerts yet.</Text>
      </View>
    );
  return (
    <View style={styles.card}>
      <CardHead title="Your alerts" sub="Rs per 40 kg" />
      {data.alerts.slice(0, 6).map((a, i) => (
        <View key={`${a.crop}${a.market}${i}`} style={styles.row}>
          {a.status === "paused" ? (
            <BellOff size={18} color={theme.muted} />
          ) : (
            <Bell size={18} color={a.status === "triggered" ? theme.green : theme.ink} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowName} numberOfLines={1}>
              {a.crop} {a.condition} Rs {num(a.targetPrice)}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {a.market}
              {a.latest !== null ? ` · now Rs ${num(a.latest)}` : ""}
            </Text>
          </View>
          <Tag
            label={a.status === "triggered" ? "Triggered" : a.status === "paused" ? "Paused" : `Rs ${num(a.toGo ?? 0)} to go`}
            bg={a.status === "triggered" ? theme.greenSoft : theme.sand}
            color={a.status === "triggered" ? theme.green : theme.muted}
          />
        </View>
      ))}
    </View>
  );
}

function ProfitCard({ data }: { data: ProfitOut }) {
  const gain = data.profit >= 0;
  return (
    <View style={styles.card}>
      <CardHead
        title={`${data.crop} · ${num(data.quantity)} maund`}
        sub={`${data.market} · Rs ${num(data.adjPrice)}/40 kg (${day(data.priceDate)})`}
      />
      <Line label="Revenue" value={`Rs ${num(data.revenue)}`} />
      <Line label="Total cost" value={`Rs ${num(data.totalCost)}`} />
      <View style={styles.divider} />
      <Line
        label={gain ? "Profit" : "Loss"}
        value={`${gain ? "" : "−"}Rs ${num(Math.abs(data.profit))} · ${data.margin.toFixed(1)}%`}
        color={gain ? theme.green : theme.red}
        bold
      />
    </View>
  );
}

function Line({ label, value, color = theme.ink, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, { color }, bold && { fontFamily: fonts.extrabold }]}>{value}</Text>
    </View>
  );
}

/** "Set alert?" card: Confirm runs the write, Cancel tells the model no. */
function AlertProposal({
  part,
  onRespond,
  busy,
}: {
  part: ToolPart;
  onRespond: (approvalId: string, approved: boolean) => void;
  busy?: boolean;
}) {
  const input = part.input as AlertInput | undefined;
  if (!input || part.state === "input-streaming") return <Working label={LOADING_LABELS.createAlert} />;
  const rule = `${input.crop} ${input.condition} Rs ${num(input.targetPrice)}`;
  const where = input.market ? input.market : "Your mandi";
  const out = part.output as AlertCreatedOut | undefined;

  let footer;
  if (part.state === "approval-requested" && part.approval) {
    const id = part.approval.id;
    footer = (
      <View style={styles.actions}>
        <Button title="Cancel" small variant="soft" disabled={busy} onPress={() => onRespond(id, false)} style={{ flex: 1 }} />
        <Button title="Confirm" small variant="green" Icon={Check} loading={busy} onPress={() => onRespond(id, true)} style={{ flex: 1.3 }} />
      </View>
    );
  } else if (part.state === "output-denied" || part.approval?.approved === false) {
    footer = <Text style={styles.cardSub}>Cancelled. No alert was set.</Text>;
  } else if (part.state === "output-available" && out) {
    footer = out.ok ? (
      <View style={[styles.actions, { alignItems: "center" }]}>
        <View style={styles.okBadge}>
          <Check size={14} color={theme.green} strokeWidth={3} />
          <Text style={styles.okText}>Alert set</Text>
        </View>
        <Tap onPress={() => router.push("/alerts")} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.link}>View alerts</Text>
        </Tap>
      </View>
    ) : (
      <Text style={[styles.cardSub, { color: theme.red }]}>{out.error}</Text>
    );
  } else if (part.state === "output-error") {
    footer = <Text style={[styles.cardSub, { color: theme.red }]}>Couldn&apos;t save the alert.</Text>;
  } else {
    footer = <Working label="Saving…" />;
  }

  return (
    <View style={[styles.card, styles.proposal]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Bell size={16} color={theme.green} strokeWidth={2.4} />
        <Text style={styles.cardTitle}>Set price alert?</Text>
      </View>
      <Text style={styles.proposalRule}>{rule}</Text>
      <Text style={styles.cardSub}>{where} · Rs per 40 kg</Text>
      <View style={{ marginTop: 10 }}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 14,
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.line,
    width: 280,
    maxWidth: "100%",
  },
  proposal: { borderColor: theme.green, borderWidth: 1.5 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 15, color: theme.ink },
  cardSub: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 12 },
  bestRow: { backgroundColor: theme.green, paddingHorizontal: 8 },
  rank: { width: 16, fontFamily: fonts.bold, fontSize: 14, color: theme.muted, textAlign: "center" },
  rowName: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: theme.ink },
  rowLocal: { fontFamily: undefined, fontSize: 13, color: theme.muted },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 1 },
  rowPrice: { fontFamily: fonts.bold, fontSize: 14, color: theme.ink },
  trendTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  big: { fontFamily: fonts.extrabold, fontSize: 22, color: theme.ink },
  statsRow: { flexDirection: "row", gap: 8 },
  statLabel: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.5 },
  statValue: { fontFamily: fonts.bold, fontSize: 14, color: theme.ink, marginTop: 2 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  lineLabel: { fontFamily: fonts.regular, fontSize: 13.5, color: theme.muted },
  lineValue: { fontFamily: fonts.bold, fontSize: 14 },
  divider: { height: 1, backgroundColor: theme.line, marginVertical: 4 },
  proposalRule: { fontFamily: fonts.extrabold, fontSize: 17, color: theme.ink },
  actions: { flexDirection: "row", gap: 10, justifyContent: "space-between" },
  okBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.greenSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  okText: { fontFamily: fonts.bold, fontSize: 13, color: theme.green },
  link: { fontFamily: fonts.semibold, fontSize: 13.5, color: theme.green },
  working: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  workingText: { fontFamily: fonts.medium, fontSize: 13, color: theme.muted },
});
