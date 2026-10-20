import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { projectExpenseAction, projectMaintenanceAction, projectStatusAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { projectActual } from "@/server/features/projects/project-service";
import { tbilisiDateString } from "@/server/time";

const KIND: Record<string, string> = { material: "მასალა", labor: "სამუშაო", transport: "ტრანსპორტი" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const project = await getDb().greeningProject.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { customer: true, lines: true },
  });
  if (!project) notFound();
  const actual = await projectActual(actor.organizationId, project.id);
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/projects">გამწვანება</Link>
        <h1>{project.number}</h1>
        <p>{project.customer.name} · {project.status}</p>
      </div>
      <div className="card">
        <p>ობიექტი: {project.siteNotes ?? "—"}</p>
        <p>სინათლე: {project.lightNotes ?? "—"}</p>
        <table>
          <tbody>
            {project.lines.map((line) => (
              <tr key={line.id}><td>{KIND[line.kind] ?? line.kind}</td><td>{line.description}</td><td>{line.amount.toString()} ₾</td></tr>
            ))}
          </tbody>
        </table>
        <p>ბიუჯეტი: {project.budgetAmount.toString()} ₾</p>
        <p>ფაქტი: {actual.toFixed(2)} ₾</p>
        <div className="row">
          <form action={projectStatusAction.bind(null, project.id, "quoted")}><button className="secondary" type="submit">შეთავაზება</button></form>
          <form action={projectStatusAction.bind(null, project.id, "in_progress")}><button className="secondary" type="submit">მიმდინარე</button></form>
          <form action={projectStatusAction.bind(null, project.id, "received")}><button type="submit">მიღება</button></form>
        </div>
      </div>
      <div className="card">
        <h2>ფაქტობრივი ხარჯი</h2>
        <BoundForm action={projectExpenseAction} label="დაფიქსირება">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
          <label>კატეგორია
            <ComboBox name="category" options={[{ value: "material", label: "მასალა" }, { value: "labor", label: "სამუშაო" }, { value: "transport", label: "ტრანსპორტი" }]} />
          </label>
          <label>თანხა<input name="amount" required /></label>
        </BoundForm>
      </div>
      {project.status === "received" ? (
        <div className="card">
          <h2>მოვლის კონტრაქტი</h2>
          <BoundForm action={projectMaintenanceAction} label="კონტრაქტის შექმნა">
            <input type="hidden" name="projectId" value={project.id} />
            <label>დაწყება<input name="startOn" type="date" required defaultValue={tbilisiDateString()} /></label>
            <label>პროცენტი<input name="percent" defaultValue="10" /></label>
          </BoundForm>
        </div>
      ) : null}
    </section>
  );
}
