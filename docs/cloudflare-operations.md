# Cloudflare operations cheat sheet — portal-api

See fail on kiire praktiline spikker `portal-api` Cloudflare Workeri, D1 andmebaasi ja võimalike R2 bucketite haldamiseks.

Projektis kasutatav põhikonfiguratsioon:

- Worker/API project: `portal-api`
- D1 database: `portal-db`
- D1 migrations folder: `migrations/`
- local/dev seed data: `dev-data/seed.sql`
- Cloudflare config: `wrangler.toml` või `wrangler.jsonc`

> Reegel: `wrangler.toml` / `wrangler.jsonc` peaks olema Cloudflare resource bindingute source of truth. Kui lisad D1, R2 või muu Cloudflare resource’i, lisa see configusse ja commiti muudatus repo’sse.

---

## 1. Local development

Käivita Worker lokaalselt:

```bash
npm run dev
```

või otse:

```bash
npx wrangler dev
```

Kui `wrangler.toml` / `wrangler.jsonc` failis on Workeri entrypoint määratud, ei pea seda käsus eraldi ette andma.

---

## 2. D1 — üldinfo

Listi kõik Cloudflare konto D1 andmebaasid:

```bash
npx wrangler d1 list
```

Vaata remote D1 andmebaasi infot:

```bash
npx wrangler d1 info portal-db
```

See annab üldise info remote andmebaasi kohta, näiteks andmebaasi ID, suurus ja muu olekuinfo.

---

## 3. D1 — migratsioonid

D1 migratsioonid on `.sql` failid `migrations/` kaustas. Neid kasutatakse DB schema versioneerimiseks.

### Uue migratsiooni loomine

```bash
npx wrangler d1 migrations create portal-db add_some_table
```

See loob uue faili `migrations/` kausta, näiteks:

```text
0003_add_some_table.sql
```

Seejärel kirjuta sinna vajalik SQL, näiteks:

```sql
CREATE TABLE example_table (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### Lokaalsete migratsioonide kontrollimine

Vaata, millised migratsioonid on lokaalses D1 DB-s juba rakendatud või rakendamata:

```bash
npx wrangler d1 migrations list portal-db --local
```

Rakenda migratsioonid lokaalsesse D1 DB-sse:

```bash
npx wrangler d1 migrations apply portal-db --local
```

---

### Remote migratsioonide kontrollimine

Vaata, millised migratsioonid on remote D1 DB-s juba rakendatud või rakendamata:

```bash
npx wrangler d1 migrations list portal-db --remote
```

Rakenda migratsioonid remote D1 DB-sse:

```bash
npx wrangler d1 migrations apply portal-db --remote
```

---

### Soovitatud migratsiooni workflow

Kõigepealt loo migratsioon:

```bash
npx wrangler d1 migrations create portal-db add_some_change
```

Seejärel muuda loodud SQL faili `migrations/` kaustas.

Rakenda migratsioon lokaalselt:

```bash
npx wrangler d1 migrations apply portal-db --local
```

Käivita Worker ja testi API-d:

```bash
npm run dev
```

Kui lokaalselt kõik toimib, rakenda migratsioon remote DB-sse:

```bash
npx wrangler d1 migrations apply portal-db --remote
```

Seejärel deploy Worker:

```bash
npx wrangler deploy
```

---

## 4. D1 — seed / mock data lokaalselt

Projektis on local/dev seed data fail:

```text
dev-data/seed.sql
```

Lisa mock/test data lokaalsesse D1 DB-sse:

```bash
npx wrangler d1 execute portal-db --local --file=dev-data/seed.sql
```

Kui soovid enne seedimist lokaalsele DB-le migratsioonid rakendada:

```bash
npx wrangler d1 migrations apply portal-db --local
npx wrangler d1 execute portal-db --local --file=dev-data/seed.sql
```

> Soovitus: `dev-data/seed.sql` peaks olema mõeldud ainult local/dev kasutuseks. Ära jooksuta seda production/remote DB peal, kui failis on testandmed või destructive käsud.

---

## 5. D1 — SQL käsud lokaalse DB vastu

Vaata lokaalse DB tabeleid:

```bash
npx wrangler d1 execute portal-db --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Vaata `offers` tabeli ridu:

```bash
npx wrangler d1 execute portal-db --local --command="SELECT * FROM offers LIMIT 10;"
```

Vaata `leads` tabeli ridu:

```bash
npx wrangler d1 execute portal-db --local --command="SELECT * FROM leads LIMIT 10;"
```

Vaata `blog_posts` tabeli ridu:

```bash
npx wrangler d1 execute portal-db --local --command="SELECT * FROM blog_posts LIMIT 10;"
```

---

## 6. D1 — SQL käsud remote DB vastu

Remote DB vastu käskude jooksutamisel ole ettevaatlik.

Vaata remote DB tabeleid:

