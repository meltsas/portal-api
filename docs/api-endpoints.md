# API endpoints — portal-api

Praktiline ülevaade `portal-api` Workeri HTTP endpointidest. Iga endpointi juures on method, path, lühikirjeldus, request body (kui on) ja response shape.

Routerid asuvad:

- Public routes: `src/routes/public.ts`
- Auth routes: `src/routes/auth.ts`
- Admin routes: `src/routes/admin.ts`

> Kõik response bodyd on JSON. Vea korral tagastatakse `{ "error": "<message>" }` koos vastava HTTP statusega (400, 401, 403, 404, 405, 409, 422).

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
- `403 Forbidden` — sessioon on olemas, aga email pole admin allowlistis.
- `404 Not Found` — route ei klappi või resource puudub.
- `405 Method Not Allowed` — path on olemas, kuid method ei ole.
- `409 Conflict` — slug juba olemas.
- `422 Unprocessable Entity` — payload kehtiv, aga business reegel takistab (näiteks offer pole `active`).

Public routed ei nõua auth-i. Auth routed haldavad sessiooni cookiet `portal_session`. Admin routed nõuavad kehtivat sessiooni cookie'd (vt jaotis 6).

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
  "dateTo": "2026-06-08",
  "reasonOfStay": "Family holiday with two kids",
  "googleToken": "<google-id-token>"
}
```

Validation:

- `googleToken` — required, mitte-tühi string. Verifitseeritakse läbi `verifyGoogleIdToken` (audience = `env.GOOGLE_CLIENT_ID`).
- `offerId` — required, mitte-tühi string (offer'i UUID).
- `name` — required, mitte-tühi, kuni 200 chars.
- `message` — required, mitte-tühi, kuni 2000 chars.
- `dateFrom`, `dateTo` — required, formaadis `YYYY-MM-DD`, `dateFrom <= dateTo`.
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

Muud võimalikud sõnumid: `offerId is required`, `name is required`, `message is required`, `dateFrom must be YYYY-MM-DD`, `dateTo must be YYYY-MM-DD`, `dateFrom must not be after dateTo`, `name must be at most 200 characters`, `message must be at most 2000 characters`, `reasonOfStay must be a string`, `reasonOfStay must be at most 300 characters`, `Offer not found`, `Invalid or missing JSON body`.

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

Auth flow põhineb Google ID tokenil. Frontend saab Google'ist ID tokeni, postib selle `/api/auth/google` peale, server verifitseerib selle, kontrollib emailit allowlisti vastu (vt `ALLOWED_EMAILS` failis `src/handlers/auth.ts`) ja seab HMAC-allkirjastatud sessiooni cookie `portal_session`.

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

Lisaks seatakse vastuses `Set-Cookie: portal_session=...` header.

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

Tagastatakse kui token kehtib, aga email pole `ALLOWED_EMAILS` listis.

---

### `POST /api/auth/logout`

Tühistab sessiooni cookie. Endpoint ei kontrolli olemasolevat sessiooni — kutsub lihtsalt cookie tagasi `Max-Age=0`'iga.

**Request body:** puudub.

**Response 200:**

```json
{ "ok": true }
```

Vastuses on `Set-Cookie: portal_session=; Max-Age=0; ...`.

---

### `GET /api/auth/me`

Tagastab praeguse sessiooni email'i. Kasulik admin UI-le, et kontrollida, kas kasutaja on sisse logitud.

**Request body:** puudub.

**Cookies:** vajalik kehtiv `portal_session`.

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

Kõik `/api/admin/*` routed jooksevad läbi `requireAdmin()` middleware'i (`src/middleware/requireAdmin.ts`), mis kontrollib `portal_session` cookiet ja peab kehtiva HMAC sessiooni.

> NB: Praegu (vt route-faili kommentaari) on `requireAdmin()` pass-through stub. Päris auth lisatakse middleware faili — endpointide signatuuri see ei muuda.

Tüüpilised vead admin endpointidel:

- `401 Unauthorized` — `portal_session` puudub, on aegunud või HMAC ei klapi.
- `403 Forbidden` — sessioon kehtib, aga email pole admin allowlist'is.

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
- `phone`, `primaryAddress`, `dateOfBirth`, `nationalIdNumber`, `documentNumber`, `occupation`, `employerOrPensionInfo`, `incomeNotes`, `notes` — kõik tekstiväljad, default `''` (NULL'i ei kasuta).
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
- `primaryAddress` — optional, kuni 500 chars.
- `dateOfBirth`, `nationalIdNumber`, `documentNumber` — optional, kuni 100 chars (`dateOfBirth` formaadi sundi siin pole — võib olla nt `1990-04-15` või vabas vormis).
- `occupation` — optional, kuni 200 chars.
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

## 12. Endpointide kokkuvõte

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

---

## 13. README.md viide

Soovitus: lisa projekti `README.md` faili lühike viide:

```md
## API endpoints

Public, auth ja admin endpointide täisreferents:

- `docs/api-endpoints.md`
```
