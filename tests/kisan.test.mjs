// Unit tests for the shared domain rules in convex/lib/kisan.ts.
// Run: npm test  (Node's built-in runner; Node 22.18+/24 strips the TS types
// of the imported module natively, so no loader or extra dependency is needed).
// Lives outside convex/ so Convex never bundles it as a function.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addDays,
  evaluateAlert,
  listingSchema,
  marketLabel,
  normalizePhone,
  priceChange,
  profit,
  todayPK,
  toE164,
} from "../convex/lib/kisan.ts";

describe("marketLabel (±5% band)", () => {
  test("exactly at the average is at market", () => {
    assert.equal(marketLabel(100, 100), "at");
  });
  test("exactly +5% stays at market", () => {
    assert.equal(marketLabel(105, 100), "at");
    // Float noise: 3850 * 1.05 = 4042.5000000000005 must still be "at".
    assert.equal(marketLabel(3850 * 1.05, 3850), "at");
    assert.equal(marketLabel(4042.5, 3850), "at");
  });
  test("exactly −5% stays at market", () => {
    assert.equal(marketLabel(95, 100), "at");
    assert.equal(marketLabel(3850 * 0.95, 3850), "at");
    assert.equal(marketLabel(3657.5, 3850), "at");
  });
  test("just beyond +5% is above", () => {
    assert.equal(marketLabel(105.01, 100), "above");
    assert.equal(marketLabel(4043, 3850), "above");
  });
  test("just beyond −5% is below", () => {
    assert.equal(marketLabel(94.99, 100), "below");
    assert.equal(marketLabel(3657, 3850), "below");
  });
  test("far away", () => {
    assert.equal(marketLabel(200, 100), "above");
    assert.equal(marketLabel(10, 100), "below");
  });
  test("no average (0 or negative) falls back to at", () => {
    assert.equal(marketLabel(100, 0), "at");
    assert.equal(marketLabel(100, -5), "at");
  });
});

describe("evaluateAlert", () => {
  test("above: triggers at equality", () => {
    assert.deepEqual(evaluateAlert("above", 4000, 4000), { triggered: true, toGo: 0 });
  });
  test("below: triggers at equality", () => {
    assert.deepEqual(evaluateAlert("below", 4000, 4000), { triggered: true, toGo: 0 });
  });
  test("above: not yet, reports distance", () => {
    assert.deepEqual(evaluateAlert("above", 4000, 3850), { triggered: false, toGo: 150 });
    assert.deepEqual(evaluateAlert("above", 4000, 4001), { triggered: true, toGo: 0 });
  });
  test("below: not yet, reports distance", () => {
    assert.deepEqual(evaluateAlert("below", 3500, 3850), { triggered: false, toGo: 350 });
    assert.deepEqual(evaluateAlert("below", 3500, 3499), { triggered: true, toGo: 0 });
  });
  test("no price yet", () => {
    assert.deepEqual(evaluateAlert("above", 4000, null), { triggered: false, toGo: null });
    assert.deepEqual(evaluateAlert("below", 4000, null), { triggered: false, toGo: null });
  });
});

describe("profit", () => {
  test("plan example: 150 × 3,850 at +10%, cost 3,000", () => {
    assert.deepEqual(profit({ qty: 150, costPerUnit: 3000, price: 3850, shiftPct: 10 }), {
      adjPrice: 4235,
      revenue: 635250,
      totalCost: 450000,
      profit: 185250,
      margin: 29.2,
    });
  });
  test("no shift", () => {
    const r = profit({ qty: 150, costPerUnit: 3000, price: 3850, shiftPct: 0 });
    assert.equal(r.adjPrice, 3850);
    assert.equal(r.revenue, 577500);
    assert.equal(r.profit, 127500);
    assert.equal(r.margin, 22.1);
  });
  test("negative shift and a loss", () => {
    const r = profit({ qty: 10, costPerUnit: 3500, price: 3850, shiftPct: -20 });
    assert.equal(r.adjPrice, 3080);
    assert.equal(r.profit, -4200);
    assert.equal(r.margin, -13.6);
  });
  test("adjusted price is rounded to whole rupees", () => {
    assert.equal(profit({ qty: 1, costPerUnit: 0, price: 3855, shiftPct: 5 }).adjPrice, 4048); // 4047.75
  });
  test("bad inputs are clamped, zero revenue gives 0% margin", () => {
    assert.deepEqual(profit({ qty: Number.NaN, costPerUnit: 3000, price: 3850, shiftPct: 0 }), {
      adjPrice: 3850,
      revenue: 0,
      totalCost: 0,
      profit: 0,
      margin: 0,
    });
    const r = profit({ qty: -5, costPerUnit: -100, price: 3850, shiftPct: 0 });
    assert.equal(r.revenue, 0);
    assert.equal(r.totalCost, 0);
    assert.equal(profit({ qty: 10, costPerUnit: Number.NaN, price: 100, shiftPct: 0 }).totalCost, 0);
  });
});

