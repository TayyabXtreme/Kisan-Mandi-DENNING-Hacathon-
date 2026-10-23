// Weather rules shared by the backend and tests: WMO weather codes → labels,
// and farm warnings derived from an Open-Meteo daily forecast. No Convex
// imports here. Open-Meteo has no official alerts for Pakistan, so these are
// thresholds on the forecast, not PMD bulletins.

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** WMO code (Open-Meteo `weather_code`) → short label and icon kind. */
export function describeWeather(code: number): { label: string; kind: WeatherKind } {
  if (code === 0) return { label: "Clear sky", kind: "clear" };
  if (code === 1) return { label: "Mostly clear", kind: "partly" };
  if (code === 2) return { label: "Partly cloudy", kind: "partly" };
  if (code === 3) return { label: "Cloudy", kind: "cloudy" };
  if (code === 45 || code === 48) return { label: "Fog", kind: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", kind: "drizzle" };
  if (code === 61 || code === 80) return { label: "Light rain", kind: "rain" };
  if (code === 63 || code === 81) return { label: "Rain", kind: "rain" };
  if (code === 65 || code === 82) return { label: "Heavy rain", kind: "rain" };
  if (code === 66 || code === 67) return { label: "Freezing rain", kind: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", kind: "snow" };
  if (code === 95) return { label: "Thunderstorm", kind: "storm" };
  if (code === 96 || code === 99) return { label: "Storm with hail", kind: "storm" };
  return { label: "—", kind: "cloudy" };
}

export type ForecastDay = {
  /** YYYY-MM-DD (Pakistan) */
  date: string;
  code: number;
  max: number;
  min: number;
  /** mm */
  rain: number;
  /** % */
  rainChance: number;
  /** km/h */
  gusts: number;
};

export type WarningKind = "storm" | "hail" | "heavy_rain" | "heat" | "frost" | "wind";

export type WeatherWarning = {
  kind: WarningKind;
  /** "warning" = act now; "watch" = be ready. */
  level: "warning" | "watch";
  title: string;
  advice: string;
  /** Days it applies to, earliest first. */
  dates: string[];
};

export const THRESHOLDS = {
  heavyRainMm: 20,
  rainWatchMm: 10,
  heatC: 42,
  heatWatchC: 40,
  frostC: 3,
  windKmh: 60,
  windWatchKmh: 45,
} as const;

const ADVICE: Record<WarningKind, { title: string; advice: string }> = {
  hail: {
    title: "Hail storm",
    advice: "Harvest ripe produce early if you can, and keep stock and animals under a roof.",
  },
  storm: {
    title: "Thunderstorm",
    advice: "Cover harvested crop and stored bags. Don't spray or work in open fields during lightning.",
  },
  heavy_rain: {
    title: "Heavy rain",
    advice: "Cover stock, clear field drains and hold off on fertilizer and spraying — rain will wash it away.",
  },
  heat: {
    title: "Heatwave",
    advice: "Irrigate early morning or evening, give animals shade and water, and rest workers at midday.",
  },
  frost: {
    title: "Frost risk",
    advice: "Water fields lightly in the evening and cover nursery plants and vegetables overnight.",
  },
  wind: {
    title: "Strong wind",
    advice: "Don't spray pesticide, and tie down tarps, sheds and stacked stock.",
  },
};

/** Farm warnings for the forecast, most serious first. */
export function farmWarnings(days: ForecastDay[]): WeatherWarning[] {
  const found = new Map<WarningKind, WeatherWarning>();
  const add = (kind: WarningKind, level: "warning" | "watch", date: string) => {
    const w = found.get(kind);
    if (!w) found.set(kind, { kind, level, ...ADVICE[kind], dates: [date] });
    else {
      if (!w.dates.includes(date)) w.dates.push(date);
      if (level === "warning") w.level = "warning";
    }
  };
  const t = THRESHOLDS;
  for (const d of days) {
    if (d.code === 96 || d.code === 99) add("hail", "warning", d.date);
    else if (d.code === 95) add("storm", "warning", d.date);
    if (d.rain >= t.heavyRainMm || d.code === 65 || d.code === 82) add("heavy_rain", "warning", d.date);
    else if (d.rain >= t.rainWatchMm && d.rainChance >= 50) add("heavy_rain", "watch", d.date);
    if (d.max >= t.heatC) add("heat", "warning", d.date);
    else if (d.max >= t.heatWatchC) add("heat", "watch", d.date);
    if (d.min <= t.frostC) add("frost", d.min <= 0 ? "warning" : "watch", d.date);
    if (d.gusts >= t.windKmh) add("wind", "warning", d.date);
    else if (d.gusts >= t.windWatchKmh) add("wind", "watch", d.date);
  }
  const order: WarningKind[] = ["hail", "storm", "heavy_rain", "wind", "heat", "frost"];
  return [...found.values()].sort(
    (a, b) =>
      Number(b.level === "warning") - Number(a.level === "warning") ||
      order.indexOf(a.kind) - order.indexOf(b.kind),
  );
}
