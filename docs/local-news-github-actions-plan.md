# Kohalike uudiste pipeline GitHub Actionsis (variant B)

Staatus: analüüs, 2026-10-02. Martin valis samal päeval variandi B1 kõige lihtsamal kujul:
workflow elab portal-api repos, tõmbab Nuxti repo PAT-iga, jooksutab olemasoleva CLI ja commit'ib
otse `master`-isse nagu Worker ilma ja merega. Nuxti repos ei muutu midagi, uut koodi ei tule, PR-i
pole. Täpne teostusplaan on failis `local-news-github-actions-implementation.md`; kus see siinsest
visandist erineb, kehtib teostusplaan. See on paarisdokument failile
`local-news-worker-plan.md` (variant A, pipeline Workeris); siin on lahti kirjutatud variant B, kus
pipeline jookseb GitHub Actionsis ja Cloudflare jääb Free plaanile.

GitHubi numbrid on võetud `docs.github.com` lehtedelt 2026-10-02. Lehed ei näita uuenduskuupäeva,
seega tuleb nad enne iga sammu üle vaadata, nagu Cloudflare'i omadki.

---

## 1. Lühivastus

- **Eraldi repot ega projekti pole vaja.** Workflow on üks YAML-fail repo kaustas
  `.github/workflows/`. Soovitus: Nuxti repo `meltsas/non-touristic-rentals`, sest pipeline'i kood
  (`scripts/costaseasons-news-v2`) ja avaldatav andmefail on juba seal ning repo enda automaatne
  token saab ilma ühegi lisasaladuseta commit'ida.
- **Hind on null**, kui kuukvoot ei täitu. Repo paistab privaatne (anonüümne `git ls-remote` küsis
  paroole), seega kehtib GitHub Free plaani 2 000 minutit kuus; igapäevane käivitus kulutab umbes
  120. Avalikul repol oleks kasutus piiramatu ja tasuta. OpenAI kulu on sama mis praegu, umbes 1 sent
  käivituse kohta.
- **Kinnitamine käib pull request'iga.** Töö teeb uue andmestiku ja avab PR-i, mille kirjelduses on
  tõlgete pistekontrolli leht ja kulu; "merge" nupp GitHubis (ka telefonist) on avaldamine. Kui
  usaldus on tekkinud, lülitub režiim `auto` peale ja commit läheb otse `master`-isse.
- **Sisse/välja ja sagedus** on repo muutujad (Settings → Secrets and variables → Actions →
  Variables), mida saab muuta ilma commit'ita. Käsitsi käivitus on nupp "Run workflow" Actionsi
  vahelehel.
- **Mis jääb variandist A puudu:** juhtimine toimub GitHubi liideses, mitte portal-api admin-UI-s, ja
  `master`-il on kaks committijat (portal-api bot ja Actions). Kui admin-UI juhtimine on nõue, on
  olemas vahekuju B2 (§6), kus Worker juhib ja avaldab ning Actions ainult jooksutab.

---

## 2. Mis on GitHub Actions

GitHub Actions on GitHubi sisseehitatud automatiseerimisteenus. Repo kausta `.github/workflows/`
pannakse YAML-fail (**workflow**), mis ütleb, millal ja mida teha. Kui **sündmus** saabub (push,
pull request, kellaaeg, nupuvajutus, API-kutse), käivitab GitHub puhta virtuaalmasina
(**runner**), tõmbab sinna repo, jooksutab failis loetletud **sammud** ja viskab masina ära.
Käivitusel on logi, mida saab brauseris lugeda, ja ta saab salvestada faile (**artefaktid**) ja
kirjutada kokkuvõtte (**job summary**), mis kuvatakse käivituse lehel.

Mõisted, mida allpool kasutan:

