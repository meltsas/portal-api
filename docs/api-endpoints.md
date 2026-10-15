# API endpoints — portal-api

Praktiline ülevaade `portal-api` Workeri HTTP endpointidest. Iga endpointi juures on method, path, lühikirjeldus, request body (kui on) ja response shape.

Routerid asuvad:

- Public routes: `src/routes/public.ts`
- Auth routes: `src/routes/auth.ts`
- Admin routes: `src/routes/admin.ts`
- Tenant details form routes: `src/routes/tenantForms.ts`

> Kõik response bodyd on JSON. Vea korral tagastatakse `{ "error": "<message>" }` koos vastava HTTP statusega (400, 401, 403, 404, 405, 409, 410, 411, 413, 415, 422). Erand: `GET /api/admin/tenant-forms/files/:fileId` tagastab faili enda.

---

## 1. Üldreeglid

Kõik endpointid asuvad prefixi `/api` all.

Response bodyd on alati JSON, `Content-Type: application/json`.

Standardvigade kuju:

```json
{ "error": "Invalid or missing JSON body" }
```

Standardsed status codid:

- `200 OK` — tavaline õnnestumine.
- `201 Created` — uus resource (lead, offer) loodud.
- `400 Bad Request` — invalid payload või validation viga.
- `401 Unauthorized` — sessioon puudub või on aegunud.
- `403 Forbidden` — sisselogimisel (`POST /api/auth/google`) email pole admin allowlistis; tenant formi puhul on link seotud teise Google kontoga.
- `404 Not Found` — route ei klappi või resource puudub.
- `405 Method Not Allowed` — path on olemas, kuid method ei ole.
- `409 Conflict` — slug juba olemas; tenant formi puhul juba saadetud vorm või täis failipiirang.
- `410 Gone` — tenant formi invitation on aegunud või tühistatud.
- `411 Length Required` — faili üleslaadimisel puudub `Content-Length`.
- `413 Content Too Large` — fail või request body on lubatust suurem.
- `415 Unsupported Media Type` — failitüüp pole lubatud.
- `422 Unprocessable Entity` — payload kehtiv, aga business reegel takistab (näiteks offer pole `active`).

Public routed ei nõua auth-i. Auth routed haldavad sessiooni cookiet `session`. Admin routed nõuavad kehtivat sessiooni cookie'd (vt jaotis 6).

---

## 2. Public — Health

### `GET /api/health`

Lihtne liveness probe, kasutatav Cloudflare healthchecki ja CI smoke-testidena.

**Request body:** puudub.

**Response 200:**

```json
{ "status": "ok" }
```

---

## 3. Public — Offers

### `GET /api/offers`

Tagastab kõik avalikult nähtavad pakkumised (ainult `status = 'active'`). Mõeldud portali avalehe / offer-listi jaoks.

**Request body:** puudub.

**Response 200:**

```json
{
  "data": [
    {
      "slug": "orihuela-costa-playa-flamenca",
      "title": "Playa Flamenca apartment",
      "locationName": "Orihuela Costa, Spain",
      "summary": "Two-bedroom apartment, 200m from the beach.",
      "coverImageUrl": "https://assets.example.com/offers/playa-flamenca/cover.webp"
    }
  ]
}
```

Iga element on `PublicOfferSummary` (`src/types/api.ts`). Väljad `locationName`, `summary`, `coverImageUrl` võivad olla `null`.

---

### `GET /api/offers/:slug`

Tagastab ühe pakkumise detailvaate slug'i järgi (ainult `status = 'active'`). Lisaks pakkumise põhiväljadele tagastatakse availability periodide nimekiri, kus on ainult `available` ja `tentative` perioodid (avalikult `blocked` perioode ei näidata).

**Path params:**

- `slug` — pakkumise URL-sõbralik identifikaator.

**Request body:** puudub.

**Response 200:**

```json
{
  "slug": "orihuela-costa-playa-flamenca",
  "title": "Playa Flamenca apartment",
  "locationName": "Orihuela Costa, Spain",
  "summary": "Two-bedroom apartment, 200m from the beach.",
  "coverImageUrl": "https://assets.example.com/offers/playa-flamenca/cover.webp",
  "availability": [
    {
      "dateFrom": "2026-06-01",
      "dateTo": "2026-06-15",
      "status": "available"
    },
    {
      "dateFrom": "2026-07-10",
      "dateTo": "2026-07-20",
      "status": "tentative"
    }
  ]
}
```

**Response 404:**

```json
{ "error": "Not found" }
```

Tagastatakse kui slug ei klappi või offer pole `active`.

---

## 4. Public — Leads

### `POST /api/leads`

Esitab portali kontaktivormi lead'i. Identiteet kinnitatakse **iga päringu kohta** Google ID tokeniga — sessioonicookiet ei kasutata, sisselogimisolekut ei säilitata. Email võetakse ainult verifitseeritud tokenist; clientilt seda ei aktsepteerita.

Dedup: kui samalt emailit on selle offer'i kohta juba lead olemas (mis pole `archived`), uuendatakse seda kirjet uue payloadiga ja `updated_at`'iga. Muidu luuakse uus rida.

Rate limiting / abuse protection on plaanitud Cloudflare WAF / Rate Limiting reeglite tasemel, mitte Workeris.

**Request body (`SubmitLeadPayload`):**

```json
{
  "offerId": "0f9c0f4e-3a1e-4d2a-9b8a-1d0a8e0a3f2b",
  "name": "Jane Doe",
  "message": "Interested in early June.",
  "dateFrom": "2026-06-01",
  "dateTo": "2026-07-01",
  "reasonOfStay": "pensioner_seasonal",
  "googleToken": "<google-id-token>"
}
```

Validation:

