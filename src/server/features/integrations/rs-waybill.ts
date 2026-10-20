const ENDPOINT = "https://services.rs.ge/WayBillService/WayBillService.asmx";

export type WaybillGood = {
  name: string;
  quantity: string;
  price: string;
  amount: string;
  barCode: string;
  vatType: number;
};

export type WaybillDraft = {
  id: number;
  type: 1 | 2 | 3;
  buyerTin: string;
  buyerName: string;
  startAddress: string;
  endAddress: string;
  driverTin: string;
  driverName: string;
  carNumber: string;
  transportText: string;
  beginDate: string;
  fullAmount: string;
  goods: WaybillGood[];
};

export type WaybillUpload =
  | { ok: true; id: string; number: string }
  | { ok: false; id?: string; message: string };

type Transport = (action: string, envelope: string) => Promise<string>;

async function defaultTransport(action: string, envelope: string): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"http://tempuri.org/${action}"`,
    },
    body: envelope,
  });
  return response.text();
}

let transport: Transport = defaultTransport;

export function setWaybillTransport(next: Transport | null): void {
  transport = next ?? defaultTransport;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function envelope(action: string, inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${action} xmlns="http://tempuri.org/">
      ${inner}
    </${action}>
  </soap:Body>
</soap:Envelope>`;
}

function tag(body: string, name: string): string {
  const match = body.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match?.[1]?.trim() ?? "";
}

function waybillXml(draft: WaybillDraft): string {
  const goods = draft.goods
    .map(
      (good) => `<GOODS>
        <ID>0</ID>
        <W_NAME>${xml(good.name)}</W_NAME>
        <UNIT_ID>99</UNIT_ID>
        <UNIT_TXT>ცალი</UNIT_TXT>
        <QUANTITY>${xml(good.quantity)}</QUANTITY>
        <PRICE>${xml(good.price)}</PRICE>
        <AMOUNT>${xml(good.amount)}</AMOUNT>
        <BAR_CODE>${xml(good.barCode)}</BAR_CODE>
        <A_ID>0</A_ID>
        <VAT_TYPE>${good.vatType}</VAT_TYPE>
        <STATUS>1</STATUS>
      </GOODS>`,
    )
    .join("");
  return `<WAYBILL>
    <ID>${draft.id}</ID>
    <TYPE>${draft.type}</TYPE>
    <BUYER_TIN>${xml(draft.buyerTin)}</BUYER_TIN>
    <CHEK_BUYER_TIN>1</CHEK_BUYER_TIN>
    <BUYER_NAME>${xml(draft.buyerName)}</BUYER_NAME>
    <START_ADDRESS>${xml(draft.startAddress)}</START_ADDRESS>
    <END_ADDRESS>${xml(draft.endAddress)}</END_ADDRESS>
    <DRIVER_TIN>${xml(draft.driverTin)}</DRIVER_TIN>
    <CHEK_DRIVER_TIN>1</CHEK_DRIVER_TIN>
    <DRIVER_NAME>${xml(draft.driverName)}</DRIVER_NAME>
    <TRANSPORT_COAST>0</TRANSPORT_COAST>
    <CAR_NUMBER>${xml(draft.carNumber)}</CAR_NUMBER>
    <TRANS_TXT>${xml(draft.transportText)}</TRANS_TXT>
    <BEGIN_DATE>${xml(draft.beginDate)}</BEGIN_DATE>
    <STATUS>1</STATUS>
    <FULL_AMOUNT>${xml(draft.fullAmount)}</FULL_AMOUNT>
    <GOODS_LIST>${goods}</GOODS_LIST>
  </WAYBILL>`;
}

function rsMessage(body: string, fallback: string): string {
  return tag(body, "ERROR") || tag(body, "TEXT") || tag(body, "faultstring") || fallback;
}

export function vatTypeFor(taxMode: string): number | null {
  if (taxMode === "inclusive" || taxMode === "exclusive") return 0;
  if (taxMode === "zero_rate") return 1;
  if (taxMode === "exempt") return 2;
  return null;
}

export async function uploadWaybill(credentials: { su: string; sp: string }, draft: WaybillDraft): Promise<WaybillUpload> {
  try {
    const savedBody = await transport(
      "save_waybill",
      envelope(
        "save_waybill",
        `<su>${xml(credentials.su)}</su><sp>${xml(credentials.sp)}</sp><waybill>${waybillXml(draft)}</waybill>`,
      ),
    );
    const status = Number(tag(savedBody, "STATUS"));
    const id = tag(savedBody, "ID");
    if (!Number.isFinite(status) || status < 0 || !id || Number(id) <= 0) {
      return { ok: false, id: id || undefined, message: rsMessage(savedBody, `RS შეცდომა ${Number.isFinite(status) ? status : ""}`.trim()) };
    }
    const sentBody = await transport(
      "send_waybill",
      envelope("send_waybill", `<su>${xml(credentials.su)}</su><sp>${xml(credentials.sp)}</sp><waybill_id>${id}</waybill_id>`),
    );
    const number = tag(sentBody, "send_waybillResult") || tag(sentBody, "string");
    if (!number || number.startsWith("-") || Number(number) < 0) {
      return { ok: false, id, message: rsMessage(sentBody, number ? `RS შეცდომა ${number}` : "RS-მ ზედნადების ნომერი არ დააბრუნა") };
    }
    return { ok: true, id, number };
  } catch {
    return { ok: false, message: "RS კავშირი ვერ შედგა" };
  }
}
