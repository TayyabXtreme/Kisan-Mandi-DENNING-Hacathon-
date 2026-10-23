import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { APP_NAME } from "./lib/app_info";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

/** Emails a farmer the alerts that triggered for the first time today. */
export const sendPriceAlerts = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
    alerts: v.array(
      v.object({
        crop: v.string(),
        market: v.string(),
        condition: v.union(v.literal("above"), v.literal("below")),
        targetPrice: v.number(),
        latest: v.number(),
      }),
    ),
  },
  handler: async (_ctx, args): Promise<null> => {
    if (args.alerts.length === 0) return null;
    const lines = args.alerts.map(
      (a) =>
        `${a.crop} at ${a.market}: ${rs(a.latest)} (${a.condition === "above" ? "≥" : "≤"} ${rs(a.targetPrice)})`,
    );
    const first = args.name.split(" ")[0] || "there";
    const subject =
      args.alerts.length === 1
        ? `${args.alerts[0].crop} hit your target — ${APP_NAME}`
        : `${args.alerts.length} price alerts triggered — ${APP_NAME}`;
    const rows = lines
      .map(
        (l) =>
          `<li style="margin:8px 0;padding:12px;background:#f3eee4;border-radius:10px">${escapeHtml(l)}</li>`,
      )
      .join("");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [args.email],
        subject,
        text: `Salam ${first},\n\nYour price alerts triggered today:\n\n${lines.join("\n")}\n\nOpen ${APP_NAME} to compare markets before you sell.`,
        html: `<div style="font-family:Arial,sans-serif;background:#f3eee4;padding:32px"><div style="max-width:440px;margin:auto;background:white;border-radius:16px;padding:28px"><h2 style="color:#2b2118;margin-top:0">Salam ${escapeHtml(first)},</h2><p style="color:#2b2118">Your price alerts triggered today:</p><ul style="list-style:none;padding:0">${rows}</ul><p style="color:#7a6f64">Open ${APP_NAME} to compare markets before you sell.</p></div></div>`,
      }),
    });
    if (!response.ok)
      console.error("Price alert email failed", { status: response.status });
    return null;
  },
});