- `googleToken` — required, mitte-tühi string. Verifitseeritakse läbi `verifyGoogleIdToken` (audience = `env.GOOGLE_CLIENT_ID`).
- `offerId` — required, mitte-tühi string (offer'i UUID).
- `name` — required, mitte-tühi, kuni 200 chars.
- `message` — required, mitte-tühi, kuni 2000 chars.
- `dateFrom`, `dateTo` — required, päris kuupäevad formaadis `YYYY-MM-DD` (nt `2026-02-30` lükatakse tagasi), vähemalt 14 ööd (`MIN_STAY_NIGHTS` failis `src/utils/stay.ts`).
- `reasonOfStay` — optional, string või `null`, kuni 300 chars. Trimmitakse; tühi string salvestatakse `null`'ina.
- Email **ei tule** payloadist — see võetakse verifitseeritud token claim'ist (`email`) ja salvestatakse lowercase'is. Token claim `sub` salvestatakse `auth_subject`'ina, `auth_provider = 'google'`.

**Response 200:**

```json
{ "ok": true }
```

Tagastatakse nii uue lead'i loomisel kui ka olemasoleva uuendamisel.

**Response 400:**

```json
{ "error": "googleToken is required" }
```

Muud võimalikud sõnumid: `offerId is required`, `name is required`, `message is required`, `dateFrom must be YYYY-MM-DD`, `dateTo must be YYYY-MM-DD`, `stay must be at least 14 nights`, `name must be at most 200 characters`, `message must be at most 2000 characters`, `reasonOfStay must be a string`, `reasonOfStay must be at most 300 characters`, `Offer not found`, `Invalid or missing JSON body`.

**Response 401:**

```json
{ "error": "Invalid Google token" }
```

Tagastatakse kui Google ID token ei verifitseeru (vale audience, aegunud token, vale signatuur jne).

**Response 422:**

```json
{ "error": "Offer is not currently active" }
```

Tagastatakse kui offer eksisteerib, aga pole `active` staatuses.

---

## 5. Auth

Auth flow põhineb Google ID tokenil. Frontend saab Google'ist ID tokeni, postib selle `/api/auth/google` peale, server verifitseerib selle, kontrollib emailit allowlisti vastu (`src/utils/adminAllowlist.ts`) ja seab HMAC-allkirjastatud sessiooni cookie `session` (payload `{ typ: "admin", email, exp }`, secret `SESSION_SECRET`).

Cookie atribuudid:

- `HttpOnly`
- `Secure`
- `SameSite=None`
- `Path=/`
- `Max-Age=86400` (24 tundi)

---

### `POST /api/auth/google`

Vahetab Google ID tokeni sessiooni cookie vastu.

**Request body:**

```json
{ "token": "<google-id-token>" }
```

**Response 200:**

```json
{ "ok": true }
```

Lisaks seatakse vastuses `Set-Cookie: session=...` header.

**Response 400:**

```json
{ "error": "token is required" }
```

**Response 401:**

```json
{ "error": "Invalid Google token" }
```

Tagastatakse kui Google token ei verifitseeru (sealhulgas vale `aud`, aegunud token jne).

**Response 403:**

```json
{ "error": "Forbidden" }
```

Tagastatakse kui token kehtib, aga email pole admin allowlistis (`src/utils/adminAllowlist.ts`).

---

### `POST /api/auth/logout`

Tühistab sessiooni cookie. Endpoint ei kontrolli olemasolevat sessiooni — kutsub lihtsalt cookie tagasi `Max-Age=0`'iga.

**Request body:** puudub.

**Response 200:**

```json
{ "ok": true }
```

Vastuses on `Set-Cookie: session=; Max-Age=0; ...`.

---

### `GET /api/auth/me`

Tagastab praeguse sessiooni email'i. Kasulik admin UI-le, et kontrollida, kas kasutaja on sisse logitud.

**Request body:** puudub.

**Cookies:** vajalik kehtiv `session`.

**Response 200:**

```json
{ "email": "martin.meltsas@googlemail.com" }
```

**Response 401:**

```json
{ "error": "Unauthorized" }
```

---

## 6. Admin — auth nõue

Kõik `/api/admin/*` routed jooksevad läbi `requireAdmin()` middleware'i (`src/middleware/requireAdmin.ts` → `requireAuth`). Igal päringul kontrollitakse:

- `session` cookie HMAC allkiri (`SESSION_SECRET`) ja tüüp `typ: "admin"` (muu tüübiga token, nt tenant formi token, ei sobi);
- `exp` pole möödas;
- email on endiselt admin allowlistis. Emaili eemaldamine allowlistist lõpetab kohe selle sessionid.

Kõik need vead annavad admin endpointidel `401 Unauthorized` (`{ "error": "Unauthorized" }`). `403` tuleb ainult sisselogimisel.

---

## 7. Admin — Offers

### `GET /api/admin/offers`

Listib kõik offerid (kõikides staatustes, mitte ainult `active`). Sorteeritud `created_at DESC`.

**Query params:**

- `status` — optional. Üks väärtustest `draft`, `active`, `inactive`, `archived`. Kui antakse muu, tagastatakse 400.

**Response 200:**

```json
{
  "data": [
    {
      "id": "0f9c...-uuid",
      "slug": "orihuela-costa-playa-flamenca",
      "title": "Playa Flamenca apartment",
      "locationName": "Orihuela Costa, Spain",
      "status": "active",
      "coverImageUrl": "https://assets.example.com/offers/playa-flamenca/cover.webp",
      "createdAt": "2026-04-10T08:32:11.000Z",
      "updatedAt": "2026-04-22T14:01:02.000Z"
    }
  ]
}
```

**Response 400:**

```json
{ "error": "Invalid status filter. Must be one of: draft, active, inactive, archived" }
```

---

### `POST /api/admin/offers`

Loob uue pakkumise.

**Request body (`CreateOfferPayload`):**

```json
{
  "slug": "orihuela-costa-playa-flamenca",
  "title": "Playa Flamenca apartment",
  "locationName": "Orihuela Costa, Spain",
  "summary": "Two-bedroom apartment, 200m from the beach.",
  "status": "draft",
  "coverImageUrl": "https://assets.example.com/offers/playa-flamenca/cover.webp"
}
```

Validation:

- `slug` — required, lowercase alphanumeric + hyphens, regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, kuni 120 chars.
- `title` — required, kuni 300 chars.
- `locationName` — optional, kuni 200 chars.
- `summary` — optional, kuni 2000 chars.
- `coverImageUrl` — optional, kuni 1000 chars.
- `status` — optional, default `draft`. Üks väärtustest `draft`, `active`, `inactive`, `archived`.

**Response 201:**

```json
{ "id": "0f9c...-uuid", "slug": "orihuela-costa-playa-flamenca" }
```

**Response 400:** validation error (näiteks `slug must be lowercase alphanumeric with hyphens, max 120 characters`).

**Response 409:**

```json
{ "error": "An offer with this slug already exists" }
```

---

### `PUT /api/admin/offers/:offerId`

Uuendab olemasolevat pakkumist. Vaid kohal olevad väljad uuendatakse — st. `PATCH`-laadne semantika `PUT`-i taga. Slug'i ei saa selle endpointiga muuta.

**Path params:**

- `offerId` — pakkumise UUID.

**Request body (`UpdateOfferPayload`, kõik väljad optional):**

```json
{
  "title": "Playa Flamenca apartment (updated)",
  "locationName": "Orihuela Costa, Spain",
  "summary": "Updated summary.",
  "status": "active",
  "coverImageUrl": "https://assets.example.com/offers/playa-flamenca/cover-v2.webp"
}
```

Validation langeb kokku create-endpointiga (samad pikkuspiirid ja staatuse väärtused). Kui body ei sisalda ühtegi tunnustatud välja, tagastatakse 400 sõnumiga `No fields to update`.

**Response 200:**

```json
{ "id": "0f9c...-uuid", "slug": "orihuela-costa-playa-flamenca" }
```

**Response 404:** offer pole olemas.

**Response 400:** validation error.

---

## 8. Admin — Availability

Availability on offer-ile seotud kuupäevavahemikud staatusega `available`, `blocked` või `tentative`. Avalikult tagastatakse ainult `available` ja `tentative` (vt `GET /api/offers/:slug`); admin näeb kõike.

### `GET /api/admin/offers/:offerId/availability`

Listib offer-i kõik availability perioodid, sorteeritud `date_from`.

**Path params:**

- `offerId` — pakkumise UUID.

**Response 200:**

```json
{
  "data": [
    {
      "id": "5b2e...-uuid",
      "dateFrom": "2026-06-01",
      "dateTo": "2026-06-15",
      "status": "available",
      "note": null
    },
    {
      "id": "7c1d...-uuid",
      "dateFrom": "2026-06-15",
      "dateTo": "2026-06-22",
      "status": "blocked",
      "note": "Owner using"
    }
  ]
}
```

**Response 404:** offer pole olemas.

---

### `PUT /api/admin/offers/:offerId/availability`

Bulk-replace operatsioon: kustutab kõik selle offer-i availability'd ja kirjutab need uuesti payload'i põhjal. Operatsioon jooksutatakse D1 batch'ina.

**Path params:**

- `offerId` — pakkumise UUID.

**Request body (`UpdateAvailabilityPayload`):**

```json
{
  "periods": [
    {
      "dateFrom": "2026-06-01",
      "dateTo": "2026-06-15",
      "status": "available",
      "note": null
    },
    {
      "dateFrom": "2026-06-15",
      "dateTo": "2026-06-22",
      "status": "blocked",
      "note": "Owner using"
    }
  ]
}
```

Validation:

- `periods` — peab olema array, kuni 50 elementi.
- Igas elemendis: `dateFrom`, `dateTo` formaadis `YYYY-MM-DD`, `dateFrom < dateTo`.
- `status` — `available`, `blocked` või `tentative`.
- `note` — optional string, kuni 500 chars (või `null`).
- Vahemikud ei tohi omavahel kattuda (sorteeritakse `dateFrom` järgi ja kontrollitakse, et iga järgmise `dateFrom` ei ole väiksem eelmise `dateTo`-st).

**Response 200:**

```json
{ "success": true, "count": 2 }
```

**Response 400:** validation error, näiteks `periods[1].dateFrom must be before dateTo` või `Availability periods must not overlap`.

**Response 404:** offer pole olemas.

---

## 9. Admin — Leads

### `GET /api/admin/leads`

Listib lead'id koos seotud offer'i pealkirjaga (LEFT JOIN — offer võib olla kustutatud). Sorteeritud `created_at DESC`. Iga rida sisaldab kõiki lead'i DB-välju (sh `adminNotes`, `reasonOfStay`, `authProvider`, `source`).

**Query params:**

- `status` — optional. Üks väärtustest `new`, `contacted`, `closed`, `spam`, `archived`.
- `offerId` — optional. Filtrib ainult ühe offer-i lead'id.

**Response 200:**

```json
{
  "data": [
    {
      "id": "9f6c...-uuid",
      "offerId": "0f9c...-uuid",
      "offerTitle": "Playa Flamenca apartment",
      "status": "new",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": null,
      "message": "Interested in early June.",
      "requestedDateFrom": "2026-06-01",
      "requestedDateTo": "2026-06-08",
      "reasonOfStay": "Family holiday with two kids",
      "authProvider": "google",
      "source": "portal_form",
      "adminNotes": null,
      "remoteIp": "203.0.113.42",
      "userAgent": "Mozilla/5.0 ...",
      "createdAt": "2026-04-25T11:08:32.000Z",
      "updatedAt": "2026-04-25T11:08:32.000Z"
    }
  ]
}
```

**Response 400:**

```json
{ "error": "Invalid status filter. Must be one of: new, contacted, closed, spam, archived" }
```

---

### `POST /api/admin/leads`

Admini käsitsi loodud lead. Erinevalt avalikust `POST /api/leads`-ist Google ID tokenit ei nõuta — admin annab `email`'i otse. `auth_provider` ja `auth_subject` jäävad `null`'iks; `source = 'admin_manual'`.

**Request body (`CreateLeadPayload`):**

```json
{
  "offerId": "0f9c0f4e-3a1e-4d2a-9b8a-1d0a8e0a3f2b",
  "email": "jane@example.com",
  "name": "Jane Doe",
  "message": "Phoned in — wants the apartment for early June.",
  "dateFrom": "2026-06-01",
  "dateTo": "2026-06-08",
  "reasonOfStay": "Family holiday with two kids"
}
```

Validation:

- `offerId` — required, mitte-tühi string. Offer peab eksisteerima (status'e siin ei kontrollita — admin võib lisada lead'i ka draft/inactive offer-ile).
- `email` — required, kuni 254 chars, peab matchima `^[^\s@]+@[^\s@]+\.[^\s@]+$`. Salvestatakse lowercase'is.
- `name` — required, mitte-tühi, kuni 200 chars.
- `message` — required, mitte-tühi, kuni 2000 chars.
- `dateFrom`, `dateTo` — required, formaadis `YYYY-MM-DD`, `dateFrom <= dateTo`.
- `reasonOfStay` — optional, string või `null`, kuni 300 chars.
- Public flow'i dedup'i siin **ei rakendata** — admin võib teadlikult lisada uue rea ka kui samale (email, offerId)-le on lead juba olemas.

**Response 201:**

```json
{ "id": "9f6c0f4e-3a1e-4d2a-9b8a-1d0a8e0a3f2b" }
```

**Response 400:** validation error (nt. `email is required`, `Invalid email format`, `dateFrom must be YYYY-MM-DD`, `Offer not found`, `reasonOfStay must be at most 300 characters`, `Invalid or missing JSON body`).

---

### `GET /api/admin/leads/:leadId`

Tagastab ühe lead'i kogu detailvaate (sisaldab kõiki lead'i DB-välju: `message`, `adminNotes`, `reasonOfStay`, `authProvider`, `source` jne).

**Path params:**

- `leadId` — lead'i UUID.

**Response 200:**

```json
{
  "id": "9f6c...-uuid",
  "offerId": "0f9c...-uuid",
  "offerTitle": "Playa Flamenca apartment",
  "status": "new",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": null,
  "message": "Interested in early June.",
  "requestedDateFrom": "2026-06-01",
  "requestedDateTo": "2026-06-08",
  "reasonOfStay": "Family holiday with two kids",
  "authProvider": "google",
  "source": "portal_form",
  "adminNotes": null,
  "remoteIp": "203.0.113.42",
  "userAgent": "Mozilla/5.0 ...",
  "createdAt": "2026-04-25T11:08:32.000Z",
  "updatedAt": "2026-04-25T11:08:32.000Z"
}
```

