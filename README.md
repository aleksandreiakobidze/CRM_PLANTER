# Planter CRM

ქართული მცენარეების ბიზნესის სამუშაო სისტემა: კლიენტი, პროდუქტი, ნაშთი, შეთავაზება, შეკვეთა, მიწოდება, ინვოისი, გადახდა, გაქირავება, მოვლის 10% და ექსკურსია.

ეს არ არის დასრულებული სისტემა. ეტაპები 3–5 (შესყიდვა, სათბური, პორტალი, რეალური გადახდა/ელფოსტა/RS, AI) არ არის ჩართული. იხილეთ `docs/HANDOFF.md` და `docs/REQUIREMENTS_MATRIX.md`.

## ლოკალური გაშვება

ამ მანქანაზე Docker არ არის საჭირო. PostgreSQL ადის ჩაშენებული ბინარით:

```bash
npm install
npm run db:up
```

მეორე ტერმინალში:

```bash
npx prisma migrate deploy
npm run dev
npm run worker
```

პირველი ადმინი:

```bash
npm run admin:invite -- admin@planter.ge "Planter"
```

ბრძანება დაბეჭდავს ერთჯერად ბმულს. საჯარო რეგისტრაცია არ არის.

დემო მონაცემი მხოლოდ მაშინ იქმნება, თუ `SEED_DEMO=true`, `NODE_ENV` არ არის `production` და `DEMO_PASSWORD` მინიმუმ 10 სიმბოლოა:

```bash
set SEED_DEMO=true
set DEMO_PASSWORD=Demo-Only-2026!
npm run demo:seed
```

`production`-ში ეს ბრძანება უარს ამბობს. დემო პაროლი რეპოზიტორიაში არ ინახება.

## ტესტები

```bash
npm test
```

ტესტი თავის PostgreSQL-ს წამოიწყებს `data/pg-test`-ში. Production ბაზას არ იყენებს.

## Hostinger VPS

`docker-compose.yml` აყენებს PostgreSQL-ს, აპს და worker-ს. ატვირთვამდე შეცვალეთ `SESSION_SECRET`. `SEED_DEMO` production-ში `false` უნდა დარჩეს. რეალური გაგზავნა, ბანკი და RS ამ იმიჯში არ სრულდება.

## დოკუმენტები

- `docs/PLANTER_CRM_SPEC.md` — სრული მოთხოვნა
- `docs/DECISIONS.md` — ტექნიკური არჩევანი
- `docs/IMPLEMENTATION_PLAN.md` — ეტაპები
- `docs/REQUIREMENTS_MATRIX.md` — სტატუსი
- `docs/ERD.md` — მოდელები
- `docs/METRICS.md` — თანხების განმარტება
- `docs/HANDOFF.md` — სად გაჩერდა სამუშაო