| Mõiste | Tähendus |
|---|---|
| workflow | YAML-fail, üks automatiseeritud töö koos käivitustingimustega |
| job, step | job on üks virtuaalmasina sessioon; step on üks käsk või taaskasutatav action selle sees |
| runner | GitHubi hallatav VM; privaatsel repol `ubuntu-latest` = Ubuntu 24.04, 2 CPU, 8 GB RAM, 14 GB ketast |
| action | valmis samm teiselt autorilt, näiteks `actions/checkout` (tõmbab repo) ja `actions/setup-node` (paigaldab Node'i) |
| `schedule` | cron-käivitus; jookseb ainult vaikeharu (`master`) failist ja selle viimasest commit'ist |
| `workflow_dispatch` | käsitsi käivitus nupust, REST API-st või `gh` CLI-st; kuni 25 sisendparameetrit |
| secrets | krüpteeritud väärtused (`OPENAI_API_KEY`), logides maskeeritud |
| variables | avatekstis seaded (`NEWS_ENABLED`), muudetavad liidesest ilma commit'ita |
| `GITHUB_TOKEN` | automaatne token iga job'i jaoks, õigused ainult sellele repole, elab job'i lõpuni |
| artifacts | käivituse failid, vaikimisi 90 päeva, privaatsel repol seatav 1–400 päeva |

Erinevus Workerist, mis siin loeb: runner on täisväärtuslik Linux-masin Node 24-ga, kus pole
protsessoriaja ega alampäringute piire, job võib kesta kuni 6 tundi, ja pipeline'i praegune
Node-kood jookseb muutmata kujul. Vastukaaluks on ajastus umbkaudne (vt §8), iga käivitus algab
tühjalt masinalt (umbes 30–60 s ettevalmistust) ja olek elab repos või artefaktides, mitte D1-s.

### Piirid ja hind (docs.github.com, 2026-10-02)

| | GitHub Free, privaatne repo | Avalik repo |
|---|---|---|
| Minutid kuus standardrunneril | 2 000 (Pro plaanil 3 000) | piiramatu, tasuta |
| Üle kvoodi | $0,006 minut Linux 2-core; iga job ümardatakse täisminutini | – |
| Artefaktide ja pakettide maht | 500 MB (Pro 1 GB) | sama |
| Runner | 2 CPU, 8 GB RAM | 4 CPU, 16 GB RAM |
| Job'i maksimaalne kestus | 6 tundi | 6 tundi |
| Samaaegseid job'e | 20 | 20 |
| `schedule` lühim intervall | 5 min | 5 min |
| `schedule` ajavöönd | `timezone:` võti IANA nimega, näiteks `Europe/Madrid` | sama |
| Passiivsuse reegel | ei kehti | 60 päeva ilma repo tegevuseta lülitab cron-workflow'd välja |
| `GITHUB_TOKEN` API-piir | 1 000 päringut tunnis repo kohta | sama |

Meie kulu: pipeline'i käivitus kestab 60–130 s, ettevalmistus (checkout, Node, `npm ci` koos
vahemäluga) umbes 1 min, kokku 3–4 minutit ümardatuna. Igapäevaselt ~120 min kuus, kolm korda
nädalas ~50. Artefaktid: üks käivituskaust on umbes 1 MB koos `llm-calls.jsonl`-iga; 30-päevase
säilitusega ~30 MB.

---

## 3. Sama repo või eraldi?

Sama repo. Workflow'd on repo osa, mitte eraldi projekt, ja üks repo võib hoida kui tahes palju
workflow'sid. Küsimus on ainult, **milline** repo:

| Koht | Plussid | Miinused |
|---|---|---|
| **Nuxti repo** `non-touristic-rentals` (soovitus) | kood ja andmefail on juba seal; `GITHUB_TOKEN` saab commit'ida ilma lisasaladuseta; retention ja merge loevad eelmist andmestikku otse checkout'ist | workflow-fail peab olema `master`-is, et cron ja nupp töötaksid; `master`-il tekib teine committija |
| portal-api repo | loogiline, kui pipeline kolib sinna variant A otsusega (`packages/news-pipeline`) | commit teise reposse vajab PAT-i saladusena (sama token, mis portal-api-l juba on); kaks repot ühe funktsiooni jaoks |
| eraldi repo | – | ei anna midagi, mida kaks eelmist ei annaks |