**Response 404:** lead pole olemas.

---

### `PUT /api/admin/leads/:leadId`

Uuendab lead'i. Admin võib muuta nii operatsioonilisi välju (`status`, `adminNotes`) kui ka content-välju (`name`, `email`, `phone`, `message`, `requestedDateFrom`, `requestedDateTo`, `reasonOfStay`). `offerId`'d **ei saa** selle endpointiga muuta — vale offer'i tuvastamise puhul soovita `status: "archived"` + uus lead.

**Path params:**

- `leadId` — lead'i UUID.

**Request body (`UpdateLeadPayload`, vähemalt üks väli kohustuslik):**

```json
{
  "status": "contacted",
  "adminNotes": "Called back, sending quote tomorrow.",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+372 5555 5555",
  "message": "Interested in early June.",
  "requestedDateFrom": "2026-06-01",
  "requestedDateTo": "2026-06-08",
  "reasonOfStay": "Family holiday with two kids"
}
```

Validation:

- `status` — `new`, `contacted`, `closed`, `spam` või `archived`.
- `adminNotes` — string või `null`, kuni 5000 chars. Trimmitakse; tühi string normaliseeritakse `null`'iks.
- `name` — string, mitte-tühi, kuni 200 chars. (DB-veerg on `NOT NULL`, seega `null`/`""` lükatakse tagasi.)
- `email` — string, mitte-tühi, kuni 254 chars, peab matchima `^[^\s@]+@[^\s@]+\.[^\s@]+$`. Salvestatakse lowercase'is. (DB-veerg on `NOT NULL`.)
  - **NB:** see kirjutab üle ka algselt Google'iga verifitseeritud emaili lead'idel, mille `auth_provider = 'google'`. Admin override on tahtlik. `auth_subject` jäetakse puutumata kui originaalse verifitseerimise jälg.
- `phone` — string või `null`, kuni 30 chars. Tühi string normaliseeritakse `null`'iks.
- `message` — string või `null`, kuni 2000 chars. Tühi string normaliseeritakse `null`'iks.
- `requestedDateFrom`, `requestedDateTo` — string formaadis `YYYY-MM-DD` või `null`. Cross-field-kontroll: kui mõlemad lõppväärtused on mitte-`null` (kombineerituna olemasoleva DB-väärtusega kui ainult üks on payloadis), peab `requestedDateFrom <= requestedDateTo`.
- `reasonOfStay` — string või `null`, kuni 300 chars. Tühi string normaliseeritakse `null`'iks.
- Kui body ei sisalda ühtegi tunnustatud välja, tagastatakse 400 sõnumiga `No fields to update`.

**Response 200:**

```json
{ "id": "9f6c...-uuid", "status": "contacted" }
```

`status` on uus väärtus kui see oli payloadis, muidu olemasolev väärtus.

**Response 404:** lead pole olemas.

**Response 400:** validation error (näiteks `name must be a non-empty string`, `Invalid email format`, `requestedDateFrom must be YYYY-MM-DD or null`, `requestedDateFrom must not be after requestedDateTo`, `reasonOfStay must be at most 300 characters`).

---

### `DELETE /api/admin/leads/:leadId`

Kustutab lead'i andmebaasist (hard delete). Soft-delete jaoks kasuta `PUT /api/admin/leads/:leadId` koos `status: "archived"`.

**Path params:**

- `leadId` — lead'i UUID.

**Request body:** puudub.

**Response 200:**

```json
{ "id": "9f6c...-uuid", "deleted": true }
```

**Response 404:** lead pole olemas (D1 `meta.changes === 0`).

---

## 10. Admin — Customers

Customer kirjed sisaldavad tundlikke andmeid (national ID, dokumendi number, sissetulekud, pereliikmed). Kõik customer endpointid on **admin-only** (`requireAdmin()` guard); avalikku ligipääsu ei ole.

Customer võib olla seotud lead'iga `sourceLeadId` kaudu (FK `leads.id`, `ON DELETE SET NULL`). Lead'i kustutamine **ei** kustuta customer'it — admin peab seose kaotuse käsitsi käsitlema.

Tabelis on tähtsamad väljad:

