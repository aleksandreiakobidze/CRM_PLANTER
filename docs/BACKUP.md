# სარეზერვო ასლი

ეს ინსტრუქცია ლოკალური PostgreSQL-ისთვისაა (`npm run db:up`, პორტი 5432, მომხმარებელი `planter`, ბაზა `planter`). Hostinger-ზე restore ამ სესიაში შესრულებულად არ ითვლება.

## Dump

```bash
pg_dump --no-owner --format=custom --file=planter.dump postgresql://planter:planter@127.0.0.1:5432/planter
```

ან SQL:

```bash
pg_dump --no-owner --file=planter.sql postgresql://planter:planter@127.0.0.1:5432/planter
```

ფაილს ინახავთ ორგანიზაციის სარეზერვო ადგილზე, არა რეპოზიტორიაში.

## Restore

ახალი ცარიელი ბაზა:

```bash
pg_restore --no-owner --dbname=postgresql://planter:planter@127.0.0.1:5432/planter planter.dump
```

SQL dump:

```bash
psql postgresql://planter:planter@127.0.0.1:5432/planter -f planter.sql
```

შემდეგ:

```bash
npx prisma migrate deploy
```

Restore-ის შემდეგ შეამოწმეთ შესვლა და ერთი ინვოისი / ნაშთი. პაროლები dump-ში ჰეშირებულია; `.env` ცალკე ინახება და git-ში არ შედის.