Üks praktiline tagajärg: `schedule` ja "Run workflow" nupp töötavad ainult siis, kui workflow-fail on
vaikeharus. Praegune `local-news-generation` haru töö peab enne `master`-isse jõudma; see on nagunii
plaanis.

Kui hiljem valitakse siiski variant A, ei lähe siinne töö kaduma: Actionsi workflow sobib Workeri
kõrval lokaalse CLI "pilveversiooniks" võrdlus- ja silumiskäivitusteks, nagu portal-api README juba
kirjeldab testharu kasutust.

---

## 4. Kaks kuju

| | **B1: Actions teeb kõik** | **B2: Actions jooksutab, Worker juhib ja avaldab** |
|---|---|---|
| Käivitab | GitHubi cron + nupp | GitHubi cron + nupp, aga enne tööd küsib Workerilt luba |
| Sisse/välja, sagedus | repo muutujad GitHubis | portal-api admin-UI, D1 |
| Kinnitamine | PR-i merge GitHubis | admin-UI nupp, nagu variandis A |
| Avaldamine | Actions commit'ib Nuxti reposse | Actions postitab tulemuse Workerile, export-töö commit'ib |
| portal-api muudatused | mitte ühtegi | D1 skeem, kaks sisemist endpointi, export'i neljas fail, admin-endpointid (variant A W2, W4, W5) |
| Committijaid `master`-il | kaks | üks |
| Sobib, kui | GitHubi liides juhtimiseks kõlbab | admin-UI juhtimine on nõue, aga $5 kuus ei ole |

Soovitus variandi B sees: **B1**. Null portal-api muudatust, null uut Cloudflare'i kulu, ja PR on
täpselt see "run, vaata, publish-latest" töövoog, mis lokaalselt juba toimib. B2 on mõttekas ainult
siis, kui admin-UI on kohustuslik; sel juhul on see sisuliselt variant A ilma pipeline'i pordita ja
ilma Paid plaanita.

---

## 5. B1 disain

### 5.1 Workflow

Fail `non-touristic-rentals/.github/workflows/local-news.yml`. See on fail, mitte käsurea plokk;
action'ite versioonid tuleb enne lisamist üle kontrollida.

```yaml
name: Local news

on:
  schedule:
    - cron: '17 5 * * *'          # iga päev 05:17 Madridi aega; päevade filter on allpool
      timezone: 'Europe/Madrid'
  workflow_dispatch:
    inputs:
      mode:
        description: "review avab PR-i, auto commitib otse master-isse"
        type: choice
        options: [review, auto]
        default: review

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: local-news
  cancel-in-progress: false

jobs:
  generate:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      NEWS_MODE: ${{ inputs.mode || vars.NEWS_MODE || 'review' }}
    defaults:
      run:
        working-directory: scripts/costaseasons-news-v2
    steps:
      - uses: actions/checkout@v4

      - name: Kas täna käivitada
        id: guard
        env:
          ENABLED: ${{ vars.NEWS_ENABLED }}
          DAYS: ${{ vars.NEWS_DAYS }}
          EVENT: ${{ github.event_name }}
        run: |
          if [ "$EVENT" = "workflow_dispatch" ]; then echo run=true >> "$GITHUB_OUTPUT"; exit 0; fi
          if [ "$ENABLED" != "true" ]; then echo "NEWS_ENABLED ei ole true"; echo run=false >> "$GITHUB_OUTPUT"; exit 0; fi
          today=$(TZ=Europe/Madrid date +%u)
          case ",$DAYS," in *,$today,*) echo run=true >> "$GITHUB_OUTPUT" ;; *) echo "täna ($today) ei ole NEWS_DAYS ($DAYS) sees"; echo run=false >> "$GITHUB_OUTPUT" ;; esac

      - uses: actions/setup-node@v4
        if: steps.guard.outputs.run == 'true'
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: scripts/costaseasons-news-v2/package-lock.json

      - run: npm ci
        if: steps.guard.outputs.run == 'true'

      - name: Genereeri ja tõlgi
        if: steps.guard.outputs.run == 'true'
        run: node src/cli.ts run --no-cache

      - name: Kokkuvõte käivituse lehele
        if: always() && steps.guard.outputs.run == 'true'
        run: node src/cli.ts report-latest >> "$GITHUB_STEP_SUMMARY"

      - uses: actions/upload-artifact@v4
        if: always() && steps.guard.outputs.run == 'true'
        with:
          name: run-${{ github.run_id }}
          path: scripts/costaseasons-news-v2/runs
          retention-days: 30

      - name: Kirjuta andmefail
        if: steps.guard.outputs.run == 'true'
        run: node src/cli.ts publish-latest

      - name: Avalda
        if: steps.guard.outputs.run == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
        run: node src/cli.ts commit --mode "$NEWS_MODE"
```

