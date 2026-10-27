import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { bookRental, createRentalAsset } from "@/server/features/rental/rental-service";
import { rentalReport } from "@/server/features/reports/rental-report";
import { makeSellable, makeWorld } from "../helpers";

describe("rental report", () => {
  it("splits booking revenue by days in the period and measures asset utilisation", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `RR-${actor.userId.slice(-4)}`, "3", "11");
    const customer = await createCustomer(actor, { kind: "company", name: "რეპორტის ღონისძიება" });
    const busy = await createRentalAsset(actor, { variantId: variant.id, code: `RRA-${actor.userId.slice(-4)}` });
    const idle = await createRentalAsset(actor, { variantId: variant.id, code: `RRB-${actor.userId.slice(-4)}` });
    await bookRental(actor, {
      customerId: customer.id,
      assetIds: [busy.id],
      startOn: "2027-05-29",
      endOn: "2027-06-07",
      priceModel: "fixed_total",
      total: "1000",
      depositAmount: "50",
      postingKey: `rr-${busy.id}`,
    });

    const june = await rentalReport(actor, { from: "2027-06-01", to: "2027-06-30" });
    expect(june.totals.bookings).toBe(1);
    expect(june.rows[0].overlap).toBe(7);
    expect(june.totals.revenue?.toFixed(2)).toBe("700.00");
    const busyRow = june.assets.find((row) => row.id === busy.id);
    const idleRow = june.assets.find((row) => row.id === idle.id);
    expect(busyRow).toMatchObject({ bookings: 1, days: 7, utilisation: 23.3 });
    expect(idleRow).toMatchObject({ bookings: 0, days: 0, utilisation: 0 });
    expect(june.totals.utilisation).toBe(11.7);
    expect(june.totals.idle).toBe(1);

    const may = await rentalReport(actor, { from: "2027-05-01", to: "2027-05-31" });
    expect(may.totals.revenue?.toFixed(2)).toBe("300.00");
    const july = await rentalReport(actor, { from: "2027-07-01", to: "2027-07-31" });
    expect(july.totals.bookings).toBe(0);
  });
});
