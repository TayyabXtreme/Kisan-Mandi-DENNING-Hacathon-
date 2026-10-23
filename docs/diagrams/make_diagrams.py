"""Generates the README diagrams (docs/diagrams/*.svg) in the KisanMandi palette."""
import os
import sys
from html import escape

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

BG = "#F3EEE4"
CARD = "#FFFFFF"
INK = "#2B2118"
MUTED = "#7A6F64"
LINE = "#D8CFBF"
GREEN = "#3F7A3F"
GREEN_SOFT = "#DDEBD5"
MUSTARD = "#EFD27C"
MUSTARD_SOFT = "#F6E7B8"
RED = "#C4483A"
RED_SOFT = "#F7DCD6"
SKY = "#D4E7EF"
FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"


class Svg:
    def __init__(self, w, h, title):
        self.w, self.h = w, h
        self.parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="{FONT}" role="img" aria-label="{escape(title)}">',
            f"<title>{escape(title)}</title>",
            "<defs>"
            f'<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{INK}"/></marker>'
            f'<marker id="arrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{GREEN}"/></marker>'
            f'<marker id="arrR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{RED}"/></marker>'
            "</defs>",
            f'<rect width="{w}" height="{h}" rx="24" fill="{BG}"/>',
        ]

    def text(self, x, y, s, size=14, weight=400, fill=INK, anchor="start"):
        self.parts.append(
            f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>'
        )

    def title(self, s, sub=None):
        self.text(32, 46, s, 24, 800)
        if sub:
            self.text(32, 72, sub, 14, 400, MUTED)

    def box(self, x, y, w, h, lines, fill=CARD, stroke=None, head_fill=INK, size=13, rx=16, bold_first=True):
        st = f' stroke="{stroke}" stroke-width="2"' if stroke else ""
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st}/>')
        lh = size + 5
        total = lh * len(lines)
        ty = y + (h - total) / 2 + size
        for i, line in enumerate(lines):
            first = i == 0 and bold_first
            self.text(x + w / 2, ty + i * lh, line, size + (1 if first else 0), 700 if first else 400,
                      head_fill if first else MUTED, "middle")

    def arrow(self, x1, y1, x2, y2, color=INK, dashed=False, label=None, label_dy=-8):
        marker = {INK: "arr", GREEN: "arrG", RED: "arrR"}[color]
        dash = ' stroke-dasharray="6 5"' if dashed else ""
        self.parts.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2"{dash} marker-end="url(#{marker})"/>'
        )
        if label:
            self.text((x1 + x2) / 2, (y1 + y2) / 2 + label_dy, label, 12, 600, color, "middle")

    def path(self, d, color=INK, dashed=False):
        marker = {INK: "arr", GREEN: "arrG", RED: "arrR"}[color]
        dash = ' stroke-dasharray="6 5"' if dashed else ""
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2"{dash} marker-end="url(#{marker})"/>')

    def pill(self, x, y, s, fill, fg, size=12):
        w = len(s) * size * 0.58 + 22
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{size + 12}" rx="{(size + 12) / 2}" fill="{fill}"/>')
        self.text(x + w / 2, y + size + 3, s, size, 700, fg, "middle")
        return w

    def save(self, name):
        self.parts.append("</svg>")
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write("\n".join(self.parts))


def lane_flow(svg, top, label, color_fill, color_fg, steps, box_w=200, gap=40, x0=150, h=86):
    """One horizontal lane: label pill on the left, boxes joined by arrows."""
    svg.parts.append(f'<rect x="24" y="{top - 14}" width="{svg.w - 48}" height="{h + 28}" rx="20" fill="{CARD}" fill-opacity="0.45"/>')
    svg.box(36, top, 100, h, [label], fill=color_fill, head_fill=color_fg, size=13)
    x = x0
    for i, (lines, fill, stroke) in enumerate(steps):
        svg.box(x, top, box_w, h, lines, fill=fill, stroke=stroke)
        if i < len(steps) - 1:
            svg.arrow(x + box_w + 4, top + h / 2, x + box_w + gap - 4, top + h / 2)
        x += box_w + gap
    return top + h


# ---------------------------------------------------------------- architecture
s = Svg(1100, 640, "KisanMandi architecture")
s.title("How KisanMandi fits together", "One Expo app, one Convex backend, a few outside services")

# App
s.box(32, 110, 300, 470, [""], fill=CARD, rx=22)
s.text(182, 146, "Mobile app", 18, 800, INK, "middle")
s.text(182, 168, "React Native · Expo SDK 57 · Expo Router", 12, 400, MUTED, "middle")
app_items = [
    ("Screens (src/app)", "prices · market · chats · dashboard"),
    ("UI kit (components/kisan)", "buttons · sheets · charts · dialogs"),
    ("REST client + cache", "useResource · invalidate"),
    ("Realtime chat", "Convex useQuery (live)"),
    ("Voice & device", "mic · camera · speech · haptics"),
]
for i, (a, b) in enumerate(app_items):
    s.box(52, 190 + i * 76, 260, 62, [a, b], fill=BG, size=12)

# Convex
s.box(392, 110, 330, 470, [""], fill=CARD, rx=22)
s.text(557, 146, "Convex backend", 18, 800, INK, "middle")
s.text(557, 168, "TypeScript functions + database", 12, 400, MUTED, "middle")
cx_items = [
    ("REST API  /api/v1", "zod checks · role & owner rules", GREEN_SOFT),
    ("MCP server  /mcp/<key>", "read-only tools for ChatGPT / Claude", GREEN_SOFT),
    ("Queries · mutations · actions", "listings, offers, deals, alerts…", BG),
    ("Database (tables)", "users · prices · listings · sales…", BG),
    ("Crons · file storage", "daily prices · voice notes, photos", BG),
]
for i, (a, b, f) in enumerate(cx_items):
    s.box(412, 190 + i * 76, 290, 62, [a, b], fill=f, size=12)

# Services
svc = [
    ("Better Auth", "email code · Google · sessions"),
    ("AWS Bedrock", "Kisan Dost AI · advice"),
    ("Groq Whisper", "speech → text"),
    ("Resend", "codes · alert emails"),
    ("Open-Meteo", "forecast · weather warnings"),
]
for i, (a, b) in enumerate(svc):
    y = 118 + i * 92
    s.box(800, y, 268, 70, [a, b], fill=CARD, stroke=LINE, size=12)
    s.arrow(722, y + 35, 796, y + 35, color=GREEN)

s.arrow(334, 300, 388, 300, label="HTTPS + JWT")
s.arrow(388, 360, 334, 360, label="JSON", label_dy=18)
s.arrow(334, 470, 388, 470, dashed=True, label="websocket")
s.pill(392, 596, "ChatGPT / Claude → MCP link (read-only)", MUSTARD_SOFT, "#7A5A12")
s.save("architecture.svg")


# ---------------------------------------------------------------- farmer flow
s = Svg(1180, 600, "Farmer journey in KisanMandi")
s.title("Farmer journey", "From sign-up to a closed deal and a clear profit")
W = (CARD, None)
lane_flow(s, 110, "Start", GREEN_SOFT, GREEN, [
    (["Sign up", "email + password or Google"], *W),
    (["Verify", "6-digit code by email"], *W),
    (["Profile", "Farmer · district · mandi"], *W),
    (["Home", "today's prices + weather"], *W),
])
lane_flow(s, 230, "Market", SKY, INK, [
    (["Crop detail", "14-day trend · best mandi"], *W),
    (["AI advice", "sell now or wait?"], *W),
    (["Price alert", "above / below target"], *W),
    (["Kisan Dost", "ask by voice in Urdu/Sindhi"], *W),
])
lane_flow(s, 350, "Sell", MUSTARD_SOFT, "#7A5A12", [
    (["Sell produce", "crop · maund · price (voice)"], *W),
    (["Listed", "visible in Marketplace"], *W),
    (["Buyer offer", "wants X maund at Rs Y"], CARD, MUSTARD),
    (["Answer", "Accept · Negotiate · Decline"], CARD, GREEN),
])
lane_flow(s, 470, "Track", GREEN_SOFT, GREEN, [
    (["Deal done", "stock goes down by X"], CARD, GREEN),
    (["Dashboard", "profit · stock · deals"], *W),
    (["Expenses", "seed · fertilizer · labour…"], *W),
    (["Budget chart", "spent vs earned / month"], *W),
])
# lane-to-lane connectors (right edge down to next lane start)
for top in (110, 230, 350):
    s.path(f"M {150 + 3 * 240 + 100} {top + 90} L {150 + 3 * 240 + 100} {top + 102} L 250 {top + 102} L 250 {top + 116}")
s.save("farmer-flow.svg")


# ---------------------------------------------------------------- buyer flow
s = Svg(1180, 480, "Buyer journey in KisanMandi")
s.title("Buyer journey", "Find produce, say how much you want, agree a price")
lane_flow(s, 110, "Find", SKY, INK, [
    (["Sign up", "role: Buyer · district"], *W),
    (["Prices", "today's mandi rates"], *W),
    (["Marketplace", "search · crop · district · grade"], *W),
    (["Listing", "price vs market · stock left"], *W),
])
lane_flow(s, 230, "Offer", MUSTARD_SOFT, "#7A5A12", [
    (["Make offer", "how many maund + price"], CARD, MUSTARD),
    (["Chat", "text · voice · photos"], *W),
    (["Negotiate", "counter offers both ways"], *W),
    (["Deal", "farmer accepts"], CARD, GREEN),
])
lane_flow(s, 350, "Track", GREEN_SOFT, GREEN, [
    (["My offers", "open · waiting for whom"], *W),
    (["Purchases", "what, how much, total"], *W),
    (["Weather", "7-day forecast + warnings"], *W),
    (["Call / WhatsApp", "arrange pickup"], *W),
])
for top in (110, 230):
    s.path(f"M {150 + 3 * 240 + 100} {top + 90} L {150 + 3 * 240 + 100} {top + 102} L 250 {top + 102} L 250 {top + 116}")
s.save("buyer-flow.svg")


# ---------------------------------------------------------------- deal lifecycle (sequence)
s = Svg(1100, 760, "How an offer becomes a deal")
s.title("How an offer becomes a deal", "Example: a farmer lists 100 maund of tomato at Rs 250 / 40 kg")
cols = {"Buyer": 170, "KisanMandi (Convex)": 550, "Farmer": 930}
for name, x in cols.items():
    s.box(x - 120, 96, 240, 48, [name], fill=INK if name.startswith("Kisan") else CARD, head_fill=CARD if name.startswith("Kisan") else INK, size=14)
    s.parts.append(f'<line x1="{x}" y1="146" x2="{x}" y2="730" stroke="{LINE}" stroke-width="2" stroke-dasharray="4 6"/>')

B, K, F = cols.values()
y = 180
def msg(a, b, label, color=INK, dashed=False):
    global y
    s.arrow(a + (8 if b > a else -8), y, b + (-8 if b > a else 8), y, color=color, dashed=dashed)
    s.text((a + b) / 2, y - 9, label, 12.5, 600, color, "middle")
    y += 46

def note(x, lines, fill=GREEN_SOFT, w=300):
    global y
    h = 18 * len(lines) + 20
    s.box(x - w / 2, y - 18, w, h, lines, fill=fill, size=12)
    y += h + 18

msg(B, K, "Make offer: 50 maund × Rs 250")
note(K, ["offer saved as “pending”", "one open offer per chat"], BG)
msg(K, F, "Buyer offers badge + chat message", GREEN)
msg(F, K, "Counter offer: 50 maund × Rs 270")
note(K, ["old offer → “countered”", "new offer pending for the buyer"], BG)
msg(K, B, "Counter offer arrives in chat", GREEN)
msg(B, K, "Accept")
note(K, ["checks stock: 50 ≤ 100 ✓", "listing: 100 → 50 maund left", "deal saved (Rs 13,500)", "(at 0 left the listing is sold out)"], GREEN_SOFT, 320)
msg(K, B, "“Deal done” in chat · Purchases", GREEN, dashed=True)
msg(K, F, "“Deal done” · stock & profit updated", GREEN, dashed=True)
s.pill(32, 724, "Decline at any step → offer “declined”, stock unchanged", RED_SOFT, RED)
s.save("deal-lifecycle.svg")


# ---------------------------------------------------------------- auth & roles
s = Svg(1100, 560, "Sign-in and roles")
s.title("Sign-in and roles", "Better Auth inside Convex; the role decides what each person can do")
s.box(32, 110, 230, 70, ["Email + password", "min 8 characters"], stroke=LINE)
s.box(32, 200, 230, 70, ["Continue with Google", "OAuth"], stroke=LINE)
s.box(310, 110, 230, 70, ["6-digit code", "sent by Resend"], fill=MUSTARD_SOFT)
s.box(590, 150, 230, 80, ["Better Auth session", "→ Convex JWT", "token on every request"], fill=CARD, stroke=GREEN)
s.box(860, 150, 210, 80, ["users table", "mirrored by triggers", "role · district · mandi"], fill=CARD)
s.arrow(264, 145, 306, 145)
s.arrow(542, 150, 586, 175)
s.arrow(264, 235, 586, 205, label="no code needed", label_dy=20)
s.arrow(822, 190, 856, 190)

roles = [
    ("Farmer", GREEN_SOFT, GREEN, ["Prices, trends, AI advice", "Price alerts (+ email)", "Sell produce · My listings", "Answer offers, negotiate", "Dashboard, expenses, budget"]),
    ("Buyer", SKY, INK, ["Prices, trends, AI advice", "Marketplace search & filters", "Make offers (maund + price)", "Chat, counter, accept", "Offers & purchases dashboard"]),
    ("Admin", MUSTARD_SOFT, "#7A5A12", ["Email listed in ADMIN_EMAILS", "Approve / reject mandi requests", "Add & edit markets", "Publish today's prices", "Read “Contact admin” messages"]),
]
for i, (name, fill, fg, items) in enumerate(roles):
    x = 32 + i * 352
    s.box(x, 290, 332, 236, [""], fill=CARD, rx=20)
    s.parts.append(f'<rect x="{x}" y="290" width="332" height="46" rx="20" fill="{fill}"/>')
    s.parts.append(f'<rect x="{x}" y="316" width="332" height="20" fill="{fill}"/>')
    s.text(x + 18, 320, name, 16, 800, fg)
    for j, it in enumerate(items):
        s.parts.append(f'<circle cx="{x + 24}" cy="{364 + j * 34}" r="4" fill="{fg}"/>')
        s.text(x + 38, 369 + j * 34, it, 13.5, 500, INK)
s.save("auth-roles.svg")
print("ok")
