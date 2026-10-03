# Kohalike uudiste pipeline GitHub Actionsis: teostusplaan

Staatus: S1 tehtud 2026-10-02, S2 ja S3 tehtud 2026-10-03 (workflow on portal-api `master`-is; esimene
käsitsi käivitus õnnestus: 11 mudelikõnet, $0.0122, pipeline'i samm 1 min 21 s, 21 kirjet, 3 tagasilükkamist,
commit `a37dd45` Nuxti `master`-isse). S4 (NEWS_ENABLED=true, nädal igapäevaseid käivitusi) ootab Martinit. Analüüs ja variantide võrdlus on failides
`local-news-worker-plan.md` (Worker) ja `local-news-github-actions-plan.md` (Actions). See dokument on
teostusplaan; kus see analüüsidokumentide visanditest erineb, kehtib see siin.

Otsused, mille Martin 2026-10-02 tegi:

- Uudised genereerib **GitHub Actions**, mitte Worker. Cloudflare jääb Free'ks, portal-api Workeri
  koodi ei muudeta.
- Workflow elab **portal-api repos** ja muudab Nuxti repos **ühte faili**
  `app/data/local-news/latest-news-list.json`, commit otse `master`-isse, täpselt nagu Worker teeb
  ilma- ja merefailidega. PR-i ega kinnitussammu ei ole.
- **Nuxti repos ei muutu midagi** peale selle faili. Pipeline'i kaust `scripts/costaseasons-news-v2`
  jääb sinna, kus ta on, ja uut koodi ei kirjutata.
- Sagedus: **iga päev kell 10:19 Madridi aega**.
- Kõik repod on privaatsed (GitHub Free, 2 000 Actionsi minutit kuus). Kaks committijat `master`-il
  on aktsepteeritud.

---

## 1. Kuidas see töötab

Iga päev kell 10:19 käivitab GitHub portal-api repos oleva workflow'i. See tõmbab Nuxti repo
puhtale Ubuntu masinale, jooksutab pipeline'i kaustas `node src/cli.ts publish --no-cache` ja, kui
värav läbis, on andmefail muutunud; töö commit'ib selle ja push'ib `master`-isse. Kui värav kukkus,
jääb fail puutumata ja käivitus on punane, millest GitHub saadab e-kirja. Käivituse failid
(`runs/`) on 30 päeva artefaktina alles.

Sama asi Workeri kõrval:

| | Worker (ilm, meri) | Actions (uudised) |
|---|---|---|
| Käivitaja | Cron Trigger `wrangler.jsonc`-s | `schedule` workflow-failis |
| Kood jookseb | Cloudflare'i isolaadis | GitHubi Ubuntu masinal, Node 24 |
| Ligipääs Nuxti reposse | PAT secret `GITHUB_TOKEN` | PAT secret `NUXT_REPO_TOKEN` |
| Mida kirjutab | kolm faili Git Database API kaudu | üks fail `git commit` ja `git push` kaudu |
| Sihtharu | `GITHUB_BRANCH` muutuja | `NUXT_BRANCH` muutuja, vaikimisi `master` |
| Sisse/välja | `GITHUB_EXPORT_ENABLED` | `NEWS_ENABLED` |
| Logi | Workersi observability | käivituse leht Actionsi vahelehel |

Miks workflow peab üldse olemas olema: GitHub Actions ei ole server, kuhu saaks töö seadistada.
Ajastatud töö on definitsioon YAML-failina mingi repo kaustas `.github/workflows/`, sama roll,
mis portal-api-s on `crons` kirjel ja handleril. Fail peab olema repo vaikeharus, et cron ja "Run
workflow" nupp töötaksid; portal-api vaikeharu on `master`.

---

## 2. Workflow

Fail on `portal-api/.github/workflows/local-news.yml`; siin dubleerimata, et kaks koopiat ei läheks
lahku. Action'id `actions/checkout`, `actions/setup-node` ja `actions/upload-artifact` on kõik
versioonil `v7` (kontrollitud GitHubi release-lehtedelt 2026-10-02; kõik jooksevad Node 24 peal).

Märkused:

- **Kellaaeg.** `timezone` on GitHubi dokumentatsioonis `schedule` sündmuse võti. Kui valideerija
  seda ei võta, on asendus kaks UTC-croni (`19 8` suvel, `19 9` talvel) ja guard-sammus lisakontroll
  `TZ=Europe/Madrid date +%H` = `10`. Minut 19 ei ole täistund, mille koormuse eest GitHub hoiatab.
- **Sisse/välja ja sagedus** on repo muutujad, muudetavad ilma commit'ita: `NEWS_ENABLED`
  `true`/`false`; `NEWS_DAYS` tühi = iga päev, `1,3,5` = kolm korda nädalas. "Run workflow" nupp
  eirab mõlemat, nagu Workeri admin-endpoint "käivita kohe".