Mida siin tähele panna:

- **Päevade filter**, mitte mitu croni. Cron käib iga päev; muutuja `NEWS_DAYS` (näiteks `1,3,5`
  või `1,2,3,4,5,6,7`) otsustab, kas midagi tehakse. Sageduse muutmine on muutuja muutmine. Cron
  ise ei alga täistunnil, sest GitHub hoiatab, et täistunnil on koormus ja viivitused suurimad.
- **Käsitsi käivitus** eirab `NEWS_ENABLED`-i ja päevi, nagu admin-nupp variandis A.
- **Väravaviga on punane käivitus.** CLI väljub koodiga 2, samm kukub, GitHub saadab vaikimisi
  e-kirja workflow-faili viimasele muutjale. See on tasuta alarm, mida Workeri variandil ei ole.
  Artefaktid ja kokkuvõte salvestatakse `if: always()` tõttu ka siis.
- **`--no-cache`**: runner on iga kord tühi, kettavahemälu poleks mõtet; nimekirjad peavadki olema
  värsked ja ~100 artikli laadimine on odav.
- **`concurrency`** hoiab ära kaks paralleelset käivitust (cron ja nupp samal hetkel).

### 5.2 Kaks väikest CLI lisa

Mõlemad on Node-kood samas paketis ja testitavad ilma mudelikõneteta:

- `report-latest`: loeb uusima `run.json`, `validation.json` ja `translation-review.md` ning
  trükib markdown-kokkuvõtte (kirjeid, kulu, mudelikõnesid, tagasilükkamised põhjustega, link
  artefaktile). Sama väljund on PR-i kirjeldus.
- `commit --mode review|auto`: teeb git-commit'i andmefailist ja kas lükkab `master`-isse (`auto`)
  või harusse `news/candidate` koos PR-iga (`review`). Üks fikseeritud haru ja üks avatud PR, mida
  järgmine käivitus `--force`-iga uuendab, nii et kinnitamata kandidaadid ei kuhju. PR-i loomine ja
  uuendamine käib `gh pr create` / `gh pr edit` kaudu; `gh` on runneril olemas ja `GH_TOKEN` on
  job'i enda token. Committija nimi ja e-post on `github-actions[bot]` omad.

### 5.3 Olek ja andmed

Midagi vahemällu ega andmebaasi ei lähe.

| Mida pipeline vajab | Kust see tuleb Actionsis |
|---|---|
| eelmine avaldatud andmestik (retention, merge) | checkout'i `app/data/local-news/latest-news-list.json`, `master`-i seis |
| allikate nimekirjad ja artiklid | värskelt võrgust, nagu praegu |
| `OPENAI_API_KEY` | repo secret, keskkonnamuutujana |
| seaded `NEWS_ENABLED`, `NEWS_DAYS`, `NEWS_MODE` | repo variables |
| käivituste ajalugu, kulu, LLM-logi | artefakt `runs/` 30 päeva + job summary igal käivitusel; kuu summa OpenAI dashboardilt nagu praegu |
| "kas see run on juba avaldatud" | pole vaja: üks job teeb `run` ja `publish-latest` järjest, `published.json` marker jääb artefakti |

Kui tahad repo-sisest pearaamatut, võib `runs/index.jsonl` commit'ida andmefailiga koos
(gitignore erand). Soovitan alustada ilma: kokkuvõtted on Actionsi vahelehel nagunii olemas.

