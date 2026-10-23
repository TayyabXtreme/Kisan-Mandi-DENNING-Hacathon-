// Unit tests for the farm weather warnings in convex/lib/weather.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { describeWeather, farmWarnings } from "../convex/lib/weather.ts";

const day = (date, extra = {}) => ({ date, code: 0, max: 35, min: 20, rain: 0, rainChance: 0, gusts: 20, ...extra });

describe("describeWeather", () => {
  test("maps WMO codes to labels and icon kinds", () => {
    assert.deepEqual(describeWeather(0), { label: "Clear sky", kind: "clear" });
    assert.equal(describeWeather(65).label, "Heavy rain");
    assert.equal(describeWeather(99).kind, "storm");
  });
});

describe("farmWarnings", () => {
  test("a calm week has no warnings", () => {
    assert.deepEqual(farmWarnings([day("2026-10-23"), day("2026-10-24")]), []);
  });
  test("heavy rain on two days becomes one warning with both dates", () => {
    const w = farmWarnings([day("2026-10-23", { rain: 25 }), day("2026-10-24", { code: 65 })]);
    assert.equal(w.length, 1);
    assert.equal(w[0].kind, "heavy_rain");
    assert.equal(w[0].level, "warning");
    assert.deepEqual(w[0].dates, ["2026-10-23", "2026-10-24"]);
  });
  test("watch upgrades to warning when a later day is worse", () => {
    const w = farmWarnings([day("2026-10-23", { max: 40 }), day("2026-10-24", { max: 43 })]);
    assert.equal(w[0].kind, "heat");
    assert.equal(w[0].level, "warning");
  });
  test("moderate rain needs a high chance to count", () => {
    assert.deepEqual(farmWarnings([day("2026-10-23", { rain: 12, rainChance: 30 })]), []);
    assert.equal(farmWarnings([day("2026-10-23", { rain: 12, rainChance: 70 })])[0].level, "watch");
  });
  test("warnings come before watches, hail before heat", () => {
    const w = farmWarnings([day("2026-10-23", { code: 99, max: 41, gusts: 70 })]);
    assert.deepEqual(w.map((x) => [x.kind, x.level]), [["hail", "warning"], ["wind", "warning"], ["heat", "watch"]]);
  });
  test("frost below zero is a warning", () => {
    assert.equal(farmWarnings([day("2026-01-10", { min: -1 })])[0].level, "warning");
  });
});