- **Checkout tõmbab ainult Nuxti repo.** portal-api repo sisu töö ei vaja; GitHub loeb sealt
  ainult workflow-faili. PAT jääb checkout'i järel git-konfiguratsiooni, nii et `git push` töötab
  ilma lisasammuta.
- **Sihtharu ja lähteharu on sama** (`NUXT_BRANCH`), nii et testimine harus ei saa kogemata
  `master`-isse midagi lükata. Pipeline'i kood peab olema harus, mida tõmmatakse: praegu on ta Nuxti
  repos harus `local-news-generation`, seega kas merge enne esimest käivitust `master`-isse või
  esimene käivitus `NUXT_BRANCH=local-news-generation` väärtusega.
- **`shell: bash`** on kirjas sellepärast, et siis lülitab GitHub sisse `pipefail`; muidu peidaks
  `| tee` pipeline'i väljumiskoodi 2 ja väravaviga paistaks rohelisena.
- **Väravaviga** (`publish` kood 2) kukutab sammu enne commit'i. Kokkuvõte ja artefakt tehakse
  `if: always()` tõttu ikkagi, seega põhjus on käivituse lehel ilma logi lahti võtmata: CLI oma
  `outcome=` rida ja `validation.json` artefaktis.
- **Andmefail muutub igal õnnestunud käivitusel**, sest `generated_at` uueneb, ja see on taotluslik:
  leht peidab sektsiooni, kui andmestik on üle 96 h vana.
- **`pull --rebase` enne push'i**, sest Worker võis samal tunnil ilma- või merefaili commit'ida.
  Sisukonflikti ei saa tekkida, failid on erinevad. Kui Worker jääb teisele poole, kukub tema
  viite-uuendus (`updateBranchRef` ilma `force`-ita) ja kordub järgmises aknas, nagu praegu.
- **Committija** on sama nimi ja e-post, mis Workeril (`wrangler.jsonc` väärtused on failis
  vaikimisi sees; muutujad `NEWS_COMMITTER_NAME` ja `NEWS_COMMITTER_EMAIL` kirjutavad üle), et Nuxti
  repo ajaloos oleks üks bot.

---

## 3. Seaded portal-api repos

Settings → Secrets and variables → Actions.

| Liik | Nimi | Väärtus |
|---|---|---|
| Secret | `NUXT_REPO_TOKEN` | fine-grained PAT: ainult repo `non-touristic-rentals`, õigus Contents: Read and write. Eraldi token Workeri omast, et kumbagi saaks sõltumatult vahetada; Workeri tokeni taaskasutus töötab ka |
| Secret | `OPENAI_API_KEY` | sama võti, mis lokaalses `.env`-is |
| Variable | `NEWS_ENABLED` | alguses `false` |
| Variable | `NEWS_DAYS` | tühi või lisamata |
| Variable | `NUXT_BRANCH` | lisamata = `master`; testimiseks haru nimi |
| Variable | `NEWS_COMMITTER_NAME`, `NEWS_COMMITTER_EMAIL` | valikulised; vaikimisi `wrangler.jsonc` `GITHUB_COMMITTER_*` väärtused |

PAT-il on aegumiskuupäev. Kui ta aegub, on käivitus punane sõnumiga "Authentication failed"
checkout-sammus; uus token samale secret'ile parandab. Soovitan aegumise kalendrisse panna.

---

## 4. Sammud

Igal sammul on tegija. Mina ei commit'i ega tee mudelikõnesid; esimese päris käivituse (umbes 10
mudelikõnet, umbes 1 sent) käivitad sina nupust.

**S1. Fail portal-api repos (mina, harus `local-news-gereration`). Tehtud 2026-10-02.**
Workflow `.github/workflows/local-news.yml`; README uus lõik "Scheduled Jobs", mis ütleb, et uudised
käivad Actionsist, mitte Workerist, ja viitab siia; selle dokumendi staatus. Action'ite versioonid
kontrollitud (`v7`), `timezone` võti dokumentatsioonist kinnitatud. Lokaalne kontroll `npm run lint:workflows`
(dev-sõltuvus `yaml`, Martini loal 2026-10-03; skript `scripts/check-workflows.mjs`) parsib YAML-i,
kontrollib põhistruktuuri, cron-väljade arvu, action'ite pinnimist, `steps.<id>` viiteid ja iga
`run:` ploki shelli süntaksit `bash -n`-iga; workflow läbib selle. Täielikku skeemi ja action'ite
sisendeid see ei tunne, esimene käsitsi käivitus GitHubis jääb selle osas tegelikuks kontrolliks. `npm test` portal-api-s roheline (74 testi) ja `npx tsc --noEmit` ilma vigadeta; `typecheck` skripti portal-api-s ei ole.

