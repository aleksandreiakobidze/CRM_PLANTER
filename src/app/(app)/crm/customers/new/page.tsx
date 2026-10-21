import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { CustomerFields } from "@/components/customer-fields";
import { createCustomerAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { listPlaceOptions, selectOptions } from "@/server/features/crm/place-terms";

export default async function NewCustomerPage() {
  const actor = await getActor();
  const places = await listPlaceOptions(actor.organizationId);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/crm/customers">კლიენტები</Link>
        <h1>ახალი კლიენტი</h1>
        <p>ობიექტი, ზონა და პრიორიტეტი აქვე ივსება. ქუჩა შენახვის შემდეგ მისამართების ტაბში ემატება.</p>
      </div>
      <div className="card doc-card">
        <BoundForm action={createCustomerAction} label="შენახვა">
          <CustomerFields
            placeName="ობიექტი"
            mapFallback=""
            places={{
              venueTypes: selectOptions(places.venue_type),
              districts: selectOptions(places.district),
              cities: selectOptions(places.city),
              regions: selectOptions(places.region),
            }}
          />
        </BoundForm>
      </div>
    </section>
  );
}
