import { format, parseISO } from "date-fns";

/** 3850 → "Rs 3,850" */
export const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

/** 3850 → "3,850" */
export const num = (n: number) => Math.round(n).toLocaleString("en-US");

/** 90 → "+Rs 90", -130 → "−Rs 130", 0 → "Rs 0" */
export const signedRs = (n: number) =>
  n > 0 ? `+Rs ${num(n)}` : n < 0 ? `−Rs ${num(-n)}` : "Rs 0";

/** 2.4 → "2.4%" (absolute value, one decimal) */
export const pct = (n: number) => `${Math.abs(n).toFixed(1)}%`;

/** "2026-10-21" → "21 Oct" */
export const day = (key: string) => format(parseISO(key), "d MMM");

/** "2026-10-21" → "Wed, 21 Oct" */
export const dayLong = (key: string) => format(parseISO(key), "EEE, d MMM");

/** "2026-10-21" → "Mon, 19 Oct 2026" */
export const dayFull = (key: string) => format(parseISO(key), "EEE, d MMM yyyy");

/** Date → "9:30 AM" */
export const clock = (ms: number) => format(new Date(ms), "h:mm a");

/** "+923001234567" → "+92 300 1234 567" */
export const phoneDisplay = (e164: string) => {
  const d = e164.replace(/\D/g, "").replace(/^92/, "");
  return `+92 ${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`.trim();
};

/** "Allah Bux" → "AB" */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Today's date key in Pakistan, as the server computes it. */
export { todayPK } from "../../convex/lib/kisan";
