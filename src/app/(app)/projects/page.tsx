import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

const STATUS: Record<string, string> = {
  draft: "დრაფტი",
  quoted: "შეთავაზება",
  in_progress: "მიმდინარე",
  received: "მიღებული",
  closed: "დახურული",
};

export default async function ProjectsPage() {
  const actor = await getActor();
  const projects = await getDb().greeningProject.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <section className="grid">
      <div className="row">
        <h1>გამწვანება</h1>
        <div className="actions">
          <Link className="button" href="/projects/new">ახალი პროექტი</Link>
        </div>
      </div>
      <RecordList
        storageKey="projects"
        empty="პროექტი ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "customer", header: "კლიენტი" },
          { key: "status", header: "სტატუსი" },
          { key: "budget", header: "ბიუჯეტი" },
        ]}
        rows={projects.map((project) => ({
          id: project.id,
          cells: {
            number: <Link href={`/projects/${project.id}`}>{project.number}</Link>,
            customer: project.customer.name,
            status: STATUS[project.status] ?? project.status,
            budget: `${project.budgetAmount.toString()} ₾`,
          },
        }))}
      />
    </section>
  );
}