```bash
npx wrangler d1 execute portal-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Vaata remote `offers` tabelit:

```bash
npx wrangler d1 execute portal-db --remote --command="SELECT * FROM offers LIMIT 10;"
```

Vaata remote `leads` tabelit:

```bash
npx wrangler d1 execute portal-db --remote --command="SELECT * FROM leads LIMIT 10;"
```

---

## 7. D1 — SQL faili jooksutamine

Jooksuta SQL fail lokaalse DB vastu:

```bash
npx wrangler d1 execute portal-db --local --file=path/to/file.sql
```

Jooksuta SQL fail remote DB vastu:

```bash
npx wrangler d1 execute portal-db --remote --file=path/to/file.sql
```

Remote käsu puhul kontrolli fail enne üle, eriti kui selles on:

- `DROP TABLE`
- `DELETE`
- `UPDATE`
- `INSERT` testandmetega
- schema muudatused

---

## 8. D1 — export / backup

Ekspordi local DB SQL faili:

```bash
npx wrangler d1 export portal-db --local --output=backup-local.sql
```

Ekspordi remote DB SQL faili:

```bash
npx wrangler d1 export portal-db --remote --output=backup-remote.sql
```

Soovitus enne suuremaid remote schema muudatusi:

```bash
npx wrangler d1 export portal-db --remote --output=backup-before-migration.sql
npx wrangler d1 migrations apply portal-db --remote
```

---

## 9. Worker deploy

Deploy remote Cloudflare Workerisse:

```bash
npx wrangler deploy
```

Kui `package.json` sisaldab deploy scripti:

```bash
npm run deploy
```

Soovitatud deploy flow:

```bash
npm run type-check
npm run build
npx wrangler d1 migrations apply portal-db --remote
npx wrangler deploy
```

Kui projektis pole eraldi build või type-check sammu, siis minimaalne flow:

```bash
npx wrangler d1 migrations apply portal-db --remote
npx wrangler deploy
```

---

## 10. Worker logs

Vaata remote Workeri live logisid:

```bash
npx wrangler tail
```

Kui on mitu Workerit või vaja täpsustada:

```bash
npx wrangler tail portal-api
```

See on kasulik production/debug olukordades, näiteks kui API endpoint annab vea, aga lokaalselt töötab.

---

## 11. Uue D1 DB lisamine

Loo uus D1 database:

```bash
npx wrangler d1 create new-db-name
```

Cloudflare tagastab loodud DB info, sealhulgas `database_id`.

Lisa uus DB binding `wrangler.toml` faili:

```toml
[[d1_databases]]
binding = "DB"
database_name = "portal-db"
database_id = "<DATABASE_ID>"
```

Kui lisad teise DB:

```toml
[[d1_databases]]
binding = "ANOTHER_DB"
database_name = "new-db-name"
database_id = "<NEW_DATABASE_ID>"
```

Worker koodis kasutatakse binding nime, näiteks:

```ts
env.DB
env.ANOTHER_DB
```

---

## 12. R2 bucket lisamine

Loo uus R2 bucket:

```bash
npx wrangler r2 bucket create portal-assets
```

Lisa bucket binding `wrangler.toml` faili:

```toml
[[r2_buckets]]
binding = "ASSETS_BUCKET"
bucket_name = "portal-assets"
```

Worker koodis kasutatakse binding nime, näiteks:

```ts
env.ASSETS_BUCKET
```

---

## 13. R2 bucketite vaatamine

Listi R2 bucketid:

```bash
npx wrangler r2 bucket list
```

Kui bucket on loodud ja binding configusse lisatud, saab Worker selle kaudu faile lugeda/kirjutada.

Näited võimalikest bucketitest selle projekti puhul:

```text
portal-assets
portal-blog-images
portal-offer-images
```

Soovitus MVP jaoks: alusta ühe bucketiga, näiteks:

```text
portal-assets
```

ja jaga failid prefixite abil:

```text
blog/
offers/
uploads/
```

Näiteks:

```text
blog/2026/my-blog-image.webp
offers/orihuela-costa-playa-flamenca/cover.webp
uploads/admin/some-file.webp
```

---

## 14. Secrets ja environment variables

Local development secretid hoia `.dev.vars` failis:

```env
OPENAI_API_KEY="..."
SOME_API_TOKEN="..."
```

Ära commiti `.dev.vars` faili.

Production secret lisa Wrangleriga:

```bash
npx wrangler secret put OPENAI_API_KEY
```

Seejärel sisesta väärtus terminalis.

Kui vaja lisada teine secret:

```bash
npx wrangler secret put SOME_API_TOKEN
```

Worker koodis kasutatakse neid `env` kaudu:

```ts
env.OPENAI_API_KEY
env.SOME_API_TOKEN
```

---

## 15. Wrangler config näide

Näide `wrangler.toml` D1 ja R2 bindingutega:

```toml
name = "portal-api"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[[d1_databases]]
binding = "DB"
database_name = "portal-db"
database_id = "<DATABASE_ID>"

