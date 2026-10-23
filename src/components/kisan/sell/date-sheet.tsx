import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Button, IconButton, Sheet } from "@/components/kisan/ui";
import { Tap } from "@/components/kisan/tap";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Month calendar in a bottom sheet (pure JS; no native date picker in this
 * build). Days before `today` are disabled, except `keepDate` when editing.
 */
export function DateSheet({
  visible,
  value,
  today,
  keepDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  /** YYYY-MM-DD */
  value: string;
  today: string;
  keepDate?: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = (value || today).split("-").map(Number);
    return { y, m: m - 1 };
  });
  const { y, m } = cursor;
  // Monday-first grid.
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  const [ty, tm] = today.split("-").map(Number);
  const canGoBack = y > ty || (y === ty && m > tm - 1);
  const shift = (delta: number) => {
    const n = m + delta;
    setCursor({ y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Available from"
      right={<Button title="Today" small variant="soft" onPress={() => { onSelect(today); onClose(); }} />}
    >
      <View style={styles.body}>
        <View style={styles.monthRow}>
          <IconButton
            Icon={ChevronLeft}
            label="Previous month"
            size={36}
            bg={canGoBack ? theme.sand : theme.bg}
            color={canGoBack ? theme.ink : theme.line}
            onPress={() => canGoBack && shift(-1)}
          />
          <Text style={styles.month}>
            {MONTHS[m]} {y}
          </Text>
          <IconButton Icon={ChevronRight} label="Next month" size={36} bg={theme.sand} onPress={() => shift(1)} />
        </View>
        <View style={styles.week}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((d, di) => {
              if (d === null) return <View key={di} style={styles.cell} />;
              const key = keyOf(y, m, d);
              const disabled = key < today && key !== keepDate;
              const selected = key === value;
              const isToday = key === today;
              return (
                <Tap
                  key={di}
                  disabled={disabled}
                  onPress={() => {
                    onSelect(key);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${d} ${MONTHS[m]} ${y}${disabled ? ", unavailable" : ""}`}
                  accessibilityState={{ selected, disabled }}
                  style={styles.cell}
                >
                  <View
                    style={[
                      styles.day,
                      isToday && styles.today,
                      selected && styles.selected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        disabled && { color: theme.line },
                        isToday && { fontFamily: fonts.bold, color: theme.green },
                        selected && { color: theme.card, fontFamily: fonts.bold },
                      ]}
                    >
                      {d}
                    </Text>
                  </View>
                </Tap>
              );
            })}
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 4 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  month: { fontFamily: fonts.bold, fontSize: 16, color: theme.ink },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontFamily: fonts.semibold, fontSize: 12, color: theme.muted, paddingVertical: 6 },
  cell: { flex: 1, height: 44, alignItems: "center", justifyContent: "center" },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  today: { borderWidth: 1.5, borderColor: theme.green },
  selected: { backgroundColor: theme.green, borderColor: theme.green },
  dayText: { fontFamily: fonts.medium, fontSize: 15, color: theme.ink },
});