### 5.4 Režiimid

- **`review`** (vaikimisi): PR `news/candidate` → `master`, kirjelduseks `report-latest` väljund.
  Merge on avaldamine. Kui PR-i ei merge'ita, uuendab järgmine käivitus sama PR-i; `master`-i
  andmefail jääb vahepeal vanaks ja leht peidab sektsiooni 96 h pärast, nagu praegu.
- **`auto`**: commit otse `master`-isse. Sinna jõuab ainult väravast läbi käinud andmestik; viga
  tähendab punast käivitust ja e-kirja, mitte tühja lehte. See on README printsiibi "safe to
  publish without routine manual review" lõppseis.

### 5.5 Kaks committijat

portal-api export commit'ib samasse harusse ilma- ja merefaile. Ta kasutab Git Database API-t ja
uuendab haru viidet ilma `force`-ita (`githubClient.updateBranchRef`), seega kui Actions on vahepeal
commit'inud, kukub export selle tunni jooksul läbi ja proovib järgmises aknas uuesti. Failid ei kattu,
sisukonflikti ei teki. Actionsi pool teeb enne push'i `git pull --rebase`. portal-api README
"üks committija haru kohta" saab dokumenteeritud erandi.

### 5.6 Deploy pärast commit'i

`GITHUB_TOKEN`-iga tehtud push ei käivita teisi Actionsi workflow'sid ega GitHub Pagesi ehitust.
Nuxti repos pole praegu ühtegi workflow'd ja README ei ütle, kuidas sait ehitub. Kui ehitus käib
välise teenuse webhooki kaudu (Cloudflare Pages, Netlify vms), käivitub see tavaliselt ka boti
commit'ist; see on G1 kontrollpunkt. Kui ei käivitu, asendatakse `github.token` PAT-iga, mis
portal-api-l juba on, saladusena.

---

## 6. B2 lühidalt: Worker juhib, Actions jooksutab

Sama workflow, kolme erinevusega:

1. Guard-samm küsib Workerilt `GET /api/internal/news/schedule` (jagatud saladusega), kas allikas on
   aktiivne ja `next_due_at` möödas; muutujaid `NEWS_*` pole.
2. Avaldamise asemel `POST /api/internal/news/runs` manifesti, valideerimise, andmestiku ja
   pistekontrolli lehega; Worker kirjutab `external_data_snapshots` ja `news_runs` read täpselt nagu
   variant A §5.3 kirjeldab.
3. Edasi on kõik variant A: kinnitamine admin-UI-s, export-töö neljas fail, üks committija.

Admin-UI "käivita kohe" kutsub GitHubi `workflow_dispatch` REST API-t; selleks on vaja tokenit
õigusega `actions: write` (praegune portal-api token on sisu jaoks). Portal-api töömaht on variant A
W2, W4 ja W5 ilma W1 ja W3-ta.

---

## 7. Faasid ja "valmis" kriteeriumid (B1)

**G0. Otsused** (§9). Valmis: iga punkt on vastatud.

**G1. Workflow ja CLI lisad.** `report-latest` ja `commit` käsud koos testidega (vitest, ilma
võrguta); workflow-fail `master`-isse muutujaga `NEWS_ENABLED=false`, nii et cron ei tee midagi;
`OPENAI_API_KEY` secret. Esimene test on käsitsi käivitus režiimis `review`: see on ise kuiv proov,
sest tulemus on PR, mida keegi ei pea merge'ima. Valmis: PR tekib õige kirjelduse ja andmefailiga,
artefakt ja kokkuvõte on olemas, käivitus kestis alla 5 minuti, ühe käsitsi merge'i järel ehitub
sait ja näitab uudiseid (§5.6 kontroll).

**G2. Ajakava sisse, review-režiim.** `NEWS_ENABLED=true`, `NEWS_DAYS` kokkulepitud päevad. Nädal
PR-ide kinnitamist telefonist. Valmis: 7 päeva ilma käsitsi parandusteta koodis; iga käivitus on
kokkuvõttes nähtav koos kuluga.

