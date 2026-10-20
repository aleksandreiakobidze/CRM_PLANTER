import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { CustomerFields } from "@/components/customer-fields";
import { createCustomerAction } from "@/server/actions/work-actions";

export default function NewCustomerPage() {
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/crm/customers">კლიენტები</Link>
        <h1>ახალი კლიენტი</h1>
        <p>ობიექტი, ზონა და პრიორიტეტი აქვე ივსება. ქუჩა შენახვის შემდეგ მისამართების ტაბში ემატება.</p>
      </div>
      <div className="card doc-card">
        <BoundForm action={createCustomerAction} label="შენახვა">
          <CustomerFields placeName="ობიექტი" mapFallback="" />
        </BoundForm>
      </div>
    </section>
  );
}
