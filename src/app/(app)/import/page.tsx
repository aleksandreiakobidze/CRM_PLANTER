import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { importCustomersAction, importPreviewAction } from "@/server/actions/work-actions";

const PREVIEW_KINDS = [
  { value: "customers", label: "კლიენტები" },
  { value: "products", label: "პროდუქტები" },
  { value: "opening", label: "საწყისი ნაშთი" },
];
const CONFIRM_KINDS = [
  { value: "customers", label: "კლიენტები" },
  { value: "opening", label: "საწყისი ნაშთი" },
];

export default function ImportPage() {
  return (
    <section className="grid">
      <div className="page-head">
        <h1>იმპორტი</h1>
        <p>ჯერ იხილეთ dry run. დადასტურება მონაცემს წერს ერთხელ. იგივე ფაილის გამეორება ასლს არ ქმნის.</p>
      </div>
      <div className="card">
        <h2>შემოწმება</h2>
        <BoundForm action={importPreviewAction} label="Dry run">
          <label>ტიპი<ComboBox name="kind" options={PREVIEW_KINDS} defaultValue="customers" /></label>
          <label>ფაილი<input name="file" type="file" accept=".xlsx" required /></label>
        </BoundForm>
      </div>
      <div className="card">
        <h2>დადასტურება</h2>
        <BoundForm action={importCustomersAction} label="გატარება">
          <label>ტიპი<ComboBox name="kind" options={CONFIRM_KINDS} defaultValue="customers" /></label>
          <label>ფაილი<input name="file" type="file" accept=".xlsx" required /></label>
        </BoundForm>
      </div>
    </section>
  );
}
