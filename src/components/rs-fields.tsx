export type RsFieldValues = {
  waybillType?: number | null;
  driverTin?: string | null;
  driverName?: string | null;
  carNumber?: string | null;
  transportText?: string | null;
  startAddress?: string | null;
  endAddress?: string | null;
  beginOn?: string | null;
};

export function RsFields({
  values,
  beginDefault,
  saleType = false,
  invoiceDefault = false,
}: {
  values?: RsFieldValues;
  beginDefault: string;
  saleType?: boolean;
  invoiceDefault?: boolean;
}) {
  const begin = values?.beginOn || beginDefault;
  return (
    <>
      {saleType ? (
        <label>
          ტრანსპორტირების ტიპი
          <select name="waybillType" defaultValue={String(values?.waybillType ?? 2)}>
            <option value="2">მიწოდება ტრანსპორტირებით</option>
            <option value="3">მიწოდება ტრანსპორტირების გარეშე</option>
          </select>
        </label>
      ) : (
        <input type="hidden" name="waybillType" value="1" />
      )}
      <label>მძღოლის პირადი ნომერი<input name="driverTin" required defaultValue={values?.driverTin ?? ""} /></label>
      <label>მძღოლის სახელი<input name="driverName" required defaultValue={values?.driverName ?? ""} /></label>
      <label>მანქანის ნომერი<input name="carNumber" required defaultValue={values?.carNumber ?? ""} /></label>
      <label>ტრანსპორტის ტექსტი<input name="transportText" defaultValue={values?.transportText ?? ""} /></label>
      <label>დაწყების მისამართი<input name="startAddress" required defaultValue={values?.startAddress ?? ""} /></label>
      <label>დასრულების მისამართი<input name="endAddress" required defaultValue={values?.endAddress ?? ""} /></label>
      <label>დაწყების თარიღი<input name="beginOn" type="date" required defaultValue={begin} /></label>
      {saleType ? (
        <label>
          <input name="createInvoice" type="checkbox" defaultChecked={invoiceDefault} /> ინვოისის შექმნა
        </label>
      ) : null}
    </>
  );
}
