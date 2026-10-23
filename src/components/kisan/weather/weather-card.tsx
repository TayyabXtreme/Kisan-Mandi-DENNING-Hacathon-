import { createElement } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { format, parseISO } from "date-fns";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Moon,
  ShieldCheck,
  Sun,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from "lucide-react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import type { WeatherResponse, WeatherWarning } from "@/lib/api/types";
import type { WeatherKind } from "../../../../convex/lib/weather";
import { Tap } from "../tap";
import { StateView } from "../ui";

const ICONS: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

function iconFor(kind: WeatherKind, isDay: boolean): LucideIcon {
  if (!isDay && kind === "clear") return Moon;
  if (!isDay && kind === "partly") return CloudMoon;
  return ICONS[kind];
}

/** Lucide icon for a weather kind (moon variants at night). */
export function WeatherIcon({ kind, isDay = true, size, strokeWidth = 1.9 }: { kind: WeatherKind; isDay?: boolean; size: number; strokeWidth?: number }) {
  return createElement(iconFor(kind, isDay), { size, color: theme.ink, strokeWidth });
}

/** "Today", "Tomorrow", else "Sat". */
function dayName(date: string, today: string) {
  if (date === today) return "Today";
  const d = parseISO(date);
  const t = parseISO(today);
  if (d.getTime() - t.getTime() === 86_400_000) return "Tomorrow";
  return format(d, "EEE");
}

/** "Today", "Sat & Sun", "Fri, Sat & Mon" */
export function warningDays(dates: string[], today: string) {
  const names = dates.map((d) => dayName(d, today));
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

/** Red (warning) or mustard (watch) box with the advice. */
export function WarningBox({ w, today }: { w: WeatherWarning; today: string }) {
  const warn = w.level === "warning";
  return (
    <View style={[styles.warning, { backgroundColor: warn ? theme.redSoft : theme.mustardSoft }]} accessibilityRole="alert">
      <TriangleAlert size={20} color={warn ? theme.red : "#7A5A12"} strokeWidth={2.2} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.warningTitle, { color: warn ? theme.red : "#7A5A12" }]}>
          {w.title} · {warningDays(w.dates, today)}
        </Text>
        <Text style={styles.warningText}>{w.advice}</Text>
      </View>
    </View>
  );
}

/** Now, farm warnings and a 7-day strip for the user's district (Open-Meteo). */
export function WeatherCard({
  data,
  loading,
  error,
  onRetry,
}: {
  data?: WeatherResponse;
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
}) {
  if (!data)
    return (
      <View style={styles.card}>
        <StateView loading={loading} error={error} onRetry={onRetry} empty="Weather isn't available right now." />
      </View>
    );
  const c = data.current;
  const today = data.days[0]?.date ?? c.time.slice(0, 10);
  return (
    <View style={styles.card}>
      <View style={styles.now}>
        <View style={styles.nowIcon}>
          <WeatherIcon kind={c.kind} isDay={c.isDay} size={34} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.placeRow}>
            <MapPin size={13} color={theme.muted} strokeWidth={2} />
            <Text style={styles.place} numberOfLines={1}>
              {data.place.name}
              {data.place.province ? `, ${data.place.province}` : ""}
            </Text>
          </View>
          <Text style={styles.temp} accessibilityLabel={`${c.temp} degrees, ${c.label}`}>
            {c.temp}°<Text style={styles.label}> {c.label}</Text>
          </Text>
          <View style={styles.metaRow}>
            <Droplets size={13} color={theme.muted} strokeWidth={2} />
            <Text style={styles.meta}>{c.humidity}%</Text>
            <Wind size={13} color={theme.muted} strokeWidth={2} style={{ marginLeft: 8 }} />
            <Text style={styles.meta}>{c.wind} km/h</Text>
          </View>
        </View>
      </View>

      <View style={{ gap: 8, marginTop: 14 }}>
        {data.warnings.length ? (
          data.warnings.map((w) => <WarningBox key={w.kind} w={w} today={today} />)
        ) : (
          <View style={styles.calm}>
            <ShieldCheck size={16} color={theme.green} strokeWidth={2.2} />
            <Text style={styles.calmText}>No weather warnings for the next 7 days</Text>
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days} style={{ marginTop: 14 }}>
        {data.days.map((d) => {
          return (
            <View
              key={d.date}
              style={[styles.day, d.date === today && styles.dayToday]}
              accessible
              accessibilityLabel={`${dayName(d.date, today)}: ${d.label}, high ${d.max}, low ${d.min} degrees${d.rainChance ? `, ${d.rainChance}% chance of rain` : ""}`}
            >
              <Text style={styles.dayName}>{dayName(d.date, today)}</Text>
              <WeatherIcon kind={d.kind} size={22} />
              <Text style={styles.dayMax}>{d.max}°</Text>
              <Text style={styles.dayMin}>{d.min}°</Text>
              <Text style={[styles.dayRain, !d.rainChance && { opacity: 0 }]}>{d.rainChance}%</Text>
            </View>
          );
        })}
      </ScrollView>

      <Tap onPress={() => void Linking.openURL("https://open-meteo.com/")} accessibilityRole="link" style={{ marginTop: 10 }}>
        <Text style={styles.credit}>Weather data by Open-Meteo.com · warnings are from the forecast, not PMD</Text>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.card, borderRadius: 22, padding: 16 },
  now: { flexDirection: "row", alignItems: "center", gap: 14 },
  nowIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: theme.sky, alignItems: "center", justifyContent: "center" },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  place: { fontFamily: fonts.medium, fontSize: 12.5, color: theme.muted, flexShrink: 1 },
  temp: { fontFamily: fonts.extrabold, fontSize: 30, color: theme.ink, letterSpacing: -0.5 },
  label: { fontFamily: fonts.semibold, fontSize: 15, color: theme.ink, letterSpacing: 0 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted },
  warning: { flexDirection: "row", gap: 10, borderRadius: 16, padding: 12 },
  warningTitle: { fontFamily: fonts.bold, fontSize: 14 },
  warningText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: theme.ink, marginTop: 2 },
  calm: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.greenSoft, borderRadius: 14, padding: 10 },
  calmText: { fontFamily: fonts.semibold, fontSize: 13, color: theme.green },
  days: { gap: 8 },
  day: { width: 62, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 16, backgroundColor: theme.bg },
  dayToday: { backgroundColor: theme.sky },
  dayName: { fontFamily: fonts.semibold, fontSize: 11.5, color: theme.muted },
  dayMax: { fontFamily: fonts.bold, fontSize: 14, color: theme.ink },
  dayMin: { fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: -4 },
  dayRain: { fontFamily: fonts.semibold, fontSize: 11, color: "#3A7CA5" },
  credit: { fontFamily: fonts.regular, fontSize: 11, color: theme.muted, textAlign: "center" },
});