describe("priceChange", () => {
  test("rise", () => {
    assert.deepEqual(priceChange(3850, 3500), { amount: 350, pct: 10 });
  });
  test("fall, rounded to one decimal", () => {
    assert.deepEqual(priceChange(3700, 3850), { amount: -150, pct: -3.9 });
  });
  test("no change", () => {
    assert.deepEqual(priceChange(3850, 3850), { amount: 0, pct: 0 });
  });
  test("no previous price (null or 0)", () => {
    assert.deepEqual(priceChange(3850, null), { amount: 0, pct: 0 });
    assert.deepEqual(priceChange(3850, 0), { amount: 0, pct: 0 });
  });
});

describe("todayPK (Pakistan time, UTC+5) and addDays", () => {
  test("midnight PKT is 19:00 UTC the day before", () => {
    assert.equal(todayPK(Date.parse("2026-10-20T18:59:59.999Z")), "2026-10-20");
    assert.equal(todayPK(Date.parse("2026-10-20T19:00:00.000Z")), "2026-10-21");
  });
  test("UTC midnight is already 05:00 in Pakistan", () => {
    assert.equal(todayPK(Date.parse("2026-10-21T00:00:00Z")), "2026-10-21");
    assert.equal(todayPK(Date.parse("2026-10-21T18:59:00Z")), "2026-10-21");
  });
  test("year boundary", () => {
    assert.equal(todayPK(Date.parse("2026-12-31T19:00:00Z")), "2027-01-01");
    assert.equal(todayPK(Date.parse("2026-12-31T18:59:00Z")), "2026-12-31");
  });
  test("addDays crosses months, years and leap days", () => {
    assert.equal(addDays("2026-10-21", 1), "2026-10-22");
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2027-01-01", -1), "2026-12-31");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2026-10-21", -13), "2026-10-08");
  });
});

describe("listingSchema", () => {
  const today = "2026-10-21";
  const valid = {
    cropId: "crop1",
    quantity: 150,
    askingPrice: 3850,
    district: "Hyderabad",
    grade: "A",
    availableFrom: today,
    contactPhone: "0300 1234567",
  };
  const codes = (result) => result.error.issues.map((i) => i.message);
  const check = (patch, keepDate) => listingSchema(today, keepDate).safeParse({ ...valid, ...patch });

  test("accepts a valid listing and normalises numbers and phone", () => {
    const r = check({ quantity: "150", askingPrice: "3850" });
    assert.equal(r.success, true);
    assert.equal(r.data.quantity, 150);
    assert.equal(r.data.askingPrice, 3850);
    assert.equal(r.data.contactPhone, "3001234567");
  });
  test("quantity must be > 0", () => {
    assert.deepEqual(codes(check({ quantity: 0 })), ["QTY_POSITIVE"]);
    assert.deepEqual(codes(check({ quantity: -1 })), ["QTY_POSITIVE"]);
    assert.ok(codes(check({ quantity: "abc" })).includes("QTY_POSITIVE"));
    assert.equal(check({ quantity: 0.5 }).success, true);
    assert.deepEqual(codes(check({ quantity: 100001 })), ["QTY_TOO_LARGE"]);
  });
  test("price must be > 0", () => {
    assert.deepEqual(codes(check({ askingPrice: 0 })), ["PRICE_POSITIVE"]);
    assert.deepEqual(codes(check({ askingPrice: -10 })), ["PRICE_POSITIVE"]);
    assert.deepEqual(codes(check({ askingPrice: 10000001 })), ["PRICE_TOO_LARGE"]);
  });
  test("date: today and later are fine, the past is not", () => {
    assert.equal(check({ availableFrom: "2026-10-22" }).success, true);
    assert.deepEqual(codes(check({ availableFrom: "2026-10-20" })), ["DATE_PAST"]);
    assert.ok(codes(check({ availableFrom: "21/10/2026" })).includes("DATE_INVALID"));
  });
  test("editing may keep its original (now past) date, but not another past date", () => {
    assert.equal(check({ availableFrom: "2026-10-01" }, "2026-10-01").success, true);
    assert.deepEqual(codes(check({ availableFrom: "2026-09-30" }, "2026-10-01")), ["DATE_PAST"]);
  });
  test("grade must be A, B or C", () => {
    for (const grade of ["A", "B", "C"]) assert.equal(check({ grade }).success, true);
    assert.deepEqual(codes(check({ grade: "D" })), ["GRADE_REQUIRED"]);
    assert.deepEqual(codes(check({ grade: "a" })), ["GRADE_REQUIRED"]);
  });
  test("district, crop and phone are required/valid", () => {
    assert.deepEqual(codes(check({ district: "Atlantis" })), ["DISTRICT_REQUIRED"]);
    assert.deepEqual(codes(check({ cropId: "" })), ["CROP_REQUIRED"]);
    assert.deepEqual(codes(check({ contactPhone: "12345" })), ["PHONE_INVALID"]);
  });
});

describe("phone helpers", () => {
  test("normalizePhone strips 0, 92 and formatting", () => {
    assert.equal(normalizePhone("03001234567"), "3001234567");
    assert.equal(normalizePhone("+92 300 1234567"), "3001234567");
    assert.equal(normalizePhone("300-123-4567"), "3001234567");
  });
  test("toE164", () => {
    assert.equal(toE164("3001234567"), "+923001234567");
    assert.equal(toE164("03001234567"), "+923001234567");
    assert.equal(toE164("+92 300 1234567"), "+923001234567");
    assert.equal(toE164("923001234567"), "+923001234567");
  });
});
