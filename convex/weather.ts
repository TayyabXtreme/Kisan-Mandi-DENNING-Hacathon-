// 7-day forecast and farm warnings for a district (GET /api/v1/weather),
// from Open-Meteo (free, no API key; attribution "Weather data by
// Open-Meteo.com"). One cached answer per district for CACHE_MS.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { apiError } from "./lib/errors";
import { describeWeather, farmWarnings, type ForecastDay } from "./lib/weather";

const CACHE_MS = 30 * 60 * 1000;
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";

export const cached = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("weatherCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

export const store = internalMutation({
  args: { key: v.string(), json: v.string(), fetchedAt: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const existing = await ctx.db
      .query("weatherCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) await ctx.db.patch("weatherCache", existing._id, { json: args.json, fetchedAt: args.fetchedAt });
    else await ctx.db.insert("weatherCache", args);
    return null;
  },
});

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    apiError("WEATHER_UNAVAILABLE", 502, "Couldn't reach the weather service. Try again soon.");
  }
  if (!res.ok) apiError("WEATHER_UNAVAILABLE", 502, "The weather service is busy. Try again soon.");
  return await res.json();
}

type GeoResult = { name: string; latitude: number; longitude: number; admin1?: string };
type ForecastJson = {
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    precipitation: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
    wind_gusts_10m_max: number[];
  };
};

/** Districts the geocoder doesn't know by name → their main town. */
const TOWN_FOR: Record<string, string> = {
  Tharparkar: "Mithi",
  "Naushahro Feroze": "Naushahro Firoz",
  "Kambar Shahdadkot": "Qambar",
  "Lakki Marwat": "Lakki",
  Ghizer: "Gahkuch",
  Diamer: "Chilas",
  Neelum: "Athmuqam",
};

async function fetchWeather(district: string) {
  const name = TOWN_FOR[district] ?? district;
  const geo = (await getJson(
    `${GEOCODE}?name=${encodeURIComponent(name)}&count=5&countryCode=PK&language=en&format=json`,
  )) as { results?: GeoResult[] };
  const place = geo.results?.[0];
  if (!place) apiError("WEATHER_PLACE_NOT_FOUND", 404, `No weather found for ${district}.`);

  const daily = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max";
  const current = "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,is_day";
  const f = (await getJson(
    `${FORECAST}?latitude=${place.latitude}&longitude=${place.longitude}&current=${current}&daily=${daily}&timezone=Asia%2FKarachi&forecast_days=7`,
  )) as ForecastJson;

  const days: ForecastDay[] = f.daily.time.map((date, i) => ({
    date,
    code: f.daily.weather_code[i] ?? 0,
    max: Math.round(f.daily.temperature_2m_max[i] ?? 0),
    min: Math.round(f.daily.temperature_2m_min[i] ?? 0),
    rain: Math.round((f.daily.precipitation_sum[i] ?? 0) * 10) / 10,
    rainChance: f.daily.precipitation_probability_max[i] ?? 0,
    gusts: Math.round(f.daily.wind_gusts_10m_max[i] ?? 0),
  }));
  const c = f.current;
  return {
    place: { name: place.name, district, province: place.admin1 ?? null },
    current: {
      time: c.time,
      temp: Math.round(c.temperature_2m),
      humidity: c.relative_humidity_2m,
      wind: Math.round(c.wind_speed_10m),
      rain: c.precipitation,
      isDay: c.is_day === 1,
      code: c.weather_code,
      ...describeWeather(c.weather_code),
    },
    days: days.map((d) => ({ ...d, ...describeWeather(d.code) })),
    warnings: farmWarnings(days),
  };
}

export type WeatherData = Awaited<ReturnType<typeof fetchWeather>> & { fetchedAt: number };

/** Forecast for a district, from the cache when it's fresh enough. */
export async function weatherFor(ctx: ActionCtx, district: string): Promise<WeatherData> {
  const key = district.trim().toLowerCase();
  const hit = await ctx.runQuery(internal.weather.cached, { key });
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return JSON.parse(hit.json) as WeatherData;
  try {
    const fetchedAt = Date.now();
    const data: WeatherData = { ...(await fetchWeather(district)), fetchedAt };
    await ctx.runMutation(internal.weather.store, { key, json: JSON.stringify(data), fetchedAt });
    return data;
  } catch (error) {
    // The service is down: an older forecast is better than nothing.
    if (hit) return JSON.parse(hit.json) as WeatherData;
    throw error;
  }
}
