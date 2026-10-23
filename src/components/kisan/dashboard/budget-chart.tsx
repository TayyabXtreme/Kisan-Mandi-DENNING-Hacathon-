import { StyleSheet, Text, View } from "react-native";
import { format, parseISO } from "date-fns";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { num } from "@/lib/format";

type Month = { month: string; spent: number; earned: number };

const HEIGHT = 130;

/** "120000" → "1.2L", "45000" → "45k" (Pakistani lakh for big sums). */
function short(n: number) {
  if (n >= 100000) return `${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return num(n);
}

/**
 * Spent (red) vs earned (green) per month, side by side. Plain Views so it
 * follows the app theme and needs no layout measuring.
 */
export function BudgetChart({ months }: { months: Month[] }) {
  const max = Math.max(1, ...months.map((m) => Math.max(m.spent, m.earned)));
  const empty = months.every((m) => m.spent === 0 && m.earned === 0);
  return (
    <View>
      <View style={styles.legend}>
        <Dot color={theme.red} label="Spent" />
        <Dot color={theme.green} label="Earned" />
      </View>
      <View
        style={styles.plot}
        accessible
        accessibilityLabel={months
          .map((m) => `${format(parseISO(`${m.month}-01`), "MMMM")}: spent ${num(m.spent)}, earned ${num(m.earned)} rupees`)
          .join(". ")}
      >
        {[0.5, 1].map((f) => (
          <View key={f} style={[styles.grid, { bottom: HEIGHT * f }]}>
            <Text style={styles.gridLabel}>{short(max * f)}</Text>
          </View>
        ))}
        {months.map((m) => (
          <View key={m.month} style={styles.group}>
            <View style={styles.bars}>
              <View style={[styles.bar, { height: Math.max(m.spent ? 3 : 0, (m.spent / max) * HEIGHT), backgroundColor: theme.red }]} />
              <View style={[styles.bar, { height: Math.max(m.earned ? 3 : 0, (m.earned / max) * HEIGHT), backgroundColor: theme.green }]} />
            </View>
            <Text style={styles.month}>{format(parseISO(`${m.month}-01`), "MMM")}</Text>
          </View>
        ))}
      </View>
      {empty && <Text style={styles.empty}>Add your expenses and close deals to see your budget here.</Text>}
    </View>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.dotRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.dotLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", gap: 16, marginBottom: 12 },
  dotRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  dotLabel: { fontFamily: fonts.medium, fontSize: 12.5, color: theme.muted },
  plot: {
    height: HEIGHT + 22,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: 34,
  },
  grid: {
    position: "absolute",
    left: 0,
    right: 0,
    marginBottom: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.line,
  },
  gridLabel: { position: "absolute", left: 0, top: -7, fontFamily: fonts.regular, fontSize: 10, color: theme.muted },
  group: { flex: 1, alignItems: "center" },
  bars: { height: HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  bar: { width: 11, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  month: { marginTop: 6, height: 16, fontFamily: fonts.medium, fontSize: 11, color: theme.muted },
  empty: { marginTop: 10, fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, textAlign: "center" },
});
