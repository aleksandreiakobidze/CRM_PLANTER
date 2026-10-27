import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { ComposePanel } from "@/components/compose-panel";
import { CalendarDays, Leaf } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { variantLabel } from "@/lib/variant-label";
import { createBatchAction, repotAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { formatDateOnly, tbilisiDateString } from "@/server/time";

const STAGE: Record<string, { label: string; badge: "light" | "primary" | "success" | "warning" }> = {
  received: { label: "მიღებული", badge: "light" },
  growing: { label: "იზრდება", badge: "primary" },
  ready: { label: "მზად არის", badge: "success" },
  closed: { label: "დახურული", badge: "light" },
};

export default async function GreenhousePage() {
  const actor = await getActor();
  const [batches, variants, suppliers, locations] = await Promise.all([
    getDb().growthBatch.findMany({
      where: { organizationId: actor.organizationId },
      include: { variant: true, location: true },
      orderBy: { createdAt: "desc" },
    }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
    getDb().supplier.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: "asc" } }),
    getDb().location.findMany({ where: { organizationId: actor.organizationId }, orderBy: { code: "asc" } }),
  ]);
  const variantOptions = variants.map((item) => ({ value: item.id, label: variantLabel(item) }));
  const greenhouse = locations.find((item) => item.code === "greenhouse") ?? locations[0];
  const canWrite = actor.permissions.has("stock.write");
  const today = tbilisiDateString();
  const openCount = batches.filter((batch) => batch.status === "open").length;
  const growingCount = batches.filter((batch) => batch.stage === "growing").length;
  const readyCount = batches.filter((batch) => batch.stage === "ready").length;
  const lateCount = batches.filter((batch) => isLate(batch.stage, batch.expectedReadyOn, today)).length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">სათბური</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            პარტია ეტაპს იცვლის. გაყიდვად ერთეულს ავტომატურად არ ამრავლებს.
          </p>
        </div>
        {canWrite ? (
          <ComposePanel
            buttonLabel="გადარგვა"
            submitLabel="გადარგვა"
            variant="secondary"
            action={repotAction}
          >
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>ძველი ვარიანტი<ComboBox name="fromVariantId" required options={variantOptions} /></label>
            <label>ახალი ვარიანტი<ComboBox name="toVariantId" required options={variantOptions} /></label>
            <label>ქოთანი / მასალა<ComboBox name="potVariantId" required options={variantOptions} /></label>
            <label>
              ლოკაცია
              <ComboBox name="locationId" required options={locations.map((item) => ({ value: item.id, label: item.nameKa }))} defaultValue={greenhouse?.id} />
            </label>
            <label>მცენარე<input name="plantQty" required defaultValue="1" /></label>
            <label>ქოთანი<input name="potQty" required defaultValue="1" /></label>
          </ComposePanel>
        ) : null}
        {canWrite ? (
          <ComposePanel buttonLabel="ახალი პარტია" submitLabel="შენახვა" action={createBatchAction}>
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>ვარიანტი<ComboBox name="variantId" required options={variantOptions} /></label>
            <label>
              ლოკაცია
              <ComboBox name="locationId" options={locations.map((item) => ({ value: item.id, label: item.nameKa }))} defaultValue={greenhouse?.id} />
            </label>
            {suppliers.length > 0 ? (
              <label>
                მიმწოდებელი
                <ComboBox name="supplierId" options={[{ value: "", label: "—" }, ...suppliers.map((item) => ({ value: item.id, label: item.name }))]} />
              </label>
            ) : null}
            <label>რაოდენობა<input name="quantity" required /></label>
            <label>დაგეგმილი მზადყოფნა<input name="expectedReadyOn" type="date" /></label>
            <label>შენიშვნა<textarea name="notes" /></label>
          </ComposePanel>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="ღია პარტია" value={openCount} hint="დახურული ჯერ არ არის" />
        <StatCard title="იზრდება" value={growingCount} hint="მიმდინარე ეტაპი" />
        <StatCard title="მზად არის" value={readyCount} hint="გასაყიდად მზად" />
        <StatCard title="ვადაგასული" value={lateCount} hint="მზადყოფნის თარიღი გავიდა" tone={lateCount > 0 ? "error" : undefined} />
      </div>

      <Card>
        <CardHeader className="mb-0">
          <CardTitle>პარტიები</CardTitle>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ეტაპის შეცვლა ნაშთს არ ამრავლებს.</p>
        </CardHeader>
        <CardContent className="pt-5">
          {batches.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">პარტია ჯერ არ არის.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ნომერი</TableHead>
                    <TableHead>მცენარე</TableHead>
                    <TableHead>ეტაპი</TableHead>
                    <TableHead>რაოდენობა</TableHead>
                    <TableHead>მზადყოფნა</TableHead>
                    <TableHead>ლოკაცია</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => {
                    const stage = STAGE[batch.stage] ?? { label: batch.stage, badge: "light" as const };
                    const late = isLate(batch.stage, batch.expectedReadyOn, today);
                    return (
                      <TableRow key={batch.id}>
                        <TableCell className="whitespace-nowrap">
                          <Link className="font-medium text-brand-500 hover:text-brand-600" href={`/greenhouse/${batch.id}`}>
                            {batch.number}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-gray-800 dark:text-white/90">{batch.variant.nameKa}</p>
                          <p className="text-xs text-gray-500">{batch.variant.sku}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={stage.badge}>{stage.label}</Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatQty(batch.quantity)}</TableCell>
                        <TableCell>
                          {batch.expectedReadyOn ? (
                            <span className={`inline-flex items-center gap-1.5 tabular-nums ${late ? "font-medium text-error-600 dark:text-error-500" : "text-gray-700 dark:text-gray-300"}`}>
                              <CalendarDays size={14} />
                              {formatDateOnly(batch.expectedReadyOn)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">{batch.location.nameKa}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function StatCard({ title, value, hint, tone }: { title: string; value: number; hint: string; tone?: "error" }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone === "error" ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500" : "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400"}`}>
          <Leaf size={18} />
        </span>
      </div>
      <p className="mt-4 text-[26px] font-bold tracking-tight text-gray-800 tabular-nums dark:text-white/90">{value}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{hint}</p>
    </Card>
  );
}

function isLate(stage: string, expectedReadyOn: Date | null, today: string) {
  if (!expectedReadyOn || stage === "closed" || stage === "ready") return false;
  return formatDateOnly(expectedReadyOn) < today;
}

function formatQty(value: { toString(): string }) {
  const text = value.toString();
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}
