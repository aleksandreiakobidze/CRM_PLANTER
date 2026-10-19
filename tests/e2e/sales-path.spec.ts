import { expect, test, type Page } from "@playwright/test";

async function chooseLabeledOption(page: Page, label: string, text: string) {
  const field = page.getByRole("combobox", { name: label });
  await field.click();
  await field.fill(text);
  await page.getByRole("option").filter({ hasText: text }).first().click();
}

test("ქართული შესვლიდან ნაწილობრივ გადახდამდე", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  test.skip(!email || !password, "E2E_EMAIL და E2E_PASSWORD არ არის. დემო seed ცალკე ირთვება.");

  const stamp = Date.now().toString(36);
  const customerName = `სატესტო ე2ე ${stamp}`;
  const sku = `E2E-${stamp}`.slice(0, 20);
  const phone = `599${String(Date.now()).slice(-6)}`;

  await page.goto("/login");
  await page.getByLabel("ელფოსტა").fill(email!);
  await page.getByLabel("პაროლი").fill(password!);
  await page.getByRole("button", { name: "შესვლა" }).click();
  await expect(page.getByRole("heading", { name: "მთავარი" })).toBeVisible({ timeout: 30_000 });

  await page.goto("/crm/customers/new");
  await page.getByLabel("სახელი").fill(customerName);
  await page.getByLabel("ტელეფონი").fill(phone);
  await page.getByRole("button", { name: "შენახვა" }).click();
  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
  await expect(page.getByText(`+995${phone}`)).toBeVisible();

  await page.goto("/products/new");
  await page.getByLabel("პროდუქტის სახელი").fill("სატესტო მონსტერა");
  await page.getByLabel("ვარიანტი").fill("საშუალო");
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("საცალო ფასი").fill("10");
  await page.getByRole("button", { name: "შენახვა" }).click();
  await expect(page.getByText(`შეიქმნა ${sku}`)).toBeVisible();

  await page.goto("/inventory/opening");
  await chooseLabeledOption(page, "ვარიანტი", sku);
  await chooseLabeledOption(page, "ლოკაცია", "გასაყიდი ზონა");
  await page.getByLabel("რაოდენობა").fill("5");
  await page.getByLabel("თვითღირებულება").fill("4");
  await page.getByRole("button", { name: "გატარება" }).click();
  await expect(page.getByText("ნაშთი გაიტარა")).toBeVisible();
  await page.goto("/inventory");
  await expect(page.getByRole("cell", { name: sku })).toBeVisible();
  await expect(page.getByRole("cell", { name: "5.000" }).first()).toBeVisible();

  await page.goto("/sales/quotes/new");
  await chooseLabeledOption(page, "კლიენტი", customerName);
  await chooseLabeledOption(page, "ვარიანტი", sku);
  await page.getByLabel("რაოდენობა").fill("2");
  await page.getByLabel("ერთეულის ფასი").fill("10");
  await page.getByRole("button", { name: "შენახვა" }).click();
  await expect(page.getByRole("heading", { name: /^QT-/ })).toBeVisible();
  await expect(page.getByText("ჯამი: 20.00 ₾")).toBeVisible();
  await page.getByRole("button", { name: "შეკვეთად გარდაქმნა" }).click();
  await expect(page.getByRole("heading", { name: /^SO-/ })).toBeVisible();

  await page.getByRole("button", { name: "დაჯავშნა" }).click();
  await expect(page.getByRole("button", { name: "მიწოდების დადასტურება" })).toBeVisible();
  await page.getByRole("button", { name: "მიწოდების დადასტურება" }).click();
  await expect(page.getByRole("button", { name: "ინვოისის შექმნა" })).toBeVisible();
  await page.getByRole("button", { name: "ინვოისის შექმნა" }).click();
  await expect(page.getByRole("heading", { name: /^INV-/ })).toBeVisible();
  await expect(page.getByText("დარჩენილი: 20.00 ₾")).toBeVisible();

  const pdfHref = await page.getByRole("link", { name: "PDF" }).getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"] ?? "").toContain("pdf");

  await page.getByLabel("თანხა").fill("8");
  await page.getByRole("button", { name: "გადახდის დაფიქსირება" }).click();
  await expect(page.getByText("გადახდა დაფიქსირდა")).toBeVisible();
  await page.reload();
  await expect(page.getByText("დარჩენილი: 12.00 ₾")).toBeVisible();
  await expect(page.getByText("დაფარული: 8.00 ₾")).toBeVisible();
});