**S2. GitHubi seaded (sina).**
1. Merge portal-api haru `master`-isse: cron ja nupp loevad ainult vaikeharu faili.
2. PAT ja kaks secret'it, muutuja `NEWS_ENABLED=false` (§3; committija nimi ja e-post on failis vaikimisi).
3. Otsus, kas Nuxti haru `local-news-generation` merge'ida enne esimest käivitust `master`-isse
   või panna `NUXT_BRANCH` haru nimele.
Valmis, kui: portal-api Actionsi vahelehel on "Local news" workflow nupuga "Run workflow".

**S3. Esimene käsitsi käivitus (sina käivitad, mina loen tulemust). Tehtud 2026-10-03, vt staatus üleval.**
"Run workflow". Oodatav: 3–5 minutiga roheline käivitus; kokkuvõttes `outcome=published` rida ja
tõlgete pistekontroll; artefakt; Nuxti repos sihtharus uus commit "chore(data): local news
YYYY-MM-DD" ühe failiga; sait ehitub nagu Workeri commit'ide järel. Kui mõni Hispaania allikas
blokeerib runneri IP-d, paistab see `validation.json`-is või `fetch-failures.json`-is; värava
`minDistinctSources` otsustab, kas see loeb.
Valmis, kui: commit on olemas, sait näitab kirjeid, OpenAI dashboardil ~1 sent.

**S4. Ajakava sisse (sina).**
`NEWS_ENABLED=true`, `NUXT_BRANCH` eemaldatud või `master`.
Valmis, kui: 7 järjestikust igapäevast käivitust kell 10:19 ilma koodiparanduseta; iga punane
käivitus oli väravaviga, mille põhjus oli kokkuvõttes loetav.

**S5. Koristus (mina).**
portal-api README: erand "üks committija haru kohta" reeglile; Nuxti implementatsiooniplaani faasi 8
lõppmärge; selle dokumendi staatus "töös".

---

## 5. Käitumine erijuhtudel

| Olukord | Mis juhtub |
|---|---|
| Värav kukub (alla 5 kirje, alla 3 allika, duplikaadid) | kood 2, punane käivitus, e-kiri; faili ei puututa; sektsioon kaob lehelt 96 h pärast viimast õnnestunud avaldamist, nagu praegu |
| Mudel või OpenAI ei vasta | `ProviderError`, kood 1, punane käivitus; järgmine päev proovib uuesti |
| Worker commit'ib samal minutil | Actions teeb `pull --rebase`; kui Worker jääb teisele poole, kukub tema viite-uuendus ja kordub järgmises aknas |
| Cron hilineb | GitHub võib tipptunnil viivitada; 10:19 ei ole tipp; hilinenud käivitus on ikkagi sama päeva käivitus |
| PAT aegub | punane käivitus checkout-sammus; uus token samale secret'ile |
| Käsitsi käivitus `NEWS_ENABLED=false` ajal | töötab; nupp eirab lülitit |
| Kaks käivitust korraga | `concurrency` paneb teise ootele |
| Testimine harus | `NUXT_BRANCH=<haru>`: tõmbab ja push'ib sama haru, `master`-it ei puutu |
| Minutikvoot | ~4 min päevas ≈ 120 kuus 2 000-st; vahelejäetud päev maksab 1 min; GitHub hoiatab 90% juures |

---

## 6. AGENTS.md väravad

portal-api `AGENTS.md` nõuab kinnitust ajastatud töö lisamisele ja kõigele, mis tõstab kulu või
töökeerukust. Martin kinnitas 2026-10-02 suuna, kellaaja ja otse-commit'i. Seis:

- Ajastatud töö: lisandub GitHub Actionsis, mitte Workeris; Workeri cronid ja kood ei muutu.
- Sõltuvused: portal-api-sse ei lisandu ühtegi.
- Cloudflare'i tooted ja kulu: ei muutu.
- Saladused: kaks uut GitHubi Actionsi secret'it portal-api repos (§3), mitte wrangler secret'id.
- Kulu väljaspool Cloudflare'i: Actionsi minutid tasuta kvoodis; OpenAI ~1 sent käivituse kohta,
  umbes 30 senti kuus.

---

## 7. Riskid

| Risk | Maandus |
|---|---|
| Hispaania lehed blokeerivad andmekeskuse IP-sid (runnerid on Azure'is) | S3 näitab; sama risk oleks Workeril; värav otsustab, kas allikaid jätkub |
| `timezone` võti ei tööta | kaks UTC-croni + tunnikontroll guard'is |
| Shallow checkout ja `pull --rebase` | tõmmatakse ainult uued commit'id meie baasi peale, töötab; kui mitte, `fetch-depth: 0` checkout'is |
| PAT lekib logisse | GitHub maskeerib secret'ite väärtused; CLI ei trüki võtmeid; artefaktid ei sisalda tokeneid |
