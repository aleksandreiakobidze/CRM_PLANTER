import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { confirmCustomerImport, confirmOpeningStock, confirmProductImport, dryRunCustomers, dryRunProducts } from "@/server/features/import/import-service";
import { getDb } from "@/server/db";
import { makeSellable, makeWorld } from "../helpers";

async function workbook(headers: string[], rows: string[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("data");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  const data = await book.xlsx.writeBuffer();
  return Buffer.from(data);
}

describe("იმპორტი", () => {
  it("dry run არ წერს, დადასტურებული ფაილი კი მეორედ ასლს არ ქმნის", async () => {
    const { actor } = await makeWorld();
    const file = await workbook(["სახელი", "ტელეფონი", "საიდენტიფიკაციო კოდი"], [["სატესტო იმპორტი", "599000111", "111222333"]]);
    const preview = await dryRunCustomers(actor, file);
    expect(preview[0]?.status).toBe("ok");
    expect(await getDb().customer.count({ where: { organizationId: actor.organizationId } })).toBe(0);
    const first = await confirmCustomerImport(actor, file);
    const second = await confirmCustomerImport(actor, file);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(await getDb().customer.count({ where: { organizationId: actor.organizationId, name: "სატესტო იმპორტი" } })).toBe(1);
  });

  it("ბუნდოვან სახეობას თვითონ არ იგონებს", async () => {
    const { actor } = await makeWorld();
    const file = await workbook(["sku", "დასახელება", "სახეობა", "ფასი"], [["RED-1", "წითელი ქოთანი", "წითელი", "12"]]);
    const preview = await dryRunProducts(actor, file);
    expect(preview[0]?.message).toMatch(/ხელით/);
    await expect(confirmProductImport(actor, file)).rejects.toThrow(/ხელით/);
    expect(await getDb().productVariant.count({ where: { organizationId: actor.organizationId, sku: "RED-1" } })).toBe(0);
  });

  it("საწყისი ნაშთი ერთხელ იწერება ledger-ში", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `IMP-${actor.userId.slice(-4)}`, "1", "3");
    const file = await workbook(["sku", "რაოდენობა", "ლოკაცია", "თვითღირებულება"], [[variant.sku, "4", "warehouse", "7"]]);
    const first = await confirmOpeningStock(actor, file);
    const second = await confirmOpeningStock(actor, file);
    expect(second.created).toBe(false);
    const movements = await getDb().stockMovement.count({
      where: { variantId: variant.id, locationId: { not: undefined }, movementType: "opening", reason: "იმპორტის საწყისი ნაშთი" },
    });
    expect(movements).toBe(1);
    expect(first.batch.id).toBe(second.batch.id);
  });
});