- `fullName`, `email` — required.
- `phone`, `primaryAddress`, `dateOfBirth`, `nationality`, `nationalIdNumber`, `documentNumber`, `occupation`, `employerOrPensionInfo`, `incomeNotes`, `notes` — kõik tekstiväljad, default `''` (NULL'i ei kasuta).
- `sex` (`female` / `male` / `other`) ja `documentType` (`passport` / `id_card` / `residence_permit`) — tenant formi valikuvõtmed, `''` kui teadmata. Need ja `nationality` lisandusid migratsiooniga `0012` (faas 9), et tenant formi konversioon saaks registreerimiseks vajalikud andmed customerisse kanda.
- `familyMembersJson` — JSON-encoded array string. Default `'[]'`. POST/PUT puhul valideeritakse, et väärtus on parsitav JSON ja et root on array.
- `status` — `active` / `inactive` / `archived`. Default `active`.

---

### `GET /api/admin/customers`

Listib customerid, sorteeritud `created_at DESC`.

**Query params:**

- `status` — optional. `active` / `inactive` / `archived`.
- `search` — optional. LIKE-otsing `full_name` ja `email` vastu (case-sensitivity sõltub D1 collation'ist).

**Response 200:**

```json
{
  "data": [
    {
      "id": "c1...-uuid",
      "sourceLeadId": null,
      "fullName": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+372 5555 5555",
      "status": "active",
      "createdAt": "2026-05-01T10:00:00.000Z",
      "updatedAt": "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

List response sisaldab teadlikult **kompaktset** välja-komplekti — tundlikud read (national ID, doc nr, income, family) on ainult detailvaates.

**Response 400:**

```json
{ "error": "Invalid status filter. Must be one of: active, inactive, archived" }
```

---

### `GET /api/admin/customers/:id`

Tagastab ühe customer'i kogu detailvaate (kõik DB-väljad sh. tundlikud).

**Path params:**

- `id` — customer'i UUID.

**Response 200:**

```json
{
  "id": "c1...-uuid",
  "sourceLeadId": "9f6c...-uuid",
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+372 5555 5555",
  "primaryAddress": "Some Street 12, Tallinn",
  "dateOfBirth": "1990-04-15",
  "nationality": "Estonian",
  "sex": "female",
  "documentType": "id_card",
  "nationalIdNumber": "39004150123",
  "documentNumber": "AA1234567",
  "occupation": "Software engineer",
  "employerOrPensionInfo": "Acme Inc.",
  "incomeNotes": "Stable monthly income",
  "familyMembersJson": "[{\"name\":\"Kid Doe\",\"age\":7}]",
  "notes": "Repeat customer",
  "status": "active",
  "createdAt": "2026-05-01T10:00:00.000Z",
  "updatedAt": "2026-05-01T10:00:00.000Z"
}
```

**Response 404:** customer pole olemas.

---

### `POST /api/admin/customers`

Loob uue customer'i.

**Request body (`CreateCustomerPayload`):**

```json
{
  "sourceLeadId": "9f6c...-uuid",
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+372 5555 5555",
  "primaryAddress": "Some Street 12, Tallinn",
  "dateOfBirth": "1990-04-15",
  "nationality": "Estonian",
  "sex": "female",
  "documentType": "id_card",
  "nationalIdNumber": "39004150123",
  "documentNumber": "AA1234567",
  "occupation": "Software engineer",
  "employerOrPensionInfo": "Acme Inc.",
  "incomeNotes": "Stable monthly income",
  "familyMembersJson": "[{\"name\":\"Kid Doe\",\"age\":7}]",
  "notes": "Repeat customer",
  "status": "active"
}
```

Validation:

- `fullName` — required, mitte-tühi, kuni 200 chars.
- `email` — required, kuni 254 chars, peab matchima `^[^\s@]+@[^\s@]+\.[^\s@]+$`. Salvestatakse lowercase'is.
- `phone` — optional, kuni 30 chars.
- `primaryAddress` — optional, kuni 800 chars (tenant formist kokku pandud aadress võib olla pikk).
- `dateOfBirth`, `nationality`, `nationalIdNumber`, `documentNumber` — optional, kuni 100 chars (`dateOfBirth` formaadi sundi siin pole — võib olla nt `1990-04-15` või vabas vormis).
- `sex`, `documentType` — optional, tühi või üks ülaltoodud valikuvõtmetest; muu väärtus → 400.
- `occupation` — optional, kuni 600 chars.
- `employerOrPensionInfo`, `incomeNotes` — optional, kuni 2000 chars.
- `notes` — optional, kuni 5000 chars.
- `familyMembersJson` — optional. Kui antakse, peab olema valid JSON, mis parseb arrayks. Tühi string normaliseeritakse `'[]'`'ks. Max 10 000 chars.
- `status` — optional, default `active`.
- `sourceLeadId` — optional, string või `null`. Lead'i olemasolu **ei** kontrollita siin (FK on `ON DELETE SET NULL`).

**Response 201:**

```json
{ "id": "c1...-uuid" }
```

**Response 400:** validation error (näiteks `fullName is required`, `Invalid email format`, `familyMembersJson must be valid JSON`, `familyMembersJson must encode a JSON array`, `Invalid or missing JSON body`).

---

### `PUT /api/admin/customers/:id`

Uuendab olemasoleva customer'i. Vaid kohal olevad väljad uuendatakse — kasuta `null`'i / tühja stringi tähenduslikult, sest kõik string-väljad salvestatakse trimmituna ja saavad väärtuse `''` kui sisendiks anti tühi string.

**Path params:**

- `id` — customer'i UUID.

**Request body (`UpdateCustomerPayload`, kõik väljad optional):**

Sama field-set nagu `CreateCustomerPayload`, kõik väljad optional. Kui body ei sisalda ühtegi tunnustatud välja, tagastatakse 400 sõnumiga `No fields to update`. `updated_at` seadetakse SQL `CURRENT_TIMESTAMP`'iks.

**Response 200:**

```json
{ "id": "c1...-uuid" }
```

**Response 404:** customer pole olemas.

**Response 400:** validation error.

---

## 11. Admin — Bookings

`bookings` on **single source of truth** offer'i hõivatud / reserveeritud / blokeeritud perioodide kohta — customer stay, owner use, maintenance, blocked, other. Tulevane avalik availability endpoint (`GET /api/offers/:slug/availability?dateFrom=...&dateTo=...`) tuletatakse selle tabeli pealt; **käesolev task seda endpointi ei implementeeri**.

> Vana `offer_availability` / `offers_availability` tabel on alles, kuid uus booking/availability loogika seda **ei kasuta**. Ära kustuta seda tabelit selles taskis.

DB-tase tagab:

- `CHECK (date_to > date_from)` — null-pikkusega või tagurpidi vahemikud lükatakse SQL'is tagasi.
- `CHECK booking_type IN (customer_stay, owner_use, maintenance, blocked, other)`
- `CHECK status IN (draft, tentative, confirmed, cancelled, completed)`
- FK `offers.id ON DELETE CASCADE` — offer'i kustutamine pühib bookingud.
- FK `customers.id ON DELETE SET NULL` — customer'i kustutamine säilitab booking'u, kustutab seose.
- FK `leads.id ON DELETE SET NULL` — `sourceLeadId` puhul sama loogika.

Booking-tüüp ja customer-seose reegel:

- `customer_stay` — eelistab `customerId`, kuid MVP staadiumis võib jätta tühjaks.
- `owner_use`, `maintenance`, `blocked`, `other` — `customerId` peab tavaliselt olema `null`.

Default väärtused: `bookingType = customer_stay`, `status = tentative`, `currency = 'EUR'`, `adults = 0`, `children = 0`, `priceTotalCents = NULL`, kõik tekst-väljad default `''`.

### Overlap-kontroll

Enne `POST` ja `PUT` operatsioone (juhul kui resultaadi `status` on **blocking**) kontrollitakse, kas teisel sama offer'i bookingul on kattuv kuupäevavahemik.

Blocking statused:

- `tentative`
- `confirmed`

Non-blocking statused (overlap'i ei tekita):

- `draft`
- `cancelled`
- `completed`

Overlap'i loogika:

```sql
existing.date_from < new.date_to AND existing.date_to > new.date_from
```

`PUT` puhul jäetakse oma rida (`b.id`) sellest kontrollist välja.

Overlap'i avastamisel tagastatakse `409 Conflict`:

```json
{ "error": "Booking overlaps an existing tentative or confirmed booking for this offer" }
```

---

### `GET /api/admin/bookings`

Listib bookingud koos joinitud offer ja customer infoga, sorteeritud `date_from DESC`.

**Query params:** kõik optional, kombineeruvad AND-iga.

- `offerId` — UUID.
- `customerId` — UUID.
- `status` — `draft` / `tentative` / `confirmed` / `cancelled` / `completed`.
- `bookingType` — `customer_stay` / `owner_use` / `maintenance` / `blocked` / `other`.
- `dateFrom` — `YYYY-MM-DD`.
- `dateTo` — `YYYY-MM-DD`. Kui mõlemad antud, peab `dateFrom < dateTo`.

Date-range filter tagastab bookingud, mis **kattuvad** antud aknaga, mitte ainult need, mis on aknas täielikult sees:

```sql
booking.date_from < query.dateTo AND booking.date_to > query.dateFrom
```

Kui ainult `dateFrom` on antud — tagastab kõik bookingud, mille `date_to > dateFrom`. Kui ainult `dateTo` — kõik, mille `date_from < dateTo`.

**Response 200:**

```json
{
  "data": [
    {
      "id": "b1...-uuid",
      "offerId": "0f9c...-uuid",
      "offerTitle": "Playa Flamenca apartment",
      "offerSlug": "orihuela-costa-playa-flamenca",
      "customerId": "c1...-uuid",
      "customerName": "Jane Doe",
      "customerEmail": "jane@example.com",
      "bookingType": "customer_stay",
      "status": "confirmed",
      "dateFrom": "2026-06-01",
      "dateTo": "2026-06-08",
      "title": "",
      "adults": 2,
      "children": 1,
      "priceTotalCents": 84000,
      "currency": "EUR",
      "createdAt": "2026-05-01T10:00:00.000Z",
      "updatedAt": "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

**Response 400:** invalid filter (näiteks `Invalid status filter`, `dateFrom must be YYYY-MM-DD`, `dateFrom must be before dateTo`).

---

### `GET /api/admin/bookings/:id`

Tagastab ühe booking'u kogu detailvaate. Sisaldab kõiki list-vaates ära jäetud välju (`reasonOfStay`, `notes`, `sourceLeadId`).

**Response 200:**

```json
{
  "id": "b1...-uuid",
  "offerId": "0f9c...-uuid",
  "offerTitle": "Playa Flamenca apartment",
  "offerSlug": "orihuela-costa-playa-flamenca",
  "customerId": "c1...-uuid",
  "customerName": "Jane Doe",
  "customerEmail": "jane@example.com",
  "bookingType": "customer_stay",
  "status": "confirmed",
  "dateFrom": "2026-06-01",
  "dateTo": "2026-06-08",
  "reasonOfStay": "Family holiday with two kids",
  "title": "",
  "notes": "Wants late check-in",
  "adults": 2,
  "children": 1,
  "priceTotalCents": 84000,
  "currency": "EUR",
  "sourceLeadId": "9f6c...-uuid",
  "createdAt": "2026-05-01T10:00:00.000Z",
  "updatedAt": "2026-05-01T10:00:00.000Z"
}
```

**Response 404:** booking pole olemas.

---

### `POST /api/admin/bookings`

Loob uue booking'u.

**Request body (`CreateBookingPayload`):**

```json
{
  "offerId": "0f9c...-uuid",
  "customerId": "c1...-uuid",
  "bookingType": "customer_stay",
  "status": "tentative",
  "dateFrom": "2026-06-01",
  "dateTo": "2026-06-08",
  "reasonOfStay": "Family holiday with two kids",
  "title": "",
  "notes": "Wants late check-in",
  "adults": 2,
  "children": 1,
  "priceTotalCents": 84000,
  "currency": "EUR",
  "sourceLeadId": "9f6c...-uuid"
}
```

Validation:

- `offerId` — required. Offer peab eksisteerima.
- `dateFrom`, `dateTo` — required, `YYYY-MM-DD`, `dateTo > dateFrom`.
- `bookingType` — optional, default `customer_stay`. Üks väärtustest: `customer_stay`, `owner_use`, `maintenance`, `blocked`, `other`.
- `status` — optional, default `tentative`. Üks väärtustest: `draft`, `tentative`, `confirmed`, `cancelled`, `completed`.
- `customerId` — optional. Kui antud, peab customer eksisteerima. `customer_stay` MVP staadiumis võib olla customer-less. `owner_use` / `maintenance` / `blocked` / `other` puhul on customer-less normaalne.
- `sourceLeadId` — optional. Lead'i olemasolu siin ei kontrollita.
- `reasonOfStay` — optional, kuni 500 chars.
- `title` — optional, kuni 200 chars.
- `notes` — optional, kuni 5000 chars.
- `currency` — optional, kuni 8 chars. Default `'EUR'`.
- `adults`, `children` — optional, mittenegatiivsed integer'id, kuni 100.
- `priceTotalCents` — optional integer või `null`, mittenegatiivne, kuni 100 000 000 000.

**Response 201:**

```json
{ "id": "b1...-uuid" }
```

**Response 400:** validation error (`offerId is required`, `dateTo must be greater than dateFrom`, `Offer not found`, `Customer not found`, jne).

**Response 409:**

```json
{ "error": "Booking overlaps an existing tentative or confirmed booking for this offer" }
```

Tagastatakse kui resultaadi status on blocking (`tentative` või `confirmed`) ja sama offer'i jaoks eksisteerib teine blocking booking, mille kuupäevavahemik kattub.

---

### `PUT /api/admin/bookings/:id`

Uuendab olemasoleva booking'u. `offerId`'d **ei saa** selle endpointiga muuta — kui vaja, kustuta vana booking ja loo uus.

**Path params:**

- `id` — booking'u UUID.

**Request body (`UpdateBookingPayload`, vähemalt üks väli kohustuslik):**

Sama field-set nagu `CreateBookingPayload` (välja arvatud `offerId`), kõik väljad optional. Kui body ei sisalda ühtegi tunnustatud välja, tagastatakse 400 sõnumiga `No fields to update`. `updated_at` seadetakse `CURRENT_TIMESTAMP`'iks.

Overlap'i kontroll käivitub uuesti **kui** resulting status on blocking (`tentative` / `confirmed`). Status'e muutmine `cancelled`/`completed`'iks vabastab akna automaatselt — muudetud row jätab edaspidi teiste bookingute jaoks ruumi.

**Response 200:**

```json
{ "id": "b1...-uuid" }
```

**Response 404:** booking pole olemas.

**Response 400:** validation error.

**Response 409:** overlap kattuva tentative/confirmed booking'uga.

---

## 12. Admin — External data (scheduled fetch system)

Tabelid `external_data_sources` ja `external_data_snapshots` (vt migration `0006_external_data_sources.sql`) hoiavad infot väliste andmeallikate (nt Open-Meteo current weather) tunnise cron-fetchi kohta. Need endpointid on **debug / admin tooling**: lubavad listida konfigureeritud allikaid, vaadata viimast snapshot'i, vaadata kõiki snapshot'eid (sh `failed` ja `skipped`), käivitada käsitsi fetchi (oluline lokaalseks testimiseks ilma Cron Triggerit deploy'imata) ja koristada vanu snapshot'eid.

Snapshot'i statused (mida cron loob):

- `success` — uus payload erines viimase `success`'i hash'ist. Salvestab `normalizedJson`'i ja uuendab allika `latest_*` viidad.
- `skipped` — fetch õnnestus, aga sisu hash on sama kui `latest_data_hash`. Snapshot kirjutatakse minimaalsete väljadega (`normalizedJson = NULL`) puhtalt observability eesmärgil.
- `failed` — fetch või validatsioon ebaõnnestus. `errorMessage` salvestatakse, `latest_*` viidad **ei muutu**, st viimane `success` jääb tõe-allikaks.

Kõik need endpointid on admin-only (`requireAdmin()` guard). Eriti POST `/run` ja POST `/cleanup` peavad olema kaitstud.

---

### `GET /api/admin/external-data/sources`

Listib `external_data_sources` ridu, sorteeritud `created_at DESC`.

**Query params:**

- `limit` — optional integer, default 50, max 100.
- `offset` — optional integer >= 0, default 0.

**Response 200:**

```json
{
  "data": [
    {
      "id": "weather_current_costa_blanca",
      "type": "weather_current",
      "provider": "open-meteo",
      "name": "Current weather for Costa Blanca / nearby locations",
      "isActive": true,
      "publishToGithub": true,
      "githubFilePath": "src/data/weather/current.json",
      "latestSnapshotId": "1f2e...-uuid",
      "latestDataHash": "9d4c4a...",
      "latestUpdatedAt": "2026-05-17T08:00:00.000Z",
      "latestPublishedCommitSha": null,
      "createdAt": "2026-05-16T18:30:00.000Z",
      "updatedAt": "2026-05-17T08:00:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

**Response 400:** `limit must be an integer`, `limit must be at most 100`, `offset must be at least 0` jne.

---

### `GET /api/admin/external-data/sources/:id`

Tagastab ühe allika (id = `external_data_sources.id`, nt `weather_current_costa_blanca`).

**Response 200:** sama kuju nagu eelmise endpointi `data[]` element.

**Response 404:** allikat ei leitud.

---

### `GET /api/admin/external-data/sources/:id/snapshots`

Listib ühe allika snapshot'id, sorteeritud `fetched_at DESC`. `normalizedJson` **ei** ole listis — kasuta detail-endpointi.

**Path params:**

- `id` — allika id.

**Query params:**

- `limit` — optional integer, default 50, max 100.
- `offset` — optional integer >= 0, default 0.
- `status` — optional, üks väärtustest `success` / `failed` / `skipped`.

**Response 200:**

```json
{
  "data": [
    {
      "id": "1f2e...-uuid",
      "sourceId": "weather_current_costa_blanca",
      "status": "success",
      "fetchedAt": "2026-05-17T08:00:00.000Z",
      "dataHash": "9d4c4a...",
      "errorMessage": null,
      "publishedCommitSha": null,
      "createdAt": "2026-05-17T08:00:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

**Response 400:** `Invalid status filter. Must be one of: success, failed, skipped`, pagination errors.

**Response 404:** allikat ei leitud.

---

### `GET /api/admin/external-data/snapshots/:id`

Tagastab ühe snapshot'i koos `normalizedJson`-iga (kui see `success` puhul on olemas).

**Response 200:**

```json
{
  "id": "1f2e...-uuid",
  "sourceId": "weather_current_costa_blanca",
  "status": "success",
  "fetchedAt": "2026-05-17T08:00:00.000Z",
  "dataHash": "9d4c4a...",
  "errorMessage": null,
  "publishedCommitSha": null,
  "createdAt": "2026-05-17T08:00:00.000Z",
  "normalizedJson": "{\"sourceId\":\"weather_current_costa_blanca\",\"fetchedAtIso\":\"...\",\"locations\":[...]}",
  "rawR2Key": null
}
```

`normalizedJson` on **string** (D1 hoiab seda JSON-tekstina, mitte parsitud objektina). Admin UI peaks selle parsima kliendi poolel.

**Response 404:** snapshot'i ei leitud.

---

### `POST /api/admin/external-data/sources/:id/run`

Käivitab käsitsi sama fetch / validate / normalize / save loogika nagu tunnine cron. Mõeldud lokaalseks testimiseks ja debug-juhtumiteks.

**Path params:**

- `id` — allika id. Peab vastama nii koodipoolsele registreeritud `DataSourceDefinition`-ile (`src/scheduled/registry.ts`) kui ka DB-reale.

**Request body:** puudub (`POST` ilma body-ta on OK).

**Response 200:**

```json
{
  "sourceId": "weather_current_costa_blanca",
  "status": "success",
  "snapshotId": "1f2e...-uuid",
  "dataHash": "9d4c4a...",
  "fetchedAt": "2026-05-17T08:01:23.000Z",
  "errorMessage": null
}
```

`status` võimalikud väärtused:

- `success` — fetch õnnestus ja sisu hash erines viimasest. `snapshotId` ja `dataHash` on täidetud. `latest_*` viidad on uuendatud.
- `skipped` — fetch õnnestus, aga sisu hash on sama kui `latest_data_hash`. Snapshot loodi minimaalse kujuga; `latest_*` viidad **ei** muutu.
- `failed` — fetch või validatsioon ebaõnnestus. `errorMessage` sisaldab põhjuse (kuni 1000 chars). `snapshotId` osutab `failed` snapshot'ile. `latest_*` viidad **ei** muutu.

**Response 404:** allikat ei leitud (ei koodis ega DB-s).

**Response 422:**

- `{ "error": "No fetcher is registered for this data source" }` — DB rea on olemas, aga koodis pole registreeritud `DataSourceDefinition`-i. Lisa allikas `src/scheduled/registry.ts`'i.
- `{ "error": "Data source is not active" }` — `is_active = 0`. Aktiveeri allikas D1-s (admin UI / SQL).

---

### `POST /api/admin/external-data/sources/:id/cleanup`

Kustutab vanu snapshot'e ühele allikale. Vaikimisi jätab viimase `success`-i snapshot'i alles olenemata vanusest (selle ID on `external_data_sources.latest_snapshot_id`).

**Path params:**

- `id` — allika id.

**Request body (`CleanupExternalDataSnapshotsPayload`, kõik väljad optional):**

```json
{
  "olderThanDays": 3,
  "keepLatest": true
}
```

Validation:

- `olderThanDays` — optional integer >= 1, max 3650. Default 3. Mitte-täisarv või väike väärtus tagastab 400.
- `keepLatest` — optional boolean. Default `true`. Kui `true` ja allikal on `latest_snapshot_id`, jäetakse see rida kustutamisest välja olenemata vanusest.

Tühi body (`{}` või puuduv body) on lubatud — rakendatakse defaultid.

**Response 200:**

```json
{
  "sourceId": "weather_current_costa_blanca",
  "deletedCount": 12,
  "olderThanDays": 3,
  "keepLatest": true
}
```

`deletedCount` tuleb D1 `meta.changes`-ist.

**Response 400:** validation error (`olderThanDays must be at least 1`, `olderThanDays must be at most 3650`, `keepLatest must be a boolean` jne).

**Response 404:** allikat ei leitud.

---

## 13. Public — Tenant details form

Kutsepõhine vorm, mis asendab Google Formsi. Admin loob invitationi (jaotis 14), huviline avab lingi
`https://costaseasons.com/tenant-details/<token>`, logib Google'iga sisse, täidab vormi, laeb
dokumendid üles ja saadab. Disain: `non-touristic-rentals/docs/seasona-rental-details-form/roadmap.md`.

Põhireeglid:

- **Invitationi token** (43 märki base64url, 256 bitti) liigub ainult POST body's, mitte URL-is, et
  see logidesse ei satuks. D1-s on ainult selle SHA-256 hash.
- **Identiteet** tuleb ainult serveris kontrollitud Google ID tokenist. Esimene edukas login seob
  invitationi selle Google kontoga (`sub`), teine konto saab 403.
- **Access token** (`POST /auth/google` vastus) saadetakse kujul `Authorization: Bearer <accessToken>`.
  See kehtib 2 h ja on allkirjastatud `TENANT_FORM_SECRET`-iga (`typ: "tenant_form"`); admin
  endpointidel see ei kehti. Aegunud token → 401, seejärel uus Google login samale invitationile.
- **Invitationi olekut kontrollitakse igal päringul:** aegunud → 410 `{ "status": "expired" }`,
  tühistatud → 410 `{ "status": "revoked" }`, juba saadetud → 409 `{ "status": "submitted" }`.
  Kõigis neis vastustes on ka `language` (invitationi keel), et leht saaks seisu selgitada huvilise
  keeles.
- **Väärtused** on `field_key → value`, valikud `option_key`-dena. Kaaskülaliste loend on ridade
  massiiv, failiväljad on üleslaaditud failide `id`-de massiiv ja „other“ valiku vabatekst on
  võtmes `<field_key>_other`.
- **Request bodyd tenant formi route'idel ei logita** (`requestLogger`).
- **Rate limiting** (Workers Rate Limiting, loendurid 60 s akendes, iga Cloudflare'i asukoha kohta
  eraldi ja ligikaudsed):
  - `POST /invitations/resolve` ja `POST /auth/google`: kokku 20 päringut minutis ühelt IP-lt
    (`CF-Connecting-IP`);
  - kõik Bearer tokeniga endpointid: 60 päringut minutis ühe invitationi kohta. Loetakse ainult
    kehtiva allkirjaga tokeniga päringuid, enne D1 päringut;
  - ületamisel `429` `{ "error": "Too many requests" }` ja header `Retry-After: 60`. IP-d ei logita.

Valideerimisvigade kuju (`400`):

```json
{
  "error": "Invalid form values",
  "errors": [
    { "field": "first_name", "code": "required" },
    { "field": "other_guests[1].sex", "code": "required" },
    { "field": "planned_departure", "code": "stay_too_short" }
  ]
}
```

Võimalikud koodid: `unknown_field`, `required`, `invalid_type`, `too_short`, `too_long`,
`invalid_email`, `invalid_phone`, `invalid_date`, `date_in_future`, `date_order`, `stay_too_short`,
`out_of_range`, `invalid_option`, `too_many_items`, `too_few_files`, `too_many_files`,
`duplicate_file`, `invalid_file`.

---

### `POST /api/tenant-forms/invitations/resolve`

Kontrollib invitationi tokenit. Esimesel avamisel muutub staatus `pending → opened`.

**Request body:**

```json
{ "token": "<invitation-token>" }
```

**Response 200:**

```json
{
  "status": "opened",
  "displayName": "Test Example",
  "offer": { "title": "Casa Bonita", "slug": "casa-bonita" },
  "language": "sv",
  "expiresAt": "2026-10-18T12:00:00Z"
}
```

**Response 404:** token puudub, on vigase kujuga või tundmatu (kõigil juhtudel sama vastus).
**Response 410 / 409:** invitation on aegunud, tühistatud või juba saadetud (vt põhireeglid).

---

### `POST /api/tenant-forms/auth/google`

Vahetab Google ID tokeni (GSI) tenant access tokeni vastu.

**Request body:**

```json
{ "token": "<invitation-token>", "googleIdToken": "<google-id-token>" }
```

**Response 200:**

```json
{ "accessToken": "<bearer-token>", "expiresAt": "2026-10-13T14:00:00Z", "googleEmail": "guest@example.com" }
```

- `400` — `googleIdToken` puudub või body pole JSON.
- `401` — Google token ei verifitseeru või email pole kinnitatud (`email_verified`).
- `403` — invitation on seotud teise Google kontoga.
- `404`, `409`, `410` — nagu resolve'il.

Õnnestumine kirjutab sündmuse `tenant_authenticated`, tagasilükkamine `auth_rejected`
(metadata ainult põhjus).

---

### `GET /api/tenant-forms/form`

**Auth:** Bearer access token.

Tagastab vormi invitationi keeles (puuduvad tekstid inglise keeles), muutujad (`{offerTitle}`,
`{displayName}`, `{maxFiles}`, `{maxFileSizeMb}`) on täidetud. Lisaks salvestatud mustand ja saatmata
failid, et huviline saaks pärast uut sisselogimist jätkata.

**Response 200 (lühendatud):**

```json
{
  "invitation": { "displayName": "Test Example", "language": "sv", "expiresAt": "…", "offer": { "title": "…", "slug": "…" } },
  "prefill": { "contactEmail": "guest@example.com" },
  "template": { "id": "tenant_details_v1", "title": "…", "intro": "…", "successMessage": "…" },
  "sections": [
    {
      "key": "stay",
      "title": "Resa & vistelse",
      "description": "…",
      "fields": [
        {
          "key": "planned_departure",
          "type": "date",
          "required": true,
          "validation": { "minNightsAfter": "planned_arrival", "minNights": 14 },
          "visibleIf": null,
          "label": "Planerad avresa",
          "help": null,
          "placeholder": null,
          "body": null,
          "options": [],
          "itemFields": []
        }
      ]
    }
  ],
  "draft": { "values": { "first_name": "Åsa" }, "savedAt": "2026-10-13T12:00:00Z" },
  "uploadedFiles": [
    { "id": "…", "fieldKey": "id_documents", "originalFilename": "pass.jpg", "mimeType": "image/jpeg", "sizeBytes": 812345, "uploadedAt": "…" }
  ]
}
```

Tekstides on piiratud vormindus (`**paks**`, `*kaldkiri*`, lõigud, `- ` loetelu, `[link](https://…)`).
Frontend peab need escape'iva renderdajaga kuvama, mitte `v-html`-iga.

---

### `POST /api/tenant-forms/files`

**Auth:** Bearer access token.

Faili üleslaadimine. Body on faili baidid (mitte multipart).

**Headerid:**

- `X-Field-Key` — `file` tüüpi välja võti, nt `id_documents` (kohustuslik).
- `X-File-Name` — originaalne failinimi, URL-encoded (valikuline). Salvestatakse puhastatult ainult D1-sse.
- `Content-Length` — kohustuslik.

Kontrollid: kuni 10 MB faili kohta, kuni 10 faili välja kohta, kuni 50 MB salvestatud faile ja
kuni 30 üleslaadimist invitationi kohta (kustutatud failid kaasa arvatud). Tüüp tuvastatakse faili
esimeste baitide järgi (JPEG, PNG, PDF; välja `accept` järgi), brauseri `Content-Type`-i ega
faililaiendit ei usaldata.

**Response 201:**

```json
{ "file": { "id": "…", "fieldKey": "id_documents", "originalFilename": "pass.jpg", "mimeType": "image/jpeg", "sizeBytes": 812345, "uploadedAt": "…" } }
```

- `400` — tundmatu või puuduv `X-Field-Key`, tühi fail.
- `409` — mõni ülaltoodud piirang on täis.
- `411` — `Content-Length` puudub.
- `413` — fail on üle 10 MB.
- `415` — failitüüp pole lubatud (nt HTML, SVG, HEIC).

R2 võti on `tenant-forms/{invitationId}/{fileId}` (bucket `costa-seasons-tenant-documents`, binding `tenant_files`).

---

### `DELETE /api/tenant-forms/files/:fileId`

**Auth:** Bearer access token.

Eemaldab saatmata faili (R2-st kustutatakse, D1-s `status = 'deleted'`).

**Response 200:** `{ "ok": true }`
**Response 404:** fail puudub, kuulub teisele invitationile või on juba kustutatud/saadetud.

---

### `PUT /api/tenant-forms/draft`

**Auth:** Bearer access token.

Salvestab pooliku vormi, asendades eelmise mustandi. Kontrollib tundmatuid välju, tüüpe, pikkusi
ja valikuid, aga mitte kohustuslikke välju, formaate ega minimaalset peatumist. Failiväljad jäetakse
välja (failid on `uploadedFiles`-is).

**Request body (max 100 KB):**

```json
{ "values": { "first_name": "Åsa", "phone": "+46 70" } }
```

**Response 200:** `{ "savedAt": "2026-10-13T12:00:00Z" }`
**Response 400:** valideerimisvead. **Response 413:** body on liiga suur.

---

### `POST /api/tenant-forms/submit`

**Auth:** Bearer access token.

Valideerib kogu vormi ja kontrollib, et iga failiväljal olev `id` on selle invitationi saatmata fail
õigel väljal. Siis ühes D1 batch'is: submission luuakse, failid seotakse (`attached`), invitation
läheb `submitted` olekusse, mustand kustutatakse ja kirjutatakse sündmus `submitted`.
Dokumentide kustutamise aeg (`documents_delete_after`) on `planned_departure` + 30 päeva.

**Request body (max 200 KB):**

```json
{ "values": { "planned_arrival": "2026-12-01", "planned_departure": "2027-01-15", "first_name": "Åsa", "id_documents": ["<file-id>"], "privacy_consent": true } }
```

**Response 201:** `{ "submissionId": "…", "submittedAt": "2026-10-13T12:00:00Z" }`

- `400` — valideerimisvead (`invalid_file`, kui fail ei kuulu sellele invitationile).
- `409` — vorm on juba saadetud.
- `413` — body on liiga suur.

---

## 14. Admin — Tenant details forms

Kõik route'id on `requireAdmin()` all (jaotis 6). Admini email võetakse sessionist ja kirjutatakse
`created_by_email`, `reviewed_by_email` ja `form_events.actor_ref` väljadele.

### `GET /api/admin/tenant-forms/templates`

Template'ide list koos iga toetatud keele (`en`, `sv`, `fi`, `no`, `et`) tõlke valmidusega.

```json
{
  "data": [
    {
      "id": "tenant_details_v1",
      "templateKey": "tenant_details",
      "version": 1,
      "status": "active",
      "baseLanguage": "en",
      "languages": [
        { "language": "en", "translated": 99, "total": 99 },
        { "language": "fi", "translated": 98, "total": 99 }
      ]
    }
  ]
}
```

`translated` loeb ainult neid võtmeid, mis on olemas ka baaskeeles.

### `GET /api/admin/tenant-forms/templates/:id`

Sama mis listi rida, lisaks `sections` (struktuur: väljad, tüübid, required, validatsioon, valikud,
`itemFields`), `textKeys` (kõik võimalikud tekstivõtmed koos `required` lipuga) ja `texts`
(`language → text_key → text`, iga toetatud keel olemas, võib olla tühi). **404** tundmatu id korral.

### `PUT /api/admin/tenant-forms/templates/:id/translations`

Muudab olemasolevate tekstivõtmete tekste ning lisab või eemaldab tõlkeid. Struktuuri (väljad,
valikud, required, järjekord) see ei muuda. Kõik muudatused kontrollitakse enne kirjutamist. Kui
mõni on vigane, ei kirjutata ühtegi. Kehtivad muudatused lähevad ühes D1 batch'is, muutmata tekste
ei kirjutata.

**Request body (max 1 MB, kuni 500 muudatust):**

```json
{
  "changes": [
    { "language": "sv", "textKey": "section.stay.title", "text": "Resa och vistelse" },
    { "language": "fi", "textKey": "section.stay.title", "text": "Matka ja oleskelu" },
    { "language": "fi", "textKey": "field.phone.help", "text": "" }
  ]
}
```

Reeglid:

- `textKey` peab olema template'i `textKeys` hulgas.
- Tekst trimmitakse, `\r\n` → `\n`, kuni 5000 märki.
- Muutujad ainult `{offerTitle}`, `{displayName}`, `{maxFileSizeMb}`, `{maxFiles}`.
- Lingid ainult `https://`.
- **Tühi tekst:**
  - teises keeles → tõlge kustutatakse ja vormis kuvatakse ingliskeelne tekst;
  - valikulise EN teksti puhul (nt `help`) → tekst kustutatakse kõigis keeltes;
  - kohustusliku EN teksti puhul → viga.
- Tõlkel peab olema EN tekst (olemas või samas batch'is lisatud).
- `updated_by_email` = admini email, `updated_at` = muutmise aeg.

**Response 200:** uuendatud template detail (sama kuju mis `GET …/templates/:id`).

**Response 400:**

```json
{
  "error": "Invalid text changes",
  "errors": [{ "index": 2, "code": "unknown_variable", "variables": ["price"] }]
}
```

Koodid:

- `invalid_type` — `index: -1` puudutab kogu `changes` listi;
- `unsupported_language`;
- `unknown_text_key`;
- `duplicate_change`;
- `too_long`;
- `unknown_variable`;
- `invalid_link`;
- `required_text`;
- `missing_base_text`.

**Response 404:** tundmatu template. **Response 413:** body on liiga suur.

---

### `POST /api/admin/tenant-forms/invitations`

**Request body:**

```json
{ "displayName": "Test Example", "offerId": "offer_001", "language": "sv", "validDays": 5, "leadId": null }
```

- `displayName` — kohustuslik, kuni 200 märki.
- `offerId` — olemasolev offer.
- `language` — `en`, `sv`, `fi`, `no` või `et`.
- `validDays` — täisarv 1–14, vaikimisi 5.
- `leadId` — valikuline, olemasolev lead.

Template valitakse serveris (aktiivne `tenant_details`, suurim versioon).

**Response 201:**

```json
{ "invitation": { "id": "…", "status": "pending", "expiresAt": "…", "…": "…" }, "url": "https://costaseasons.com/tenant-details/<token>" }
```

Token on `HMAC-SHA256(TENANT_LINK_SECRET, "tenant-form-invitation:" + id)` base64url-ina (43 märki).
D1-s on ainult selle SHA-256 hash, seega ainult D1 andmetest linki taastada ei saa. Admin saab lingi
hiljem uuesti `GET …/invitations/:id/link` kaudu. Baasaadress tuleb muutujast `TENANT_FORM_URL_BASE`.

**Response 400:** valideerimisviga või tundmatu offer/lead.

### `GET /api/admin/tenant-forms/invitations`

Filtrid (kõik valikulised, kombineeritavad):

- `?status=pending|opened|submitted|expired|revoked` — lingi staatus. `expired` arvutatakse
  `expires_at` põhjal ega ole kunagi salvestatud.
- `?submissionStatus=submitted|approved|rejected|archived` — saadetud vormi ülevaatuse staatus.
- `?converted=true|false` — kas submission on konverteeritud customeriks.
- `?offerId=`.

Iga rida (`AdminTenantFormInvitation`): `id`, `templateId`, `displayName`, `offerId`, `offerTitle`,
`language`, `status`, `expiresAt`, `googleEmail`, `leadId`, `submissionId`, `submissionStatus`,
`converted`, `createdByEmail`, `openedAt`, `authenticatedAt`, `submittedAt`, `revokedAt`,
`createdAt`, `updatedAt`.

- `status` on lingi staatus: pärast saatmist jääb see `submitted`-iks.
- `submissionStatus` on `null`, kuni vorm on saatmata, seejärel ülevaatuse staatus.
- `converted` on `true` pärast konversiooni.
- Admin UI näitab saadetud vormi puhul staatusena `submissionStatus`-t.

### `GET /api/admin/tenant-forms/invitations/:id`

Sama rida koos `events` ajajoonega (`eventType`, `actorType`, `actorRef`, `submissionId`, `fileId`,
`metadata`, `createdAt`). **404** tundmatu id korral.

### `GET /api/admin/tenant-forms/invitations/:id/link`

Arvutab avatud invitationi lingi id põhjal uuesti. Iga vaatamine kirjutab sündmuse `link_viewed`.

**Response 200:**

```json
{ "url": "https://costaseasons.com/tenant-details/<token>" }
```

**Response 409:**

- invitation on `expired`, `revoked` või `submitted` (`{ "error": "...", "status": "revoked" }`), sest link ei tööta enam;
- token pole tuletatud praeguse `TENANT_LINK_SECRET`-iga (invitation loodi enne tuletatud linke või
  pärast secreti roteerimist). Huvilise jaoks link töötab, aga adminile seda uuesti näidata ei saa.

**Response 404:** tundmatu id.

### `POST /api/admin/tenant-forms/invitations/:id/revoke`

Tühistab saatmata invitationi (ka aegunud oma). Andmeid ei kustutata.
**Response 200:** uuendatud invitation. **409:** juba tühistatud või saadetud. **404:** tundmatu id.

---

### `GET /api/admin/tenant-forms/submissions`

Filtrid `?status=submitted|approved|rejected|archived` ja `?offerId=`.

Iga rida: `id`, `invitationId`, `displayName`, `offerId`, `offerTitle`, `fullName`, `contactEmail`,
`phone`, `plannedArrival`, `plannedDeparture`, `language` (mis keeles täideti), `status`,
`fileCount`, `submittedAt`, `reviewedAt`, `remoteIp` ja `userAgent` (salvestatud submit'i hetkel,
`CF-Connecting-IP` ja `User-Agent`, nagu leads'i puhul), `customerId` ja `bookingId` (konversiooni
järel, muidu `null`). Google `sub`-i ei tagastata.

### `GET /api/admin/tenant-forms/submissions/:id`

Vastused **alati ingliskeelsete siltidega**, sõltumata täitmise keelest. Iga vaatamine kirjutab
sündmuse `submission_viewed`.

Lisaks listi väljadele: `templateId`, `googleEmail` (kontrollitud Google konto), `reviewedByEmail`,
`reviewNotes`, `documentsDeleteAfter`, `documentsDeletedAt`, `files` (metadata), `values`
(salvestatud väärtused), `events`, `conversion` ja `sections`.

`conversion` on `null` kuni konversioonini, seejärel
`{ customerId, customerName, bookingId, bookingStatus, bookingDateFrom, bookingDateTo }`.

`files` sisaldab ka kustutatud faile: `status: "deleted"`, `deletedAt` täidetud ja `originalFilename`
tühi (failinimes võib olla isiku nimi). Vaadata ja alla laadida saab ainult `attached` faile.

`allowedReviewStatuses` on praegu võimalikud otsused (vt `PUT …/review`); arhiveeritud vormil tühi.

`sections` näide:

```json
{
  "sections": [
    {
      "key": "purpose",
      "title": "Purpose of stay",
      "answers": [
        {
          "key": "stay_purpose",
          "type": "single_choice",
          "label": "Main reason for visiting Spain",
          "value": "other",
          "displayValue": "Other non-tourist reason (please specify): Language course",
          "items": null
        }
      ]
    }
  ]
}
```

Kaaskülaliste loendi vastusel on `items` (iga rida oma vastustega). Vastamata väljal on `value` ja
`displayValue` `null`. **404** tundmatu id korral.

### `PUT /api/admin/tenant-forms/submissions/:id/review`

**Request body:**

```json
{ "status": "approved", "reviewNotes": "Video call done" }
```

- `status` — `approved`, `rejected` või `archived`; peab olema submissioni `allowedReviewStatuses` hulgas.
- `reviewNotes` — valikuline, kuni 2000 märki. Puudub → märkmed jäävad samaks; `null` või `""` → kustutatakse.
- Ilma `status`-ita muutuvad ainult märkmed: staatus, `reviewedByEmail` ja `reviewedAt` jäävad samaks,
  sündmus on `review_notes_updated`. Märkmeid saab muuta igas staatuses, ka arhiveeritud vormil.
  Vähemalt üks väljadest on kohustuslik.

Lubatud otsused (sama staatus uuesti ei ole lubatud):

| Praegune | Lubatud `status` |
|---|---|
| `submitted` | `approved`, `rejected`, `archived` |
| `approved`, konverteerimata | `rejected`, `archived` |
| `approved`, konverteeritud | `archived` |
| `rejected` | `approved`, `archived` |
| `archived` | — (lõplik) |

Konverteeritud vormi tagasilükkamine on keelatud, sest see jätaks customeri ja bookingu alles.
Kui peatumist ei toimu, tühistatakse booking Bookings vaates.

Otsus kirjutab sündmuse, mille tüüp on sama mis `status` (märkmeid sündmusse ei kirjutata). Otsus
ja sündmus kirjutatakse ainult siis, kui submission on samas seisus, mille vastu otsust kontrolliti.
Seega ei saa samaaegne konversioon ja tagasilükkamine jätta vormi seisu „rejected, aga konverteeritud“.

**Response 200:** uuendatud rida koos `reviewedByEmail` ja `reviewNotes`-iga.
**Response 409:** otsus pole praeguses seisus lubatud (`{ error, allowedStatuses }`) või submission
muutus vahepeal. **400** / **404**.

### `POST /api/admin/tenant-forms/submissions/:id/purge-documents`

Kustutab submissioni dokumendid (`attached` failid) kohe, enne säilitamise tähtaega. Lubatud igas
staatuses. Esmalt kustutatakse R2 objektid, seejärel märgitakse failid `deleted` (failinimi
tühjendatakse), submissionil täidetakse `documentsDeletedAt` ja kirjutatakse sündmus `documents_purged`
(`{ fileCount }`, tegija admin). Sama loogikat kasutab öine cleanup (`docs/cloudflare-operations.md`
§21).

**Response 200:**

```json
{ "submissionId": "…", "fileCount": 2, "documentsDeletedAt": "2026-11-20T10:15:00Z" }
```

**409:** dokumendid on juba kustutatud. **404:** tundmatu submission.

### `GET /api/admin/tenant-forms/files/:fileId`

Striimib saadetud faili privaatsest bucketist. **Vastus on fail, mitte JSON.** `?download=1` →
`Content-Disposition: attachment`, muidu `inline`.

Headerid: `Content-Type` (tuvastatud tüüp), `Content-Disposition` (ASCII fallback + `filename*`
UTF-8), `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
`Content-Security-Policy: sandbox; default-src 'none'`.

Iga vaatamine kirjutab sündmuse `file_viewed` (`metadata: { "download": true|false }`).
**404:** fail puudub, pole veel saadetud või on kustutatud. Admin UI laeb faili `fetch(..., { credentials: 'include' })`
kaudu blob'iks.

---

### Konversioon: submission → customer + booking

Heakskiidetud (`approved`) submissionist luuakse uus customer või uuendatakse olemasolevat ning
soovi korral luuakse booking. Üks submission konverteeritakse ainult üks kord. Kaardistus on
roadmapis (`non-touristic-rentals/docs/seasona-rental-details-form/roadmap.md`, faas 9).

### `GET /api/admin/tenant-forms/submissions/:id/conversion`

Eelvaade: mida konversioon kirjutaks. Andmeid ei muuda ega kirjuta sündmust (submissioni avamine on
juba logitud `submission_viewed`-iga).

**Response 200:**

```json
{
  "customer": {
    "fullName": "Åsa Exempel",
    "email": "asa@example.com",
    "phone": "+46 70 123 45 67",
    "primaryAddress": "Testgatan 1, 753 10 Uppsala, Sverige",
    "dateOfBirth": "1980-05-20",
    "nationality": "Svensk",
    "sex": "female",
    "documentType": "passport",
    "documentNumber": "X1234567",
    "occupation": "Pensioner",
    "employerOrPensionInfo": "",
    "familyMembersJson": "[{\"first_name\":\"Barn\",\"relationship\":\"child\", …}]"
  },
  "booking": {
    "offerId": "offer_001",
    "offerTitle": "Casa Bonita",
    "dateFrom": "2026-12-01",
    "dateTo": "2027-01-15",
    "nights": 45,
    "adults": 1,
    "children": 1,
    "reasonOfStay": "Other non-tourist reason (please specify): Language course",
    "title": "Åsa Exempel",
    "notes": ""
  },
  "customerMatches": [],
  "overlappingBookings": []
}
```

- `customer.familyMembersJson` — kaaskülaliste read vormi võtmetega, valikud võtmetena.
- `booking` — `null`, kui submissionil pole kehtivat peatumist. `adults`/`children`: põhikülaline ja
  kaaskülalised vanuse järgi saabumise päeval (alla 18 → laps, sünnikuupäevata → täiskasvanu).
- `customerMatches` — customerid (listi kujul), kelle email on submissioni `contactEmail` või Google
  email (tõstutundetu).
- `overlappingBookings` — sama offeri `tentative`/`confirmed` bookingud, mis kattuvad peatumisega:
  `{ id, status, dateFrom, dateTo, title, customerName }`.

**404:** tundmatu id.

### `POST /api/admin/tenant-forms/submissions/:id/convert`

**Request body:**

```json
{
  "customer": { "mode": "create" },
  "booking": { "status": "draft" }
}
```

- `customer` — `{ "mode": "create" }` või `{ "mode": "update", "customerId": "…" }`.
  - `create`: uus customer, `status: active`, `sourceLeadId` = invitationi lead.
  - `update`: üle kirjutatakse ainult eelvaate väljad, mille väärtus pole tühi (`""` ega `"[]"`).
    `notes`, `incomeNotes`, `nationalIdNumber` ja `status` jäävad samaks; `sourceLeadId`
    täidetakse ainult siis, kui see on tühi.
- `booking` — kohustuslik võti: `null` (ainult customer) või `{ "status": "draft" | "tentative" | "confirmed" }`.
  Booking on `customer_stay`, hind tühi, `EUR`, `sourceLeadId` = invitationi lead.
  `tentative`/`confirmed` puhul tehakse sama kattuvuse kontroll mis `POST /api/admin/bookings`-is.

Kõik kirjutatakse ühes D1 batch'is: customer, booking, sündmused `converted_to_customer`
(`{ mode, customerId }`) ja `converted_to_booking` (`{ bookingId, status }`) ning lõpuks seos
`form_submissions.customer_id` / `booking_id`. Iga lause on tingimuslik (submission pole veel
konverteeritud), nii et kahest samaaegsest konversioonist läheb läbi ainult üks.

**Response 201:**

```json
{ "customerId": "…", "bookingId": "…" }
```

`bookingId` on `null`, kui `booking` oli `null`.

**Response 400:** vigane body või tundmatu `customerId` (`Customer not found`).
**Response 404:** tundmatu submission.
**Response 409:**

- `Only approved submissions can be converted`;
- `Submission has already been converted`;
- `Submission has no planned stay` (booking soovitud, aga kuupäevad puuduvad);
- `Booking overlaps an existing tentative or confirmed booking for this offer`.

---

## 15. Endpointide kokkuvõte

| Method   | Path                                              | Auth   | Kirjeldus                                      |
| -------- | ------------------------------------------------- | ------ | ---------------------------------------------- |
| `GET`    | `/api/health`                                     | none   | Liveness probe                                 |
| `GET`    | `/api/offers`                                     | none   | Aktiivsete pakkumiste list                     |
| `GET`    | `/api/offers/:slug`                               | none   | Pakkumise detail + avalik availability         |
| `POST`   | `/api/leads`                                      | none   | Esita kontaktivormi lead                       |
| `POST`   | `/api/auth/google`                                | none   | Vaheta Google ID token sessiooni vastu         |
| `POST`   | `/api/auth/logout`                                | none   | Tühista sessioon                               |
| `GET`    | `/api/auth/me`                                    | session | Praeguse sessiooni email                      |
| `GET`    | `/api/admin/offers`                               | admin  | Listi kõik offerid (filter: `?status=`)        |
| `POST`   | `/api/admin/offers`                               | admin  | Loo uus offer                                  |
| `PUT`    | `/api/admin/offers/:offerId`                      | admin  | Uuenda offer'it                                |
| `GET`    | `/api/admin/offers/:offerId/availability`         | admin  | Listi offer'i kõik availability perioodid      |
| `PUT`    | `/api/admin/offers/:offerId/availability`         | admin  | Bulk-replace availability                      |
| `GET`    | `/api/admin/leads`                                | admin  | Listi lead'id (filter: `?status=`, `?offerId=`)|
| `POST`   | `/api/admin/leads`                                | admin  | Loo käsitsi lead (admin_manual)                |
| `GET`    | `/api/admin/leads/:leadId`                        | admin  | Lead'i detailvaade                             |
| `PUT`    | `/api/admin/leads/:leadId`                        | admin  | Uuenda lead'i (status, adminNotes, name, email, phone, message, dates, reasonOfStay) |
| `DELETE` | `/api/admin/leads/:leadId`                        | admin  | Kustuta lead                                   |
| `GET`    | `/api/admin/customers`                            | admin  | Listi customerid (filter: `?status=`, `?search=`)|
| `POST`   | `/api/admin/customers`                            | admin  | Loo customer                                   |
| `GET`    | `/api/admin/customers/:id`                        | admin  | Customer'i detailvaade                         |
| `PUT`    | `/api/admin/customers/:id`                        | admin  | Uuenda customer'it                             |
| `GET`    | `/api/admin/bookings`                             | admin  | Listi bookingud (filter: offer/customer/status/type/date) |
| `POST`   | `/api/admin/bookings`                             | admin  | Loo booking (overlap-kontroll)                 |
| `GET`    | `/api/admin/bookings/:id`                         | admin  | Booking'u detailvaade                          |
| `PUT`    | `/api/admin/bookings/:id`                         | admin  | Uuenda booking'ut (overlap-kontroll)           |
| `GET`    | `/api/admin/external-data/sources`                | admin  | Listi välised andmeallikad                     |
| `GET`    | `/api/admin/external-data/sources/:id`            | admin  | Allika detailvaade                             |
| `GET`    | `/api/admin/external-data/sources/:id/snapshots`  | admin  | Allika snapshot'ide list (filter: `?status=`)  |
| `POST`   | `/api/admin/external-data/sources/:id/run`        | admin  | Käivita allika fetch käsitsi                   |
| `POST`   | `/api/admin/external-data/sources/:id/cleanup`    | admin  | Kustuta vanu snapshot'eid                      |
| `GET`    | `/api/admin/external-data/snapshots/:id`          | admin  | Snapshot'i detail (sh `normalizedJson`)        |
| `POST`   | `/api/tenant-forms/invitations/resolve`           | none   | Kontrolli invitationi tokenit                  |
| `POST`   | `/api/tenant-forms/auth/google`                   | none   | Vaheta Google ID token tenant access tokeni vastu |
| `GET`    | `/api/tenant-forms/form`                          | tenant | Vorm invitationi keeles + mustand + failid     |
| `POST`   | `/api/tenant-forms/files`                         | tenant | Laadi fail üles (raw body)                     |
| `DELETE` | `/api/tenant-forms/files/:fileId`                 | tenant | Eemalda saatmata fail                          |
| `PUT`    | `/api/tenant-forms/draft`                         | tenant | Salvesta pooleli vorm                          |
| `POST`   | `/api/tenant-forms/submit`                        | tenant | Saada vorm                                     |
| `GET`    | `/api/admin/tenant-forms/templates`               | admin  | Template'id + tõlke valmidus                   |
| `GET`    | `/api/admin/tenant-forms/templates/:id`           | admin  | Template'i struktuur ja kõik tekstid           |
| `PUT`    | `/api/admin/tenant-forms/templates/:id/translations` | admin | Muuda tekste ja tõlkeid (kõik või mitte midagi) |
| `GET`    | `/api/admin/tenant-forms/invitations`             | admin  | Invitationite list (filter: `?status=`, `?submissionStatus=`, `?converted=`, `?offerId=`) |
| `POST`   | `/api/admin/tenant-forms/invitations`             | admin  | Loo invitation (vastuses link)                 |
| `GET`    | `/api/admin/tenant-forms/invitations/:id`         | admin  | Invitation + sündmuste ajajoon                 |
| `GET`    | `/api/admin/tenant-forms/invitations/:id/link`    | admin  | Näita avatud invitationi linki uuesti (logitakse) |
| `POST`   | `/api/admin/tenant-forms/invitations/:id/revoke`  | admin  | Tühista saatmata invitation                    |
| `GET`    | `/api/admin/tenant-forms/submissions`             | admin  | Saadetud vormide list (filter: `?status=`, `?offerId=`) |
| `GET`    | `/api/admin/tenant-forms/submissions/:id`         | admin  | Vastused EN siltidega (logitakse)              |
| `PUT`    | `/api/admin/tenant-forms/submissions/:id/review`  | admin  | Approve / reject / archive + märkmed           |
| `GET`    | `/api/admin/tenant-forms/submissions/:id/conversion` | admin | Konversiooni eelvaade (customer, booking, vasted, kattuvused) |
| `POST`   | `/api/admin/tenant-forms/submissions/:id/convert` | admin  | Loo/uuenda customer ja loo booking             |
| `POST`   | `/api/admin/tenant-forms/submissions/:id/purge-documents` | admin | Kustuta dokumendid kohe          |
| `GET`    | `/api/admin/tenant-forms/files/:fileId`           | admin  | Saadetud faili striimimine (logitakse)         |

---

## 16. README.md viide

Soovitus: lisa projekti `README.md` faili lühike viide:

```md
## API endpoints

Public, auth ja admin endpointide täisreferents:

- `docs/api-endpoints.md`
```