**G3. Auto-režiim.** `NEWS_MODE=auto`. Valmis: 14 päeva otse-commit'e ilma punase käivituseta või
iga punane käivitus on põhjusega, mille värav pidigi kinni püüdma.

**G4. Koristus.** Nuxti README uuendus (lokaalne `npm run generate` jääb silumiseks), portal-api
README erand kahe committija kohta, implementatsiooniplaani faasi 8 lõppmärge.

---

## 8. Riskid

| Risk | Maandus |
|---|---|
| Hispaania omavalitsuste lehed blokeerivad andmekeskuse IP-sid (runnerid on Azure'is, USA-s) | G1 esimene käivitus näitab; `reachable` reegel talub ajalõppe; sama risk on Workeri variandil. Kui mõni allikas blokeerib püsivalt, jääb ta `maxCandidatesPerSource` loogikaga lihtsalt tühjaks ja värava `minDistinctSources` ütleb, kas sellest piisab |
| Cron hilineb või jääb koormuse all vahele | GitHub ütleb seda otse; minut 17 väldib täistunni tippu; vahelejäänud päev on nähtav (kokkuvõtet pole) ja andmestik kehtib 96 h |
| Minutikvoot | 120 minutit 2 000-st; e-kiri 90% juures; avalikul repol piiramatu |
| Kaks committijat `master`-il | export'i viite-uuendus kukub ja kordub tunni pärast; Actions teeb `pull --rebase` (§5.5) |
| Boti commit ei käivita saidi ehitust | G1 kontroll; PAT saladusena asendusena (§5.6) |
| Saladus logis | CLI ei trüki võtit; GitHub maskeerib secret'i väärtuse logides; `llm-calls.jsonl` ei sisalda võtit |
| Workflow-fail ainult `master`-is | arenduse ajal testida `workflow_dispatch`-iga, mis saab `--ref` kaudu sihtida ka muud haru, kui fail on korra `master`-is olnud |

---

## 9. Otsused enne esimest koodirida

1. **Variant**: B1 (GitHub juhib ja avaldab), B2 (Worker juhib) või A (Workers Paid). Kui GitHubi
   liides juhtimiseks kõlbab, on B1 kõige odavam ja kiirem tee.
2. **Repo**: Nuxti repo (soovitus) või portal-api koos PAT-iga.
3. **Sagedus ja kellaaeg**: `NEWS_DAYS` algväärtus ja cron-minut.
4. **Režiim alguses**: `review` (soovitus) ja millal `auto`.
5. **Saladus**: `OPENAI_API_KEY` Nuxti repo secret'ina (sama võti, mis lokaalses `.env`-is).
6. **Teine committija `master`-il**: kas aktsepteeritav; alternatiiv on B2.
7. **Artefaktide säilitus**: 30 päeva (soovitus) või muu.

---

## 10. Võrdlus variandiga A

| | A: Workers Paid | B1: GitHub Actions |
|---|---|---|
| Kuukulu | $5 + LLM | $0 + LLM |
| Töömaht enne esimest automaatset avaldamist | io-kihi port, D1 skeem, andmeallikas, export'i laiendus, 5 admin-endpointi, admin-UI | workflow-fail ja kaks CLI käsku |
| Juhtimine | portal-api admin-UI | GitHubi Actions-vaheleht, PR-id, muutujad |
| Kinnitamine | admin-UI nupp | PR-i merge, ka telefonist |
| Alarm vea korral | Workersi logid, admin-nimekiri | e-kiri punase käivituse kohta, tasuta |
| Committijaid `master`-il | üks | kaks |
| Portatavus | kontrollida TextDecoder, cheerio Workersis | olemasolev Node-kood muutmata |
| Ajastuse täpsus | minutiline | tavaliselt minutid, tipptunnil rohkem |

Kui admin-UI juhtimine ei ole nõue, soovitan alustada B1-st: ta on nädalaga töös, ei maksa midagi
ja annab PR-põhise kinnitamise kohe. Variant A jääb lauale hetkeks, kui tahetakse kõik ühes kohas
ja üks committija.
