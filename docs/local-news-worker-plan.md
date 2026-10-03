# Kohalike uudiste pipeline Workeris: teostatavus ja plaan

Staatus: analüüs ja plaan, 2026-10-02. Midagi pole veel implementeeritud. Kõik Cloudflare'i numbrid
on võetud ametlikust dokumentatsioonist 2026-10-02 (`developers.cloudflare.com`, lehtede "Last
updated" kuupäevad aprillist oktoobrini 2026), nagu `AGENTS.md` nõuab; need tuleb enne iga sammu
uuesti üle vaadata, sest nad muutuvad.

Seotud dokument Nuxti repos: `docs/automatic-news-generation/implementation-plan.md` (faas 8) ja
pipeline ise `scripts/costaseasons-news-v2/`.

---

## 1. Lühivastus

Teostatav, aga **mitte Workers Free plaanil**. Pipeline'i üks käivitus teeb umbes 110 kuni 130
alampäringut ja parsib sadakond HTML-lehte; Free plaan lubab ühe käivituse kohta 50 alampäringut
ja 10 ms protsessoriaega. Kumbki piir ületatakse kümnekordselt, ja ükski Free plaani ehituskivi
(Workflows, Queues) ei vabasta sellest, sest sama 10 ms kehtib iga sammu kohta.

Kaks praktilist teed:

| | A. Workers Paid, pipeline Workeris | B. Worker jääb Free'ks, pipeline jookseb GitHub Actionsis |
|---|---|---|
| Hind | $5 kuus Cloudflare'ile; LLM umbes $0,30 kuus eraldi | $0; LLM sama |
| Liikuvaid osi | üks platvorm, olemasolev snapshot- ja export-muster | kaks platvormi, Worker on juhtpaneel ja avaldaja |
| Admin-juhtimine | otse: sisse/välja, sagedus, käsitsi käivitus, kinnitamine | sisse/välja ja kinnitamine otse; käivitus ja sagedus GitHubi kaudu |
| Porditav kood | io-kiht D1 ja fetch'i peale, tuum jääb samaks | null porti, skript jookseb Node's nagu praegu |
| Risk | protsessoriaja mõõtmine päris lehtedel enne otsust | kaks saladust kahes kohas, kaks logi |

**Soovitus: A.** Põhjus on `AGENTS.md` vaimus: vähem liikuvaid osi, olemasoleva andmeallika-,
snapshot- ja export-mustri taaskasutus, ja admin-juhtimine ilma vahekihita. $5 kuus on ainus
lisakulu ja see on kinnitusvärav (vt §8). Kui see kulu ei sobi, on B täiesti töötav ja kirjeldatud
§7-s.

---

## 2. Mida pipeline ühe käivitusega teeb

Mõõdetud lokaalselt 2026-10-01, luna mudeliga:

| Etapp | Võrgupäringuid | Mudelikõnesid | Seinakell | Protsessoriaeg, hinnang |
|---|---|---|---|---|
| collect: 8 nimekirja või voogu | 8 | 0 | 1–5 s | < 100 ms |
| fetch: artiklilehed | ~100 | 0 | 15–35 s | 1–3 s (cheerio parsib ~100 lehte, 50–700 KB) |
| select: 4–5 partiid | 0 | 4–5 | 10–20 s | < 100 ms |
| summarize: 1 partii | 0 | 1 | 10–30 s | < 50 ms |
| validate: värsked kordus-laadimised | ~10 | 0 | 10–30 s | < 500 ms |
| translate: 4 keelt | 0 | 4 | 10–15 s | < 50 ms |
| kokku | ~120 | ~10 | 60–130 s | **2–5 s, mõõtmata Workeris** |

Hind umbes 1 sent käivituse kohta OpenAI dashboardi järgi. Mälu: korraga on töös üks leht pluss
kuni 100 ekstraheeritud teksti, suurusjärk 20 MB.

---

## 3. Cloudflare'i piirid, mis loevad (2026-10-02)

| Piir | Workers Free | Workers Paid | Mida see meile tähendab |
|---|---|---|---|
| Protsessoriaeg Cron Triggeri kohta | 10 ms | 30 s, kui cron-intervall on alla tunni; 15 min, kui tund või rohkem | Free: takistus. Paid igapäevasel cronil: 15 min, varu ~100-kordne |
| Alampäringuid käivituse kohta | 50 | 10 000 (tõstetav) | Free: takistus, vajame ~120 |
| Seinakell Cron Triggeril | 15 min | 15 min | mahume ~2 minutiga |
| Samaaegseid väljuvaid ühendusi | 6 | 6 | hoiame paralleelsust ≤ 5 igas etapis; praegused seaded on 4, 5, 2, 4 |
| Mälu isolaadi kohta | 128 MB | 128 MB | piisab |
| Cron Triggereid kontol | 5 | 250 | portal-api kasutab 2; uut pole tingimata vaja (§5.2) |
| Workflows, protsessoriaeg sammu kohta | 10 ms | 30 s, tõstetav 5 min | Free'l ei aita: HTML-i parsimine ei mahu 10 ms-sse |
| Workflows, alampäringuid instantsi kohta | 50 | 10 000 | Free'l ei aita |
| Queues | olemas Free'l, tarbija 10 ms CPU | tarbija kuni 5 min | Free'l üks artikkel sõnumi kohta jääks 10 ms piiri äärele |
| D1 Free | 5 M lugemist ja 100 000 kirjutamist päevas, 500 MB, 50 päringut käivituse kohta | praktiliselt piiramatu | üks käivitus loeb ja kirjutab mõne rea, D1 ei ole pudelikael kummalgi plaanil |
| Paid hind | | $5 kuus, 30 M CPU-ms kuus sees | igapäevane ~5 s CPU on 150 000 ms kuus, jääb sisse |

Dokumentatsioonis on üks ebakõla: limits-leht ütleb Paid cronile 30 s või 15 min olenevalt
intervallist, pricing-leht ütleb lihtsalt "kuni 15 min CPU Cron Triggeri kohta". Mõlemal juhul
piisab igapäevasele tööle; alla-tunnise intervalliga tööd me ei kavanda.

TextDecoder: Workersi dokumentatsioon ei loetle toetatud kodeeringuid. Pipeline vajab ISO-8859-1 ja
ISO-8859-15 dekodeerimist (cartagena.es, turismoregiondemurcia.es). Kontroll on W1 esimene samm; kui
tugi puudub, on asendus 30-realine baidi-tabel, sest Latin-1 on identiteet ja Latin-9 erineb kaheksas
kohas.

---

## 4. Kuidas see portal-api-sse sobitub

portal-api-s on juba olemas kõik, mida regulaarne töö vajab:

- **Andmeallika muster**: `src/scheduled/dataSources/<allikas>.ts`, registreeritud `registry.ts`-s,
  rida tabelis `external_data_sources` lipuga `is_active`. Iga laadimine on rida tabelis
  `external_data_snapshots` koos stabiilse räsiga, mis jätab muutumatu tulemuse vahele.
- **Käsitsi käivitus**: `POST /api/admin/external-data/sources/:id/run` autentimise taga.
- **Avaldamine**: hourly export-töö commit'ib kolm andmefaili Nuxti reposse ühe atomaarse
  commit'iga läbi GitHub Git Database API (`src/github/githubClient.ts`, `commitDataFiles`), ainult
  lubatud kellaaegadel ja ainult siis, kui sisu muutus.
- **Ajalugu**: `external_data_snapshots` ja `github_export_state`.

Uudiste pipeline on neljas andmeallikas, kolme erinevusega:

1. ta jookseb harvemini kui kord tunnis ja sagedus peab olema muudetav ilma deploy'ta;
2. tema tulemus võib enne avaldamist vajada inimese pilku;
3. ta maksab raha iga käivitusega.

---

## 5. Disain (variant A)

### 5.1 Kood: üks pakett, kaks käivitajat

Pipeline'i tuum (`src/pipeline`, `src/ai`, `src/sources`) on kirjutatud ilma Node-spetsiifiliste
importideta just selleks hetkeks. Node-spetsiifilised on ainult `src/io/*` ja `src/cli.ts`. Workeri
jaoks lisandub `io/workerHttp.ts` (fetch ilma kettacache'ita; cache pole Workeris vajalik, iga
käivitus laadib ~100 lehte ja see on odav) ja `io/d1Storage.ts`.

Kus pakett elab, on otsustuskoht:

- **Soovitus**: tõsta `scripts/costaseasons-news-v2` portal-api reposse kausta
  `packages/news-pipeline` ja teha portal-api-st npm workspace. Worker impordib tuuma otse, CLI
  jääb lokaalseks tööriistaks samas paketis (`npm run generate` ja `publish-latest` edasi
  kasutatavad, avaldamise sihtfail on konfis suhtelise teena Nuxti reposse). Nuxti repo hoiab
  ainult andmefaili ja rakenduse koodi.
- Alternatiiv: eraldi repo ja GitHub Packages npm-pakett. Rohkem tseremooniat, mõttekas alles siis,
  kui pipeline'il tekib kolmas kasutaja.
- Ei sobi: `file:`-sõltuvus naaberkausta (ei tööta CI-s) ega git-alamkausta installimine (npm ei
  oska).

`AGENTS.md` ütleb, et repo ei tohi muutuda monoliidiks "unrelated tooling'u" jaoks; uudiste pipeline
on Workeri enda andmeallikas, seega seotud, aga see on kinnitusvärav (§8).

### 5.2 Ajastus: olemasolev tunnitakt ja `next_due_at`

Uut Cron Triggerit pole vaja. Tunnine `7 * * * *` fetch-töö käib kõik aktiivsed allikad läbi; uudiste
allikas saab kaks veergu tabelisse `external_data_sources`:

| Veerg | Tähendus |
|---|---|
| `schedule` | tekst, näiteks `daily 05:00` või `mon,wed,fri 05:00` (Europe/Madrid), või cron-avaldis; parsitakse koodis |
| `next_due_at` | järgmine lubatud käivitus; allikas jookseb ainult siis, kui `now >= next_due_at`, ja arvutab pärast uue väärtuse |

Kontroll läheb `runDataSourceFetch`-i kohe pärast `is_active` kontrolli: kui real on `next_due_at`
ja see on tulevikus, tagastatakse uus staatus `not_due` ilma snapshotita. Ilma ja mere ridadel jääb
veerg tühjaks, nii et nende käitumine ei muutu. Admin-endpoint "käivita kohe" annab runnerile lipu
`ignoreSchedule`.

Sageduse muutmine on D1 kirjutus admin-liidesest, ilma deploy'ta. "Välja lülitatud" on olemasolev
`is_active = 0`. "Käivita kohe" on olemasolev admin-endpoint. Cronide arv jääb kaheks. Alternatiiv on eraldi `0 5 * * *` cron, mis on puhtam eraldus, aga nõuab kinnitust ja
teeb sageduse muutmise deploy'ks; see on kinnitusväravas kirjas valikuna.

Kuna tunnitakti intervall on tund, kehtib Paid plaanil 15 min protsessoriaega ja 15 min seinakella
käivituse kohta; ilm ja meri võtavad sellest sekundeid, uudised ~2 minutit. Allikad käivad järjest
ja igaüks oma try/catch'is, nii et uudiste viga ei peata ilma.

### 5.3 Andmed D1-s

Mitte midagi vahemällu. Igal käivitusel loetakse ja kirjutatakse:

Loetakse
- `external_data_sources` rida: `is_active`, `schedule`, `next_due_at`, seaded (vt all).
- viimane avaldatud andmestik `news_runs`-ist (kõige värskem rida, millel `published_at` pole tühi):
  see on §5-s kirjeldatud liitmise "eelmine andmestik", millest säilitatakse kestvad sündmused ja
  kuni 14 päeva vanused uudised. GitHubist pole vaja lugeda.

Kirjutatakse
- **Snapshot nagu teistel allikatel.** `fetchAndNormalize` tagastab valmis andmestiku (`normalized`),
  olemasolev `runDataSourceFetch` räsib selle ja kirjutab `external_data_snapshots` rea staatusega
  `success` (`normalized_json` ≈ 40 KB on avaldamise kandidaat). Kui värav kukub, viskab definitsioon
  vea ja runner kirjutab `failed` rea koos `error_message`-ga, nagu praegu ilma puhul; `latest_*`
  viidad jäävad eelmisele õnnestunud käivitusele. Siin ei muutu midagi.
- **Uus rida tabelisse `news_runs`** (uus migratsioon) artefaktidega, mida snapshot ei mahuta.
  Definitsioon kirjutab selle ise enne tagastamist või viskamist, nii et ka väravast läbi kukkunud
  käivituse põhjused on alles. Seos snapshotiga: runner genereerib `snapshotId` enne
  `fetchAndNormalize` kutset ja annab selle `DataSourceFetchContext`-is kaasa (üks väike muudatus
  `runFetch.ts`-s).

| Veerg | Sisu |
|---|---|
| `id`, `snapshot_id`, `started_at`, `finished_at`, `outcome` | nagu lokaalses `run.json`-is |
| `llm_calls`, `estimated_usd`, `items`, `accepted`, `rejected` | kokkuvõte admin-nimekirja jaoks |
| `manifest_json` | `run.json` tervikuna, ~20 KB |
| `validation_json` | tagasilükkamised ja põhjused |
| `review_md` | tõlgete pistekontrolli leht, mida admin näitab |
| `llm_calls_json` | promptid ja toored vastused, 100–200 KB; hoida 30 viimast käivitust, vanemad tühjendada olemasoleva `cleanup`-endpoindi laiendusega |
| `approved_at`, `approved_by` | kinnitamise jälg; avaldamise jälg on snapshoti `published_commit_sha` |

D1 rea piir on 2 MB, kõik veerud mahuvad. Kirjutusi on käivituse kohta kaks kuni kolm, lugemisi
sama palju; Free plaani 100 000 kirjutamist päevas on sellest kolm suurusjärku kaugel.

Seaded: üks JSON-veerg `settings_json` allika real või kolm eraldi veergu: `publish_mode`
(`review` või `auto`), `model_key`, `max_new_items`. Eelistan eraldi veerge, sest neid on vähe ja
nad on päritavad.

Saladused: `OPENAI_API_KEY` läbi `wrangler secret put`, lokaalselt `.dev.vars`.

### 5.4 Avaldamine ja kinnitamine

Export-töö saab neljanda faili. Praegune `githubExport.ts` on kolme faili peale kõvasti kirjutatud
(`readGithubExportConfig`, `CompositeHashInput`, `evaluatePublishConditions`, `commitDataFiles`),
seega on muudatus igas neljas kohas, aga mehaaniline: `GITHUB_NEWS_FILE_PATH =
app/data/local-news/latest-news-list.json` samal kujul nagu kolm olemasolevat muutujat. Uudised
lähevad samasse atomaarsesse commit'i ilma ja merega ja committijaid jääb üks. Uudiste fail on
export'is **valikuline**: kui avaldatavat andmestikku pole, jäetakse tee puu-kirjetest välja ja
Git hoiab senise faili alles (`createTree` baaspuu peale muudab ainult loetletud teid). Nii ei saa
kinnitamata või läbikukkunud käivitus lehte tühjendada.

Export võtab uudiste sisu reeglite järgi:

- `publish_mode = review`: uusim `news_runs` rida, millel on `approved_at`, ja selle snapshoti
  `normalized_json`; kinnitamata kandidaat ootab.
- `publish_mode = auto`: uusim `success` snapshot.

Räsi-võrdlus on export-töös juba olemas, seega muutumatu andmestik commit'i ei tekita. Pärast
commit'i märgitakse snapshoti `published_commit_sha` ja allika `latest_published_commit_sha`, mis on
mõlemad skeemis juba olemas, aga praegu täitmata.

See on sama "run, vaata, publish-latest" töövoog, mis lokaalselt juba töötab, ainult kinnitamine
toimub brauseris.

### 5.5 Admin-endpointid (olemasoleva auth-kaitse taga)

| Meetod ja tee | Olek | Mida teeb |
|---|---|---|
| `GET /api/admin/news/runs?limit=20` | uus | käivituste nimekiri kokkuvõtteveergudest |
| `GET /api/admin/news/runs/:id` | uus | manifest, valideerimine, andmestik snapshotist, pistekontrolli leht |
| `POST /api/admin/news/runs/:id/approve` | uus | `approved_at` ja `approved_by`; export võtab järgmisel aknal kaasa |
| `POST /api/admin/external-data/sources/:id/run` | olemas | käivita kohe; saab juurde `ignoreSchedule` |
| `GET /api/admin/external-data/sources/:id/snapshots` | olemas | snapshotite ajalugu, sobib ka uudistele |
| `PATCH /api/admin/external-data/sources/:id` | uus | `is_active`, `schedule`, `publish_mode`, `model_key`; praegu allika rida muuta ei saa |

Käivitus admin-endpointist jookseb `fetch`-käsitlejas, mitte cronis, ja seal kehtib HTTP-päringu
protsessoriaja piir (Paid vaikimisi 30 s, millest 2–5 s on piisav varu) ja kliendi kannatus. Kaks minutit seinakella on HTTP jaoks pikk; kasutada `ctx.waitUntil`-i, vastata kohe
`202 Accepted` ja lasta admin-UI-l nimekirja uuendada. Sama muster sobib juba praegu ilma käsitsi
käivitusele.

Admin-UI (eraldi repo `portal-api-admin-ui`) renderdab nimekirja, ühe käivituse vaate koos tõlgete
tabeliga, nupud "Kinnita" ja "Käivita kohe", ning seadete vormi.

### 5.6 Mis Workeris teisiti käitub, võrreldes lokaalse skriptiga

- Puudub kettacache: iga käivitus laadib kõik lehed. Odav ja õige, sest nimekirjad peavadki olema
  värsked.
- Puudub `runs/` kaust: artefaktid on `news_runs` rida. `llm-calls.jsonl` on veerg, mida admin
  saab alla laadida.
- `reachable` kontroll jääb, aga samaaegsus 2 ja ajapiirang 30 s on juba konfis; Workeri 6
  ühenduse piir ei ole probleem.
- `--no-ai` ekvivalent: `publish_mode = review` pluss kinnitamine ei tee ühtegi mudelikõnet, sest
  kandidaadi tõlked on juba `dataset_json`-is.

---

## 6. Faasid ja "valmis" kriteeriumid (variant A)

**W0. Otsused ja kinnitused** (§8 nimekiri). Valmis: iga värav on vastatud.

**W1. Pakett ja Workersi ühilduvus.** Pakett tõstetakse `packages/news-pipeline` alla, portal-api
saab workspace'i. Vitest Workers pool'is jooksutatakse pipeline'i tuuma teste (mitte io-kihti).
Üks `wrangler dev` test laadib päris 100 lehte ja mõõdab protsessoriaega observability'st.
TextDecoder kontroll. Valmis: tuuma testid rohelised Workers pool'is; CPU käivituse kohta mõõdetud
ja alla 10 s; kodeeringud töötavad või asendus on sees.

**W2. D1 skeem.** Migratsioon `0009`: `external_data_sources` saab `schedule`, `next_due_at`,
`publish_mode`, `model_key`; uus `news_runs` tabel viitega `snapshot_id`; seemnerida uudiste
allikale (`is_active = 0`, `publish_to_github = 1`, `github_file_path` Nuxti tee). Lokaalselt
testitud. Valmis: `npm run db:migrate:local` ja seed töötavad, testid skeemi vastu rohelised.
Remote migratsioon on eraldi kinnitus.

**W3. Andmeallikas ja ajastus.** `dataSources/localNews.ts` ehitab `PipelineContext`i Workeri
io-kihiga, jooksutab `runPipeline`, kirjutab `news_runs` rea ja tagastab andmestiku `normalized`-ina
või viskab väravavea. `runFetch.ts` saab `not_due` kontrolli, `snapshotId` konteksti ja
`ignoreSchedule` lipu. Valmis: `wrangler dev --test-scheduled` päris käivitus jookseb lõpuni,
snapshot ja `news_runs` rida on D1-s, hind manifestis; `is_active = 0` korral ei juhtu midagi;
`next_due_at` liigub edasi; väravaviga annab `failed` snapshoti ja täidetud `validation_json`-i.

**W4. Export ja kinnitamine.** Neljas fail export'is, `publish_mode` loogika, `approved_at`.
Valmis: dry-run logib õige commit'i; `data-export-test` haru saab päris commit'i; `master` alles
pärast sinu kinnitust; kinnitamata kandidaat ei jõua kunagi commit'i.

**W5. Admin-endpointid.** Viis endpointi auth'i taga, Vitest Workers pool'i testid. Valmis: admin-UI
saab nimekirja, vaate, kinnituse, käivituse ja seaded teha ilma `wrangler`'ita.

**W6. Rollout ja seire.** `is_active = 1`, `publish_mode = review`, igapäevane kell 05:00 Madridi
aega; nädal kinnitamisega, siis otsus `auto` peale. Seire: `news_runs.estimated_usd` summa kuus,
Workersi observability CPU-aeg, export-vead. Valmis: 7 järjestikust päeva ilma käsitsi sekkumiseta.

---

## 7. Variant B lühidalt: GitHub Actions jooksutab, Worker juhib

Täispikk plaan koos GitHub Actionsi tutvustuse, repo valiku ja kahe alamkujuga (B1: Actions teeb
kõik; B2: allpool kirjeldatud Worker-juhitud kuju) on failis `local-news-github-actions-plan.md`.

- `.github/workflows/local-news.yml` paketi repos: `schedule: cron '0 4 * * *'` (UTC) ja
  `workflow_dispatch`; sammud `actions/checkout`, Node 24, `npm ci`, `node src/cli.ts run`.
- Enne käivitust küsib skript Workerilt `GET /api/internal/news/schedule` (jagatud saladusega):
  kas `is_active` ja kas `next_due_at` on möödas; kui ei, lõpetab. Nii jääb sisse/välja ja sagedus
  Workeri D1-s, action ise käib iga päev sama kellaajaga.
- Pärast käivitust `POST /api/internal/news/runs` manifesti, valideerimise, andmestiku ja
  pistekontrolli lehega; Worker kirjutab `news_runs` rea. Edasi on §5.4 ja §5.5 identsed.
- Käsitsi käivitus: admin-UI nupp kutsub GitHubi `workflow_dispatch` API-t (vajab tokenit õigusega
  `actions:write`, praegune token on sisu jaoks) või lihtsalt lingib Actionsi lehele.
- Maksumus: GitHub Actions tasuta kvoot on privaatsel repol 2000 minutit kuus; ~3 minutit päevas on
  ~90 minutit kuus. Cloudflare jääb Free'ks.
- Hind variandile B on keerukus: `OPENAI_API_KEY` on GitHubi saladus, logid on Actionsis, Worker on
  vahekiht. Kui $5 kuus on vastuvõetav, ei ole B-l eelist.

---

## 8. Kinnitusväravad enne esimest koodirida

`AGENTS.md` nõuab selgesõnalist kinnitust järgmistele:

1. **Kulu**: Workers Paid, $5 kuus (variant A), või variant B ilma selleta.
2. **Uued sõltuvused portal-api-sse**: `zod` (skeemid ja structured output JSON Schema),
   `cheerio` (HTML-i parsimine; natiivne `HTMLRewriter` on voopõhine ja tekstiekstraktsiooniks
   kohmakas), `fast-xml-parser` (RSS). `openai` SDK soovitan **mitte** tuua: provideri liides on
   õhuke ja Responses API kõne on üks `fetch`; see on 60 rida ja vastab `AGENTS.md` eelistusele
   natiivse fetch'i kasuks.
3. **Paketi asukoht**: tõsta pipeline portal-api reposse workspace'ina (soovitus) või eraldi repo.
4. **Ajastus**: taaskasutada tunnitakti koos `next_due_at`-iga (soovitus, 0 uut croni) või lisada
   eraldi igapäevane cron.
5. **D1 migratsioon**: kaks veergu `external_data_sources`'ile, uus `news_runs`, seemnerida.
   Remote rakendamine eraldi kinnitusega.
6. **Saladus**: `OPENAI_API_KEY` wrangler secretina.
7. **Export**: neljas fail samasse commit'i; `publish_mode` vaikimisi `review`.
8. **Autentimine**: uued admin-endpointid lähevad olemasoleva Google-auth kaitse taha; mudelit ei
   muudeta.

---

## 9. Riskid ja kuidas neid maandada

| Risk | Maandus |
|---|---|
| HTML-i parsimise protsessoriaeg Workeris on mõõtmata | W1 mõõdab päris lehtedel enne W2 algust; varu Paid plaanil on 100-kordne |
| TextDecoder ei toeta ISO-8859-1/-15 | W1 kontroll; asendus on 30-realine tabel |
| Aeglane turismoregiondemurcia.es | praegune `reachable` loogika talub ajalõppu; seinakella varu on 13 minutit |
| Uudiste töö venitab tunnitakti ja lükkab ilma edasi | allikad on isoleeritud; kui segab, tõsta uudised eraldi cronile (värav 4) |
| Mudel või allikas muutub ja värav lükkab kõik tagasi | `gate_failed` ei commit'i midagi, eelmine andmestik jääb lehele kuni 96 h, admin näeb põhjuse `validation_json`-ist |
| Kulu kasvab märkamatult | `estimated_usd` igal real, admin-nimekiri näitab kuu summat; luna hind on 1 sent käivituse kohta |
| D1 kasv `llm_calls_json` tõttu | hoida 30 viimast, vanemad veerud tühjendada export-töö lõpus |

---

## 10. Mis muutub Nuxti repos

- `scripts/costaseasons-news-v2` kolib ära (variant A, soovitus), `README.md` viitab uude kohta.
- `app/data/local-news/latest-news-list.json` muutub ainult portal-api commit'idega, nagu ilm ja
  meri juba praegu.
- Rakenduse koodis ei muutu midagi: `dataset_max_age_hours` ja `max_age_hours` on juba olemas.
