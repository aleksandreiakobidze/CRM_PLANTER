import Link from "next/link";
import { Fold } from "@/components/fold";
import { ShortcutGrid } from "@/components/shortcut-grid";
import { canSeeSalesTotals } from "@/server/auth/permissions";
import { getActor } from "@/server/auth/session";
import { myDay } from "@/server/features/crm/customer-service";
import { salesDashboard } from "@/server/features/reports/dashboard-service";
import { formatDateOnly, periodBounds, tbilisiDateString } from "@/server/time";

const MONTHS = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"];

const SHORTCUTS = [
  { href: "/work", title: "ჩემი სამუშაო", text: "დავალებები და გადასარეკი" },
  { href: "/calendar", title: "კალენდარი", text: "ვადები, ჯავშნები, ექსკურსია" },
  { href: "/crm/customers", title: "კლიენტები", text: "სია, სტატუსი, ძებნა" },
  { href: "/crm/customers/new", title: "ახალი კლიენტი", text: "კომპანია ან პირი" },
  { href: "/sales/quotes/new", title: "შეთავაზება", text: "ფასი მარაგს არ ცვლის" },
  { href: "/sales/orders/new", title: "შეკვეთა", text: "ჰედერი და ხაზები" },
  { href: "/finance/invoices", title: "ინვოისები", text: "დარიცხული და გადახდა" },
  { href: "/rental/new", title: "გაქირავება", text: "ახალი ჯავშანი" },
  { href: "/excursions/new", title: "ექსკურსია", text: "ჯგუფის ჩაწერა" },
  { href: "/purchases", title: "შესყიდვები", text: "PO და მიღება" },
  { href: "/greenhouse", title: "სათბური", text: "პარტია და გადარგვა" },
  { href: "/delivery", title: "მიწოდება", text: "მარშრუტი და გაჩერება" },
  { href: "/reports", title: "რეპორტები", text: "KPI და Excel" },
];

export default async function HomePage() {
  const actor = await getActor();
  const today = tbilisiDateString();
  const month = today.slice(0, 7);
  const bounds = periodBounds(month);
  const [data, day] = await Promise.all([
    canSeeSalesTotals(actor) ? salesDashboard(actor, bounds.start, bounds.end) : Promise.resolve(null),
    myDay(actor),
  ]);
  const monthName = MONTHS[Number(month.slice(5)) - 1];
  return (
    <section className="grid">
      <div className="page-head">
        <h1>მთავარი</h1>
        <p>{Number(today.slice(8))} {monthName}.{data ? " ჯამები ამ თვისაა." : " დღევანდელი სამუშაო აქ არის."}</p>
      </div>
      {data ? (
        <div className="metrics">
          <article className="card metric"><h2>გაყიდული</h2><p>{data.sold} ₾</p><small>მიწოდებული შეკვეთა</small></article>
          <article className="card metric"><h2>დარიცხული</h2><p>{data.invoiced} ₾</p><small>გატარებული ინვოისი</small></article>
          <article className="card metric"><h2>შემოსული</h2><p>{data.received} ₾</p><small>რეალური გადახდა</small></article>
          <article className="card metric"><h2>მთლიანი მარჟა</h2><p>{data.grossMargin} ₾</p><small>გაყიდვა მინუს თვითღირებულება</small></article>
        </div>
      ) : (
        <p className="card">ამ როლს თვის ჯამები არ უჩანს. დავალება და კალენდარი მაინც ხელმისაწვდომია.</p>
      )}
      <div className="split">
        <section className="card today-panel">
          <h2 className="block-title">დღეს გადასარეკი · {day.contacts.length}</h2>
          {day.contacts.length === 0 ? <p className="muted">დღეს გადასარეკი არ არის.</p> : (
            <div className="results">
              {day.contacts.slice(0, 6).map((customer) => (
                <Link key={customer.id} href={`/crm/customers/${customer.id}`}>
                  {customer.name}
                  <small>{customer.nextContactOn ? formatDateOnly(customer.nextContactOn) : ""}</small>
                </Link>
              ))}
            </div>
          )}
          {day.contacts.length > 6 ? <Link href="/work">ყველა გადასარეკი</Link> : null}
        </section>
        <section className="card today-panel">
          <h2 className="block-title">ღია დავალება დღეს · {day.tasks.length}</h2>
          {day.tasks.length === 0 ? <p className="muted">ვადიანი ღია დავალება არ გაქვს.</p> : (
            <div className="results">
              {day.tasks.slice(0, 6).map((task) => (
                <Link key={task.id} href={`/work/${task.id}`}>
                  {task.title}
                  <small>{task.customer?.name ?? "კლიენტის გარეშე"}</small>
                </Link>
              ))}
            </div>
          )}
          <Link href="/work">დაფის გახსნა</Link>
        </section>
      </div>
      <section>
        <h2 className="block-title">სწრაფი გზა</h2>
        <ShortcutGrid items={SHORTCUTS} />
      </section>
      {data ? (
      <Fold id="home-numbers" title="რას ნიშნავს ეს რიცხვები" defaultOpen={false}>
        <p>გაყიდული, დარიცხული და შემოსული ცალ-ცალკეა. დეპოზიტი არც ერთში არ შედის. მარჟა საოპერაციო ხარჯამდეა.</p>
      </Fold>
      ) : null}
    </section>
  );
}
