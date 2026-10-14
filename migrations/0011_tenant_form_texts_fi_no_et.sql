-- =========================================================
-- TENANT DETAILS FORM: TEMPLATE v1 TEXTS IN FI, NO, ET
-- 0010 (EN + SV) is already applied in production, so new languages come in this migration.
-- ON CONFLICT keeps a text that an admin has already entered in the text editor.
-- =========================================================


-- =========================================================
-- FINNISH
-- Addressed with "sinä" like the site's Finnish texts. {offerTitle} follows a case-inflected noun
-- ("kohteeseen {offerTitle}"), so the name itself stays in the nominative.
-- =========================================================

INSERT INTO form_translations (template_id, language, text_key, text) VALUES
    ('tenant_details_v1', 'fi', 'template.title', '{offerTitle} – vuokralaisen tietolomake'),
    ('tenant_details_v1', 'fi', 'template.intro',
        'Täytäthän tämän lyhyen lomakkeen, jotta voimme laatia vuokrasopimuksen ja täyttää Espanjan vierasrekisteröintiä koskevat vaatimukset.'
        || char(10) || char(10) || 'Espanjan laki edellyttää lisäksi, että kirjaamme oleskelullesi muun kuin matkailuun liittyvän syyn.'
        || char(10) || char(10) || 'Vastauksesi käsitellään luottamuksellisesti, ja niitä käytetään vain varaukseen ja lakisääteisten velvoitteiden täyttämiseen.'),
    ('tenant_details_v1', 'fi', 'template.success_message', 'Kiitos, että täytit kaikki tiedot! Olet lämpimästi tervetullut kohteeseen {offerTitle}, ja toivotamme sinulle oikein mukavaa oleskelua!'),

    ('tenant_details_v1', 'fi', 'section.stay.title', 'Matka ja oleskelu'),
    ('tenant_details_v1', 'fi', 'section.stay.description', 'Vuokraamme vähintään 14 yöksi. Suosimme vähintään 30 yön oleskeluja, koska ne sopivat kausivuokraukseemme parhaiten.'),
    ('tenant_details_v1', 'fi', 'field.planned_arrival.label', 'Suunniteltu saapumispäivä'),
    ('tenant_details_v1', 'fi', 'field.planned_departure.label', 'Suunniteltu lähtöpäivä'),

    ('tenant_details_v1', 'fi', 'section.main_guest.title', 'Päävieras'),
    ('tenant_details_v1', 'fi', 'section.main_guest.description', 'Kirjoita tiedot täsmälleen niin kuin ne ovat passissasi tai henkilökortissasi.'),
    ('tenant_details_v1', 'fi', 'field.first_name.label', 'Etunimet'),
    ('tenant_details_v1', 'fi', 'field.last_name.label', 'Sukunimi'),
    ('tenant_details_v1', 'fi', 'field.last_name.help', 'Kaikki sukunimet niin kuin ne ovat passissasi tai henkilökortissasi.'),
    ('tenant_details_v1', 'fi', 'field.sex.label', 'Sukupuoli (passin tai henkilökortin mukaan)'),
    ('tenant_details_v1', 'fi', 'option.sex.female', 'Nainen'),
    ('tenant_details_v1', 'fi', 'option.sex.male', 'Mies'),
    ('tenant_details_v1', 'fi', 'option.sex.other', 'Muu / X'),
    ('tenant_details_v1', 'fi', 'field.date_of_birth.label', 'Syntymäaika'),
    ('tenant_details_v1', 'fi', 'field.citizenship.label', 'Kansalaisuus'),
    ('tenant_details_v1', 'fi', 'field.document_type.label', 'Asiakirjan tyyppi'),
    ('tenant_details_v1', 'fi', 'option.document_type.passport', 'Passi'),
    ('tenant_details_v1', 'fi', 'option.document_type.id_card', 'Henkilökortti'),
    ('tenant_details_v1', 'fi', 'option.document_type.residence_permit', 'Oleskelulupa'),
    ('tenant_details_v1', 'fi', 'field.document_number.label', 'Passin tai henkilökortin numero'),

    ('tenant_details_v1', 'fi', 'section.contact.title', 'Yhteystiedot'),
    ('tenant_details_v1', 'fi', 'section.contact.description', 'Käytämme näitä tietoja vain, kun otamme sinuun yhteyttä tähän varaukseen liittyen.'),
    ('tenant_details_v1', 'fi', 'field.phone.label', 'Puhelinnumero'),
    ('tenant_details_v1', 'fi', 'field.phone.help', 'Maatunnuksen kanssa, esimerkiksi +358 40 123 4567.'),
    ('tenant_details_v1', 'fi', 'field.contact_email.label', 'Sähköpostiosoite'),
    ('tenant_details_v1', 'fi', 'field.contact_email.help', 'Olemme täyttäneet valmiiksi Google-tilisi sähköpostiosoitteen. Voit vaihtaa sen, jos haluat käyttää toista osoitetta.'),

    ('tenant_details_v1', 'fi', 'section.address.title', 'Päävieraan osoite'),
    ('tenant_details_v1', 'fi', 'section.address.description', 'Kirjoita nykyinen kotiosoitteesi. Tietoja käytetään vuokrasopimuksessa ja lakisääteisessä rekisteröinnissä.'),
    ('tenant_details_v1', 'fi', 'field.address_line1.label', 'Katuosoite'),
    ('tenant_details_v1', 'fi', 'field.address_line1.placeholder', 'Mannerheimintie 12 A 3'),
    ('tenant_details_v1', 'fi', 'field.address_line2.label', 'Osoitteen lisärivi'),
    ('tenant_details_v1', 'fi', 'field.city.label', 'Paikkakunta'),
    ('tenant_details_v1', 'fi', 'field.city.placeholder', 'Helsinki'),
    ('tenant_details_v1', 'fi', 'field.region.label', 'Maakunta / alue'),
    ('tenant_details_v1', 'fi', 'field.region.placeholder', 'Uusimaa'),
    ('tenant_details_v1', 'fi', 'field.postcode.label', 'Postinumero'),
    ('tenant_details_v1', 'fi', 'field.country.label', 'Maa'),

    ('tenant_details_v1', 'fi', 'section.guests.title', 'Muut vieraat'),
    ('tenant_details_v1', 'fi', 'section.guests.description', 'Lisää kaikki, jotka majoittuvat kanssasi, myös lapset. Espanjan vierasrekisteröinti edellyttää nämä tiedot jokaisesta vieraasta.'),
    ('tenant_details_v1', 'fi', 'field.other_guests.label', 'Muut vieraat'),
    ('tenant_details_v1', 'fi', 'field.other_guests.help', 'Lisää jokainen vieras erikseen. Jos matkustat yksin, voit ohittaa tämän kohdan.'),
    ('tenant_details_v1', 'fi', 'field.other_guests.item.first_name.label', 'Etunimet'),
    ('tenant_details_v1', 'fi', 'field.other_guests.item.last_name.label', 'Sukunimi'),
    ('tenant_details_v1', 'fi', 'field.other_guests.item.sex.label', 'Sukupuoli'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.sex.female', 'Nainen'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.sex.male', 'Mies'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.sex.other', 'Muu / X'),
    ('tenant_details_v1', 'fi', 'field.other_guests.item.date_of_birth.label', 'Syntymäaika'),
    ('tenant_details_v1', 'fi', 'field.other_guests.item.citizenship.label', 'Kansalaisuus'),
    ('tenant_details_v1', 'fi', 'field.other_guests.item.document_type.label', 'Asiakirjan tyyppi'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.document_type.passport', 'Passi'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.document_type.id_card', 'Henkilökortti'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.document_type.residence_permit', 'Oleskelulupa'),
    ('tenant_details_v1', 'fi', 'field.other_guests.item.document_number.label', 'Passin tai henkilökortin numero'),
    ('tenant_details_v1', 'fi', 'field.other_guests.item.relationship.label', 'Suhde päävieraaseen'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.relationship.partner', 'Puoliso / avopuoliso'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.relationship.child', 'Lapsi'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.relationship.parent', 'Vanhempi'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.relationship.sibling', 'Sisarus'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.relationship.other_relative', 'Muu sukulainen'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.relationship.friend', 'Ystävä'),
    ('tenant_details_v1', 'fi', 'option.other_guests.item.relationship.other', 'Muu'),

    ('tenant_details_v1', 'fi', 'section.purpose.title', 'Oleskelun tarkoitus'),
    ('tenant_details_v1', 'fi', 'field.stay_purpose.label', 'Espanjassa oleskelun pääasiallinen syy'),
    ('tenant_details_v1', 'fi', 'field.stay_purpose.help',
        '**Oleskelusi päätarkoitus Espanjassa**'
        || char(10) || 'Valencian itsehallintoalueen lakiasetuksen 9/2024 mukaan yli 10 päivän oleskelulla on oltava *muu kuin matkailullinen* tarkoitus. Valitse vaihtoehto, joka kuvaa tilannettasi parhaiten.'),
    ('tenant_details_v1', 'fi', 'option.stay_purpose.work_assignment', 'Työkomennus / etätyö'),
    ('tenant_details_v1', 'fi', 'option.stay_purpose.pensioner_seasonal', 'Eläkeläisen kausiluonteinen oleskelu'),
    ('tenant_details_v1', 'fi', 'option.stay_purpose.studies', 'Opiskelu tai koulutus'),
    ('tenant_details_v1', 'fi', 'option.stay_purpose.medical_treatment', 'Hoito / kuntoutus'),
    ('tenant_details_v1', 'fi', 'option.stay_purpose.family_visit', 'Perheen luona vierailu / omaisen hoitaminen'),
    ('tenant_details_v1', 'fi', 'option.stay_purpose.relocation', 'Asunnon etsiminen / muuton valmistelu'),
    ('tenant_details_v1', 'fi', 'option.stay_purpose.house_renovation', 'Oma koti remontissa'),
    ('tenant_details_v1', 'fi', 'option.stay_purpose.sports_event', 'Urheiluun osallistuminen tai tapahtumahenkilökunta'),
    ('tenant_details_v1', 'fi', 'option.stay_purpose.other', 'Muu kuin matkailuun liittyvä syy (tarkenna)'),

    ('tenant_details_v1', 'fi', 'section.employment.title', 'Työ ja tulot'),
    ('tenant_details_v1', 'fi', 'section.employment.description', 'Tiedot auttavat meitä varmistamaan työsuhteen ja henkilöllisyyden, kun oleskelun syy on etätyö. Anna vain julkisia linkkejä. Voit jättää työnantajan ja tehtävänimikkeen tyhjiksi, jos haluat.'),
    ('tenant_details_v1', 'fi', 'field.employment_type.label', 'Työtilanne'),
    ('tenant_details_v1', 'fi', 'option.employment_type.pensioner', 'Eläkeläinen'),
    ('tenant_details_v1', 'fi', 'option.employment_type.employee', 'Palkansaaja'),
    ('tenant_details_v1', 'fi', 'option.employment_type.self_employed', 'Yrittäjä / freelancer'),
    ('tenant_details_v1', 'fi', 'option.employment_type.other', 'Muu (tarkenna)'),
    ('tenant_details_v1', 'fi', 'field.employer.label', 'Työnantajan nimi ja verkkosivusto'),
    ('tenant_details_v1', 'fi', 'field.job_title.label', 'Tehtävänimike tai ala'),

    ('tenant_details_v1', 'fi', 'section.id_verification.title', 'Henkilöllisyyden varmistaminen'),
    ('tenant_details_v1', 'fi', 'section.id_verification.description', 'Lyhyt videopuhelu (noin 10 minuuttia WhatsAppissa tai Zoomissa) on osa henkilöllisyyden varmistamista. Suosittelemme sitä, mutta se ei ole aina pakollinen. Voimme pyytää puhelua ennen varauksen vahvistamista ja voimme hylätä varauksen, jos henkilöllisyyttä ei pystytä varmistamaan.'),
    ('tenant_details_v1', 'fi', 'field.id_documents.label', 'Kaikkien vieraiden passi tai henkilökortti'),
    ('tenant_details_v1', 'fi', 'field.id_documents.help',
        'Jotta saapuminen sujuisi mutkattomasti, lataa kuva tai skannaus **jokaisen vieraan** passista tai henkilökortista. Henkilökortista tarvitaan molemmat puolet. Tiedostoja käsitellään luottamuksellisesti, ja ne poistetaan oleskelun jälkeen.'
        || char(10) || 'PDF tai kuva, enintään {maxFiles} tiedostoa, kukin enintään {maxFileSizeMb} Mt.'),
    ('tenant_details_v1', 'fi', 'field.video_call_willing.label', 'Oletko valmis noin 10 minuutin videopuheluun (WhatsApp/Zoom), jossa näytät passisi?'),
    ('tenant_details_v1', 'fi', 'option.video_call_willing.yes', 'Kyllä'),
    ('tenant_details_v1', 'fi', 'option.video_call_willing.no', 'Ei'),
    ('tenant_details_v1', 'fi', 'field.video_call_time.label', 'Sinulle sopivin aika puhelulle'),

    ('tenant_details_v1', 'fi', 'section.special_requests.title', 'Erityistoiveet ja lisätiedot'),
    ('tenant_details_v1', 'fi', 'field.special_requests.label', 'Erityistarpeet tai -toiveet'),
    ('tenant_details_v1', 'fi', 'field.special_requests.help', 'Haluamme, että oleskelusi on mahdollisimman mukava ja miellyttävä. Onko sinulla erityistarpeita tai -toiveita, jotka meidän olisi hyvä tietää? Tai haluatko kertoa meille jotain muuta?'),

    ('tenant_details_v1', 'fi', 'section.consent.title', 'Tietosuoja'),
    ('tenant_details_v1', 'fi', 'field.privacy_consent.label', 'Olen lukenut [tietosuojaselosteen](https://costaseasons.com/fi/legal-notice) ja hyväksyn, että tietojani käsitellään tätä varausta ja lakisääteistä vierasrekisteröintiä varten.')
ON CONFLICT (template_id, language, text_key) DO NOTHING;


-- =========================================================
-- NORWEGIAN (bokmål)
-- =========================================================

INSERT INTO form_translations (template_id, language, text_key, text) VALUES
    ('tenant_details_v1', 'no', 'template.title', '{offerTitle} – spørreskjema for leietakere'),
    ('tenant_details_v1', 'no', 'template.intro',
        'Vi ber deg fylle ut dette korte spørreskjemaet, slik at vi kan sette opp leiekontrakten og oppfylle kravene til gjesteregistrering i Spania.'
        || char(10) || char(10) || 'Spansk lov krever også at vi registrerer det ikke-turistiske formålet med oppholdet ditt.'
        || char(10) || char(10) || 'Svarene dine behandles konfidensielt og brukes bare til bestillingen og for å oppfylle lovpålagte krav.'),
    ('tenant_details_v1', 'no', 'template.success_message', 'Takk for at du har fylt ut alle opplysningene! Vi gleder oss til å ønske deg velkommen til {offerTitle} og håper du får et riktig fint opphold!'),

    ('tenant_details_v1', 'no', 'section.stay.title', 'Reise og opphold'),
    ('tenant_details_v1', 'no', 'section.stay.description', 'Vi leier ut for minst 14 netter. Vi foretrekker opphold på 30 netter eller mer, fordi de passer best med sesongutleien vår.'),
    ('tenant_details_v1', 'no', 'field.planned_arrival.label', 'Planlagt ankomst'),
    ('tenant_details_v1', 'no', 'field.planned_departure.label', 'Planlagt avreise'),

    ('tenant_details_v1', 'no', 'section.main_guest.title', 'Hovedgjest'),
    ('tenant_details_v1', 'no', 'section.main_guest.description', 'Fyll inn opplysningene nøyaktig slik de står i passet eller ID-kortet ditt.'),
    ('tenant_details_v1', 'no', 'field.first_name.label', 'Fornavn'),
    ('tenant_details_v1', 'no', 'field.last_name.label', 'Etternavn'),
    ('tenant_details_v1', 'no', 'field.last_name.help', 'Alle etternavn slik de står i passet eller ID-kortet ditt.'),
    ('tenant_details_v1', 'no', 'field.sex.label', 'Kjønn (slik det står i passet eller ID-kortet)'),
    ('tenant_details_v1', 'no', 'option.sex.female', 'Kvinne'),
    ('tenant_details_v1', 'no', 'option.sex.male', 'Mann'),
    ('tenant_details_v1', 'no', 'option.sex.other', 'Annet / X'),
    ('tenant_details_v1', 'no', 'field.date_of_birth.label', 'Fødselsdato'),
    ('tenant_details_v1', 'no', 'field.citizenship.label', 'Statsborgerskap'),
    ('tenant_details_v1', 'no', 'field.document_type.label', 'Type legitimasjon'),
    ('tenant_details_v1', 'no', 'option.document_type.passport', 'Pass'),
    ('tenant_details_v1', 'no', 'option.document_type.id_card', 'Nasjonalt ID-kort'),
    ('tenant_details_v1', 'no', 'option.document_type.residence_permit', 'Oppholdstillatelse'),
    ('tenant_details_v1', 'no', 'field.document_number.label', 'Pass- eller ID-kortnummer'),

    ('tenant_details_v1', 'no', 'section.contact.title', 'Kontaktinformasjon'),
    ('tenant_details_v1', 'no', 'section.contact.description', 'Vi bruker disse opplysningene bare til å kontakte deg om denne bestillingen.'),
    ('tenant_details_v1', 'no', 'field.phone.label', 'Telefonnummer'),
    ('tenant_details_v1', 'no', 'field.phone.help', 'Med landskode, for eksempel +47 412 34 567.'),
    ('tenant_details_v1', 'no', 'field.contact_email.label', 'E-postadresse'),
    ('tenant_details_v1', 'no', 'field.contact_email.help', 'Vi har fylt inn e-postadressen fra Google-kontoen din. Du kan endre den hvis du heller vil bruke en annen adresse.'),

    ('tenant_details_v1', 'no', 'section.address.title', 'Hovedgjestens adresse'),
    ('tenant_details_v1', 'no', 'section.address.description', 'Fyll inn den nåværende bostedsadressen din. Opplysningene brukes i leiekontrakten og til den lovpålagte registreringen.'),
    ('tenant_details_v1', 'no', 'field.address_line1.label', 'Gateadresse'),
    ('tenant_details_v1', 'no', 'field.address_line1.placeholder', 'Storgata 12'),
    ('tenant_details_v1', 'no', 'field.address_line2.label', 'Adresselinje 2 (f.eks. leilighetsnummer)'),
    ('tenant_details_v1', 'no', 'field.city.label', 'Poststed'),
    ('tenant_details_v1', 'no', 'field.city.placeholder', 'Bergen'),
    ('tenant_details_v1', 'no', 'field.region.label', 'Fylke / region'),
    ('tenant_details_v1', 'no', 'field.region.placeholder', 'Vestland'),
    ('tenant_details_v1', 'no', 'field.postcode.label', 'Postnummer'),
    ('tenant_details_v1', 'no', 'field.country.label', 'Land'),

    ('tenant_details_v1', 'no', 'section.guests.title', 'Andre gjester'),
    ('tenant_details_v1', 'no', 'section.guests.description', 'Legg til alle som skal bo sammen med deg, også barn. Den spanske gjesteregistreringen krever disse opplysningene for hver gjest.'),
    ('tenant_details_v1', 'no', 'field.other_guests.label', 'Andre gjester'),
    ('tenant_details_v1', 'no', 'field.other_guests.help', 'Legg til hver gjest for seg. Hopp over dette hvis du reiser alene.'),
    ('tenant_details_v1', 'no', 'field.other_guests.item.first_name.label', 'Fornavn'),
    ('tenant_details_v1', 'no', 'field.other_guests.item.last_name.label', 'Etternavn'),
    ('tenant_details_v1', 'no', 'field.other_guests.item.sex.label', 'Kjønn'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.sex.female', 'Kvinne'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.sex.male', 'Mann'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.sex.other', 'Annet / X'),
    ('tenant_details_v1', 'no', 'field.other_guests.item.date_of_birth.label', 'Fødselsdato'),
    ('tenant_details_v1', 'no', 'field.other_guests.item.citizenship.label', 'Statsborgerskap'),
    ('tenant_details_v1', 'no', 'field.other_guests.item.document_type.label', 'Type legitimasjon'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.document_type.passport', 'Pass'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.document_type.id_card', 'Nasjonalt ID-kort'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.document_type.residence_permit', 'Oppholdstillatelse'),
    ('tenant_details_v1', 'no', 'field.other_guests.item.document_number.label', 'Pass- eller ID-kortnummer'),
    ('tenant_details_v1', 'no', 'field.other_guests.item.relationship.label', 'Forhold til hovedgjesten'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.relationship.partner', 'Ektefelle / samboer'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.relationship.child', 'Barn'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.relationship.parent', 'Forelder'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.relationship.sibling', 'Søsken'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.relationship.other_relative', 'Annen slektning'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.relationship.friend', 'Venn'),
    ('tenant_details_v1', 'no', 'option.other_guests.item.relationship.other', 'Annet'),

    ('tenant_details_v1', 'no', 'section.purpose.title', 'Formålet med oppholdet'),
    ('tenant_details_v1', 'no', 'field.stay_purpose.label', 'Hovedårsaken til oppholdet i Spania'),
    ('tenant_details_v1', 'no', 'field.stay_purpose.help',
        '**Hovedformålet med oppholdet ditt i Spania**'
        || char(10) || 'Etter Valencia-regionens lovdekret 9/2024 må opphold på mer enn 10 dager ha et *ikke-turistisk* formål. Velg alternativet som passer best for deg.'),
    ('tenant_details_v1', 'no', 'option.stay_purpose.work_assignment', 'Arbeidsoppdrag / fjernarbeid'),
    ('tenant_details_v1', 'no', 'option.stay_purpose.pensioner_seasonal', 'Sesongopphold som pensjonist'),
    ('tenant_details_v1', 'no', 'option.stay_purpose.studies', 'Studier eller kurs'),
    ('tenant_details_v1', 'no', 'option.stay_purpose.medical_treatment', 'Medisinsk behandling / rehabilitering'),
    ('tenant_details_v1', 'no', 'option.stay_purpose.family_visit', 'Familiebesøk / omsorg for et familiemedlem'),
    ('tenant_details_v1', 'no', 'option.stay_purpose.relocation', 'Boligjakt / forberedelse til flytting'),
    ('tenant_details_v1', 'no', 'option.stay_purpose.house_renovation', 'Egen bolig under oppussing'),
    ('tenant_details_v1', 'no', 'option.stay_purpose.sports_event', 'Idrettsdeltakelse eller arrangementspersonell'),
    ('tenant_details_v1', 'no', 'option.stay_purpose.other', 'Annen ikke-turistisk årsak (spesifiser)'),

    ('tenant_details_v1', 'no', 'section.employment.title', 'Arbeid og inntekt'),
    ('tenant_details_v1', 'no', 'section.employment.description', 'Hjelper oss å bekrefte arbeidsforhold og identitet ved opphold med fjernarbeid. Oppgi bare offentlige lenker. Du kan la arbeidsgiver og stilling stå tomme hvis du vil.'),
    ('tenant_details_v1', 'no', 'field.employment_type.label', 'Arbeidssituasjon'),
    ('tenant_details_v1', 'no', 'option.employment_type.pensioner', 'Pensjonist'),
    ('tenant_details_v1', 'no', 'option.employment_type.employee', 'Ansatt'),
    ('tenant_details_v1', 'no', 'option.employment_type.self_employed', 'Selvstendig næringsdrivende / frilanser'),
    ('tenant_details_v1', 'no', 'option.employment_type.other', 'Annet (spesifiser)'),
    ('tenant_details_v1', 'no', 'field.employer.label', 'Arbeidsgivers navn og nettside'),
    ('tenant_details_v1', 'no', 'field.job_title.label', 'Stilling eller fagfelt'),

    ('tenant_details_v1', 'no', 'section.id_verification.title', 'Identitetskontroll'),
    ('tenant_details_v1', 'no', 'section.id_verification.description', 'En kort videosamtale (ca. 10 minutter på WhatsApp eller Zoom) er en del av identitetskontrollen vår. Den anbefales, men er ikke alltid påkrevd. Vi kan be om en samtale før vi bekrefter bestillingen, og vi kan avslå bestillingen hvis identiteten ikke kan bekreftes.'),
    ('tenant_details_v1', 'no', 'field.id_documents.label', 'Pass eller ID-kort for alle gjestene'),
    ('tenant_details_v1', 'no', 'field.id_documents.help',
        'For at innsjekkingen skal gå knirkefritt, ber vi deg laste opp et bilde eller en skanning av passet eller ID-kortet til **hver gjest**. For ID-kort må begge sider lastes opp. Filene behandles konfidensielt og slettes etter oppholdet.'
        || char(10) || 'PDF eller bilde, opptil {maxFiles} filer, maks {maxFileSizeMb} MB per fil.'),
    ('tenant_details_v1', 'no', 'field.video_call_willing.label', 'Kan du tenke deg en videosamtale på 10 minutter (WhatsApp/Zoom) der du viser passet ditt?'),
    ('tenant_details_v1', 'no', 'option.video_call_willing.yes', 'Ja'),
    ('tenant_details_v1', 'no', 'option.video_call_willing.no', 'Nei'),
    ('tenant_details_v1', 'no', 'field.video_call_time.label', 'Hvilket tidspunkt passer best for samtalen?'),

    ('tenant_details_v1', 'no', 'section.special_requests.title', 'Spesielle behov og merknader'),
    ('tenant_details_v1', 'no', 'field.special_requests.label', 'Spesielle behov eller ønsker'),
    ('tenant_details_v1', 'no', 'field.special_requests.help', 'Vi vil at oppholdet ditt skal bli så komfortabelt og hyggelig som mulig. Har du spesielle behov eller ønsker vi bør vite om? Eller noe annet du vil fortelle oss?'),

    ('tenant_details_v1', 'no', 'section.consent.title', 'Personvern'),
    ('tenant_details_v1', 'no', 'field.privacy_consent.label', 'Jeg har lest [personvernerklæringen](https://costaseasons.com/no/legal-notice) og samtykker i at opplysningene mine behandles for denne bestillingen og for den lovpålagte gjesteregistreringen.')
ON CONFLICT (template_id, language, text_key) DO NOTHING;


-- =========================================================
-- ESTONIAN
-- Addressed with "sina" like the site's Estonian texts. {offerTitle} follows "kohas", so the name
-- itself is never inflected.
-- =========================================================

INSERT INTO form_translations (template_id, language, text_key, text) VALUES
    ('tenant_details_v1', 'et', 'template.title', '{offerTitle} – üürniku küsimustik'),
    ('tenant_details_v1', 'et', 'template.intro',
        'Palun täida see lühike küsimustik, et saaksime koostada üürilepingu ja täita Hispaania külaliste registreerimise nõuded.'
        || char(10) || char(10) || 'Hispaania seadus nõuab ka, et paneksime kirja sinu peatumise mitteturistliku põhjuse.'
        || char(10) || char(10) || 'Sinu vastuseid käsitletakse konfidentsiaalselt ning neid kasutatakse ainult broneeringuga seoses ja seadusest tulenevate nõuete täitmiseks.'),
    ('tenant_details_v1', 'et', 'template.success_message', 'Aitäh, et täitsid kõik andmed! Ootame sind rõõmuga kohas {offerTitle} ja soovime sulle väga meeldivat peatumist!'),

    ('tenant_details_v1', 'et', 'section.stay.title', 'Reis ja peatumine'),
    ('tenant_details_v1', 'et', 'section.stay.description', 'Üürime vähemalt 14 ööks. Eelistame 30-ööseid või pikemaid peatumisi, sest need sobivad meie hooajalise üürimise mudeliga kõige paremini.'),
    ('tenant_details_v1', 'et', 'field.planned_arrival.label', 'Plaanitud saabumine'),
    ('tenant_details_v1', 'et', 'field.planned_departure.label', 'Plaanitud lahkumine'),

    ('tenant_details_v1', 'et', 'section.main_guest.title', 'Peamine külaline'),
    ('tenant_details_v1', 'et', 'section.main_guest.description', 'Sisesta andmed täpselt nii, nagu need on sinu passis või ID-kaardil.'),
    ('tenant_details_v1', 'et', 'field.first_name.label', 'Eesnimi'),
    ('tenant_details_v1', 'et', 'field.last_name.label', 'Perekonnanimi'),
    ('tenant_details_v1', 'et', 'field.last_name.help', 'Kõik perekonnanimed täpselt nii, nagu need on sinu passis või ID-kaardil.'),
    ('tenant_details_v1', 'et', 'field.sex.label', 'Sugu (nagu passis või ID-kaardil)'),
    ('tenant_details_v1', 'et', 'option.sex.female', 'Naine'),
    ('tenant_details_v1', 'et', 'option.sex.male', 'Mees'),
    ('tenant_details_v1', 'et', 'option.sex.other', 'Muu / X'),
    ('tenant_details_v1', 'et', 'field.date_of_birth.label', 'Sünniaeg'),
    ('tenant_details_v1', 'et', 'field.citizenship.label', 'Kodakondsus'),
    ('tenant_details_v1', 'et', 'field.document_type.label', 'Dokumendi liik'),
    ('tenant_details_v1', 'et', 'option.document_type.passport', 'Pass'),
    ('tenant_details_v1', 'et', 'option.document_type.id_card', 'ID-kaart'),
    ('tenant_details_v1', 'et', 'option.document_type.residence_permit', 'Elamisluba'),
    ('tenant_details_v1', 'et', 'field.document_number.label', 'Passi või ID-kaardi number'),

    ('tenant_details_v1', 'et', 'section.contact.title', 'Kontaktandmed'),
    ('tenant_details_v1', 'et', 'section.contact.description', 'Kasutame neid andmeid ainult selleks, et selle broneeringu asjus sinuga ühendust võtta.'),
    ('tenant_details_v1', 'et', 'field.phone.label', 'Telefoninumber'),
    ('tenant_details_v1', 'et', 'field.phone.help', 'Koos riigikoodiga, näiteks +372 5123 4567.'),
    ('tenant_details_v1', 'et', 'field.contact_email.label', 'E-posti aadress'),
    ('tenant_details_v1', 'et', 'field.contact_email.help', 'Täitsime selle sinu Google’i konto e-posti aadressiga. Kui soovid kasutada mõnda teist aadressi, võid seda muuta.'),

    ('tenant_details_v1', 'et', 'section.address.title', 'Peamise külalise aadress'),
    ('tenant_details_v1', 'et', 'section.address.description', 'Sisesta oma praegune elukoha aadress. Seda kasutatakse üürilepingus ja seadusega nõutud registreerimisel.'),
    ('tenant_details_v1', 'et', 'field.address_line1.label', 'Tänav, maja ja korter'),
    ('tenant_details_v1', 'et', 'field.address_line1.placeholder', 'Tartu mnt 12-5'),
    ('tenant_details_v1', 'et', 'field.address_line2.label', 'Aadressi lisarida'),
    ('tenant_details_v1', 'et', 'field.city.label', 'Linn või asula'),
    ('tenant_details_v1', 'et', 'field.city.placeholder', 'Tallinn'),
    ('tenant_details_v1', 'et', 'field.region.label', 'Maakond / piirkond'),
    ('tenant_details_v1', 'et', 'field.region.placeholder', 'Harju maakond'),
    ('tenant_details_v1', 'et', 'field.postcode.label', 'Postiindeks'),
    ('tenant_details_v1', 'et', 'field.country.label', 'Riik'),

    ('tenant_details_v1', 'et', 'section.guests.title', 'Teised külalised'),
    ('tenant_details_v1', 'et', 'section.guests.description', 'Lisa kõik, kes sinuga koos peatuvad, ka lapsed. Hispaania külaliste registreerimiseks on need andmed vaja iga külalise kohta.'),
    ('tenant_details_v1', 'et', 'field.other_guests.label', 'Teised külalised'),
    ('tenant_details_v1', 'et', 'field.other_guests.help', 'Lisa iga külaline eraldi. Kui reisid üksi, jäta see osa vahele.'),
    ('tenant_details_v1', 'et', 'field.other_guests.item.first_name.label', 'Eesnimi'),
    ('tenant_details_v1', 'et', 'field.other_guests.item.last_name.label', 'Perekonnanimi'),
    ('tenant_details_v1', 'et', 'field.other_guests.item.sex.label', 'Sugu'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.sex.female', 'Naine'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.sex.male', 'Mees'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.sex.other', 'Muu / X'),
    ('tenant_details_v1', 'et', 'field.other_guests.item.date_of_birth.label', 'Sünniaeg'),
    ('tenant_details_v1', 'et', 'field.other_guests.item.citizenship.label', 'Kodakondsus'),
    ('tenant_details_v1', 'et', 'field.other_guests.item.document_type.label', 'Dokumendi liik'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.document_type.passport', 'Pass'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.document_type.id_card', 'ID-kaart'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.document_type.residence_permit', 'Elamisluba'),
    ('tenant_details_v1', 'et', 'field.other_guests.item.document_number.label', 'Passi või ID-kaardi number'),
    ('tenant_details_v1', 'et', 'field.other_guests.item.relationship.label', 'Suhe peamise külalisega'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.relationship.partner', 'Abikaasa / elukaaslane'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.relationship.child', 'Laps'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.relationship.parent', 'Vanem'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.relationship.sibling', 'Õde või vend'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.relationship.other_relative', 'Muu sugulane'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.relationship.friend', 'Sõber'),
    ('tenant_details_v1', 'et', 'option.other_guests.item.relationship.other', 'Muu'),

    ('tenant_details_v1', 'et', 'section.purpose.title', 'Peatumise eesmärk'),
    ('tenant_details_v1', 'et', 'field.stay_purpose.label', 'Hispaaniasse tuleku peamine põhjus'),
    ('tenant_details_v1', 'et', 'field.stay_purpose.help',
        '**Sinu Hispaanias viibimise peamine eesmärk**'
        || char(10) || 'Valencia autonoomse piirkonna dekreetseaduse 9/2024 järgi peab üle 10 päeva kestval peatumisel olema *mitteturistlik* eesmärk. Vali variant, mis kirjeldab sinu olukorda kõige paremini.'),
    ('tenant_details_v1', 'et', 'option.stay_purpose.work_assignment', 'Töökomandeering / kaugtöö'),
    ('tenant_details_v1', 'et', 'option.stay_purpose.pensioner_seasonal', 'Pensionäri hooajaline peatumine'),
    ('tenant_details_v1', 'et', 'option.stay_purpose.studies', 'Õpingud või koolitus'),
    ('tenant_details_v1', 'et', 'option.stay_purpose.medical_treatment', 'Ravi / taastusravi'),
    ('tenant_details_v1', 'et', 'option.stay_purpose.family_visit', 'Pere külastamine / lähedase hooldamine'),
    ('tenant_details_v1', 'et', 'option.stay_purpose.relocation', 'Kodu otsimine / kolimise ettevalmistamine'),
    ('tenant_details_v1', 'et', 'option.stay_purpose.house_renovation', 'Oma kodu on remondis'),
    ('tenant_details_v1', 'et', 'option.stay_purpose.sports_event', 'Spordis osalemine või ürituse personal'),
    ('tenant_details_v1', 'et', 'option.stay_purpose.other', 'Muu mitteturistlik põhjus (täpsusta)'),

    ('tenant_details_v1', 'et', 'section.employment.title', 'Töö ja sissetulek'),
    ('tenant_details_v1', 'et', 'section.employment.description', 'Aitab meil kaugtöö puhul kontrollida töökohta ja isikut. Lisa ainult avalikke linke. Kui soovid, võid tööandja ja ametikoha tühjaks jätta.'),
    ('tenant_details_v1', 'et', 'field.employment_type.label', 'Tööalane staatus'),
    ('tenant_details_v1', 'et', 'option.employment_type.pensioner', 'Pensionär'),
    ('tenant_details_v1', 'et', 'option.employment_type.employee', 'Palgatöötaja'),
    ('tenant_details_v1', 'et', 'option.employment_type.self_employed', 'Ettevõtja või vabakutseline'),
    ('tenant_details_v1', 'et', 'option.employment_type.other', 'Muu (täpsusta)'),
    ('tenant_details_v1', 'et', 'field.employer.label', 'Tööandja nimi ja veebileht'),
    ('tenant_details_v1', 'et', 'field.job_title.label', 'Ametikoht või tegevusala'),

    ('tenant_details_v1', 'et', 'section.id_verification.title', 'Isikutuvastus'),
    ('tenant_details_v1', 'et', 'section.id_verification.description', 'Lühike videokõne (umbes 10 minutit WhatsAppis või Zoomis) on osa meie isikutuvastusest. Soovitame seda, kuid see pole alati kohustuslik. Võime enne broneeringu kinnitamist kõnet paluda ja broneeringust keelduda, kui isikut ei õnnestu tuvastada.'),
    ('tenant_details_v1', 'et', 'field.id_documents.label', 'Kõigi külaliste pass või ID-kaart'),
    ('tenant_details_v1', 'et', 'field.id_documents.help',
        'Et saabumine sujuks, laadi palun üles **iga külalise** passi või ID-kaardi foto või skaneeritud koopia. ID-kaardist laadi üles mõlemad pooled. Faile käsitletakse konfidentsiaalselt ja need kustutatakse pärast peatumist.'
        || char(10) || 'PDF või pilt, kuni {maxFiles} faili, iga fail kuni {maxFileSizeMb} MB.'),
    ('tenant_details_v1', 'et', 'field.video_call_willing.label', 'Kas oled nõus umbes 10-minutilise videokõnega (WhatsApp/Zoom), kus näitad oma passi?'),
    ('tenant_details_v1', 'et', 'option.video_call_willing.yes', 'Jah'),
    ('tenant_details_v1', 'et', 'option.video_call_willing.no', 'Ei'),
    ('tenant_details_v1', 'et', 'field.video_call_time.label', 'Sulle sobivaim aeg kõneks'),

    ('tenant_details_v1', 'et', 'section.special_requests.title', 'Erisoovid ja märkused'),
    ('tenant_details_v1', 'et', 'field.special_requests.label', 'Erivajadused või soovid'),
    ('tenant_details_v1', 'et', 'field.special_requests.help', 'Soovime, et sinu peatumine oleks võimalikult mugav ja meeldiv. Kas sul on erivajadusi või soove, millest peaksime teadma? Või midagi muud, mida tahaksid meile öelda?'),

    ('tenant_details_v1', 'et', 'section.consent.title', 'Andmekaitse'),
    ('tenant_details_v1', 'et', 'field.privacy_consent.label', 'Olen tutvunud [privaatsusteabega](https://costaseasons.com/et/legal-notice) ja nõustun, et minu andmeid töödeldakse selle broneeringu ja seadusega nõutud külaliste registreerimise jaoks.')
ON CONFLICT (template_id, language, text_key) DO NOTHING;
