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

Uuendab lead'i staatust ja/või admin märkmeid. Muid välju (`name`, `email`, ...) selle endpointiga muuta ei saa.

**Path params:**

- `leadId` — lead'i UUID.

**Request body (`UpdateLeadPayload`, vähemalt üks väli kohustuslik):**

```json
{
  "status": "contacted",
  "adminNotes": "Called back, sending quote tomorrow."
}
```

Validation:

- `status` — `new`, `contacted`, `closed`, `spam` või `archived`.
- `adminNotes` — string või `null`, kuni 5000 chars.
- Kui body ei sisalda ühtegi tunnustatud välja, tagastatakse 400 sõnumiga `No fields to update`.

**Response 200:**

```json
{ "id": "9f6c...-uuid", "status": "contacted" }
```

`status` on uus väärtus kui see oli payloadis, muidu olemasolev väärtus.

**Response 404:** lead pole olemas.

**Response 400:** validation error.

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

## 10. Endpointide kokkuvõte

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
| `PUT`    | `/api/admin/leads/:leadId`                        | admin  | Uuenda lead'i staatust / admin märkmeid        |
| `DELETE` | `/api/admin/leads/:leadId`                        | admin  | Kustuta lead                                   |

---

## 11. README.md viide

Soovitus: lisa projekti `README.md` faili lühike viide:

```md
## API endpoints

Public, auth ja admin endpointide täisreferents:

- `docs/api-endpoints.md`
```
