import { describe, expect, it } from "vitest";
import { D, monthlyMaintenanceFee, priceFromTarget } from "@/server/money";
import { inclusiveDays, parseDateOnly, formatDateOnly, tbilisiDateString, withinWindow, zonedDateTime } from "@/server/time";

describe("ფული და თბილისის დრო", () => {
  it("1000-ის 10 პროცენტია 100 და არა 70", () => {
    expect(monthlyMaintenanceFee(D("1000"), D("10")).toFixed(2)).toBe("100.00");
    expect(monthlyMaintenanceFee(D("700"), D("10")).toFixed(2)).toBe("70.00");
  });

  it("21 ცალი და ჯამი 1372 ზუსტად ემთხვევა", () => {
    const priced = priceFromTarget(D("21"), D("1372"));
    expect(priced.lineTotal.toFixed(2)).toBe("1372.00");
  });

  it("21-23 ნოემბერი 3 დღეა", () => {
    expect(inclusiveDays("2026-11-21", "2026-11-23")).toBe(3);
  });

  it("UTC საღამო თბილისში უკვე შემდეგი დღეა, date-only კი არ იცვლება", () => {
    expect(tbilisiDateString(new Date("2026-10-19T20:30:00.000Z"))).toBe("2026-10-20");
    expect(formatDateOnly(parseDateOnly("2026-10-20"))).toBe("2026-10-20");
  });

  it("ექსკურსია 13:00–16:00 ფანჯარაში ჯდება", () => {
    const inside = withinWindow(zonedDateTime("2026-11-21", "13:00"), zonedDateTime("2026-11-21", "15:00"), "13:00", "16:00");
    const early = withinWindow(zonedDateTime("2026-11-21", "12:00"), zonedDateTime("2026-11-21", "14:00"), "13:00", "16:00");
    const late = withinWindow(zonedDateTime("2026-11-21", "13:00"), zonedDateTime("2026-11-21", "16:30"), "13:00", "16:00");
    expect(inside).toBe(true);
    expect(early).toBe(false);
    expect(late).toBe(false);
  });
});