[[r2_buckets]]
binding = "ASSETS_BUCKET"
bucket_name = "portal-assets"
```

Kui kasutad `wrangler.jsonc`, siis sama idee JSON kujul:

```jsonc
{
  "name": "portal-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "portal-db",
      "database_id": "<DATABASE_ID>"
    }
  ],
  "r2_buckets": [
    {
      "binding": "ASSETS_BUCKET",
      "bucket_name": "portal-assets"
    }
  ]
}
```

---

## 16. Soovitatud npm scripts

Soovi korral lisa `package.json` alla mugavuskäsud:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",

    "db:list": "wrangler d1 list",
    "db:info": "wrangler d1 info portal-db",

    "db:migrations:list:local": "wrangler d1 migrations list portal-db --local",
    "db:migrations:apply:local": "wrangler d1 migrations apply portal-db --local",

    "db:migrations:list:remote": "wrangler d1 migrations list portal-db --remote",
    "db:migrations:apply:remote": "wrangler d1 migrations apply portal-db --remote",

    "db:seed:local": "wrangler d1 execute portal-db --local --file=dev-data/seed.sql",

    "db:tables:local": "wrangler d1 execute portal-db --local --command=\"SELECT name FROM sqlite_master WHERE type='table';\"",
    "db:tables:remote": "wrangler d1 execute portal-db --remote --command=\"SELECT name FROM sqlite_master WHERE type='table';\"",

    "logs": "wrangler tail"
  }
}
```

Siis saad kasutada näiteks:

```bash
npm run db:migrations:apply:local
npm run db:seed:local
npm run dev
npm run deploy
```

---

## 17. Typical local reset flow

Kui tahad local DB uuesti nullist üles ehitada, siis sõltub täpne käsk sellest, kus Wrangler local DB faile hoiab.

Kõige turvalisem üldine flow:

```bash
npx wrangler d1 migrations apply portal-db --local
npx wrangler d1 execute portal-db --local --file=dev-data/seed.sql
npm run dev
```

Kui local DB on segamini ja tahad päriselt nullist alustada, võib olla vaja kustutada `.wrangler/` local state.

Näide:

```bash
rm -rf .wrangler
npx wrangler d1 migrations apply portal-db --local
npx wrangler d1 execute portal-db --local --file=dev-data/seed.sql
```

> NB: `.wrangler/` kustutamine eemaldab lokaalse Wrangler state’i. Tee seda ainult development keskkonnas.

---

## 18. Typical production deploy checklist

Enne production deployd:

```bash
npm run type-check
npm run build
```

Kontrolli remote migratsioone:

```bash
npx wrangler d1 migrations list portal-db --remote
```

Soovi korral tee backup:

```bash
npx wrangler d1 export portal-db --remote --output=backup-before-deploy.sql
```

Rakenda remote migratsioonid:

```bash
npx wrangler d1 migrations apply portal-db --remote
```

Deploy Worker:

```bash
npx wrangler deploy
```

Vaata logisid:

```bash
npx wrangler tail portal-api
```

---

## 19. Olulised ohutusreeglid

- `--local` = local development D1 DB.
- `--remote` = päris Cloudflare D1 DB.
- `dev-data/seed.sql` on mõeldud local/dev testandmete jaoks.
- Ära jooksuta seed faili remote DB vastu, kui sa pole täiesti kindel.
- Enne remote destructive SQL käske tee export/backup.
- Ära muuda bindinguid ainult Cloudflare dashboardis, kui projekt kasutab Wrangler configut.
- Kui lisad D1/R2 resource’i, lisa see ka `wrangler.toml` / `wrangler.jsonc` faili.
- Commiti `migrations/` failid repo’sse.
- Ära commiti `.dev.vars`, API võtmeid ega muid secrete.
- Remote migratsioonid tee enne lokaalselt läbi.
- Production deploy puhul kontrolli pärast deployd `wrangler tail` logisid.

---

## 20. Kiire käsukokkuvõte

```bash
# Local dev
npm run dev
npx wrangler dev

# D1 info
npx wrangler d1 list
npx wrangler d1 info portal-db

# Create migration
npx wrangler d1 migrations create portal-db migration_name

# Apply migrations
npx wrangler d1 migrations apply portal-db --local
npx wrangler d1 migrations apply portal-db --remote

# List migrations
npx wrangler d1 migrations list portal-db --local
npx wrangler d1 migrations list portal-db --remote

# Seed local DB
npx wrangler d1 execute portal-db --local --file=dev-data/seed.sql

# Query local DB
npx wrangler d1 execute portal-db --local --command="SELECT name FROM sqlite_master WHERE type='table';"

# Query remote DB
npx wrangler d1 execute portal-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"

# Export DB
npx wrangler d1 export portal-db --local --output=backup-local.sql
npx wrangler d1 export portal-db --remote --output=backup-remote.sql

# Deploy Worker
npx wrangler deploy

# Logs
npx wrangler tail portal-api

# Create D1 DB
npx wrangler d1 create new-db-name

# Create R2 bucket
npx wrangler r2 bucket create portal-assets

# List R2 buckets
npx wrangler r2 bucket list

# Add production secret
npx wrangler secret put OPENAI_API_KEY
```

---

## 21. README.md viide

Soovitus: lisa projekti `README.md` faili lühike viide:

```md
## Cloudflare operations

D1, R2, migrations, seed data and deploy commands are documented here:

- `docs/cloudflare-operations.md`
```
