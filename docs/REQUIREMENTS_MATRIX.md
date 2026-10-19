# მოთხოვნების მატრიცა

სტატუსი: `not_started`, `partial`, `verified`. `verified` იწერება მხოლოდ გაშვებული ტესტის შემდეგ. ეს ფაილი სესიის ბოლოს ახლდება ფაქტობრივი შედეგით.

| ID | მოთხოვნა | ეტაპი | სტატუსი | მტკიცებულება |
| --- | --- | --- | --- | --- |
| F-00-01 | ქართული შესვლა, ბაზის სესია, გათიშვა | 0 | verified | tests/integration/permissions.test.ts, tests/e2e/sales-path.spec.ts |
| F-00-02 | როლები და სერვერზე შემოწმებული უფლება | 0 | verified | tests/integration/permissions.test.ts |
| F-00-03 | invite bootstrap, საჯარო რეგისტრაციის გარეშე | 0 | partial | scripts/invite-admin.ts |
| F-00-04 | ფული decimal-ით, დრო Asia/Tbilisi | 0 | verified | tests/unit/money-time.test.ts |
| F-00-05 | audit პაროლის გარეშე | 0 | partial | src/server/audit.ts |
| F-01-01 | კლიენტი, ტელეფონი, დუბლიკატის გაფრთხილება | 1 | verified | tests/integration/crm.test.ts |
| F-01-02 | პროდუქტი, სახეობის aliases | 1 | verified | tests/integration/import.test.ts |
| F-01-03 | opening stock movement | 1 | verified | tests/integration/stock.test.ts |
| F-01-04 | შეთავაზება ერთხელ ხდება შეკვეთა | 1 | verified | tests/integration/sales.test.ts |
| F-01-05 | დადასტურება რეზერვავს, მიწოდება ერთხელ ჩამოწერს, ინვოისი არა | 1 | verified | tests/integration/sales.test.ts |
| F-01-06 | კონკურენტული ნაშთი 5 vs 4+4 | 1 | verified | tests/integration/stock.test.ts |
| F-01-07 | გაუქმება რეზერვს ერთხელ ათავისუფლებს; expiry დადასტურებულს არ ეხება | 1 | verified | tests/integration/stock.test.ts |
| F-01-08 | ინვოისის PDF snapshot და ქართული ტექსტი | 1 | verified | tests/integration/invoice-pdf.test.ts, tests/e2e/sales-path.spec.ts |
| F-01-09 | ნაწილობრივი გადახდა და ზედმეტი ალოკაციის ბლოკი | 1 | verified | tests/integration/payments.test.ts |
| F-01-10 | ფასის snapshot კატალოგის ცვლილების შემდეგ | 1 | verified | tests/integration/sales.test.ts |
| F-01-11 | Excel dry-run და batch-ის ერთჯერადი დადასტურება | 1 | verified | tests/integration/import.test.ts |
| F-01-12 | დაშბორდი: გაყიდული, დარიცხული, შემოსული ცალკე | 1 | verified | tests/integration/payments.test.ts |
| F-01-13 | დავალება, ჩემი დღე, ურთიერთობის სტატუსი | 1 | verified | tests/integration/crm.test.ts |
| F-02-01 | 21–23 ნოემბერი = 3 დღე; overlap იბლოკება | 2 | verified | tests/integration/rental.test.ts |
| F-02-02 | გაცემა არის გადატანა; დეპოზიტი შემოსავალი არ არის | 2 | verified | tests/integration/rental.test.ts |
| F-02-03 | მოვლა 1000 × 10% = 100; ძველი ინვოისი არ იცვლება | 2 | verified | tests/integration/maintenance.test.ts |
| F-02-04 | თვიური დარიცხვა ერთ draft-ს ქმნის; პაუზა აჩერებს მომავალს | 2 | verified | tests/integration/maintenance.test.ts |
| F-02-05 | ჩანაცვლება ბაზას არ აორმაგებს | 2 | verified | tests/integration/maintenance.test.ts |
| F-02-06 | ექსკურსია 13:00–16:00 და ტევადობა | 2 | verified | tests/integration/excursion.test.ts |
| F-02-07 | მასალა 20 დაჯავშნა, 18 მოხმარება, 2 გათავისუფლება | 2 | verified | tests/integration/excursion.test.ts |
| F-03-01 | შესყიდვა, landed cost, სათბური, მარშრუტი | 3 | not_started | — |
| F-04-01 | პორტალი, PWA offline, სრული რეპორტები | 4 | not_started | — |
| F-05-01 | რეალური email/payment/RS/AI | 5 | not_started | adapter status not_configured |
