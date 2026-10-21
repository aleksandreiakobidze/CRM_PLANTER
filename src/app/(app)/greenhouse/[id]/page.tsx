import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { advanceBatchAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { formatDateOnly } from "@/server/time";

const STAGES = [
  ["received", "მიღებული", "light"],
  ["growing", "იზრდება", "primary"],
  ["ready", "მზად არის", "success"],
  ["closed", "დახურული", "light"],
] as const;

export default async function GreenhouseBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const batch = await getDb().growthBatch.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { variant: true, location: true, supplier: true },
  });
  if (!batch) notFound();
  const canWrite = actor.permissions.has("stock.write");
  const current = STAGES.find(([code]) => code === batch.stage);

  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-brand-500 hover:text-brand-600" href="/greenhouse">
          სათბური
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">{batch.number}</h1>
          {current ? <Badge variant={current[2]}>{current[1]}</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {batch.variant.nameKa} · {batch.variant.sku}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="რაოდენობა" value={formatQty(batch.quantity)} />
        <Fact label="ლოკაცია" value={batch.location.nameKa} />
        <Fact label="მიმწოდებელი" value={batch.supplier?.name ?? "—"} />
        <Fact label="მიღება" value={formatDateOnly(batch.receivedOn)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ეტაპი</CardTitle>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ეტაპის შეცვლა ნაშთს არ ამრავლებს.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            მზადყოფნა: {batch.expectedReadyOn ? formatDateOnly(batch.expectedReadyOn) : "—"}
            {batch.notes ? ` · ${batch.notes}` : ""}
          </p>
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              {STAGES.map(([code, label]) => (
                <form key={code} action={advanceBatchAction.bind(null, batch.id, code)}>
                  <Button type="submit" variant={batch.stage === code ? "default" : "secondary"} size="sm">
                    {label}
                  </Button>
                </form>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-gray-800 dark:text-white/90">{value}</p>
    </Card>
  );
}

function formatQty(value: { toString(): string }) {
  const text = value.toString();
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}
