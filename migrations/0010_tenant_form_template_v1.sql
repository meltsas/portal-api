-- =========================================================
-- TENANT DETAILS FORM: TEMPLATE v1 (EN + SV)
-- Field list: non-touristic-rentals/docs/seasona-rental-details-form/form-fields-inventory.md §4
-- Texts are editable later in the admin text editor. Line breaks use char(10)
-- so the file's own line endings never end up in the texts.
-- =========================================================

INSERT INTO form_templates (id, template_key, version, base_language, status)
VALUES ('tenant_details_v1', 'tenant_details', 1, 'en', 'active');

INSERT INTO form_sections (id, template_id, section_key, sort_order) VALUES
    ('tdv1_s_stay', 'tenant_details_v1', 'stay', 1),
    ('tdv1_s_main_guest', 'tenant_details_v1', 'main_guest', 2),
    ('tdv1_s_contact', 'tenant_details_v1', 'contact', 3),
    ('tdv1_s_address', 'tenant_details_v1', 'address', 4),
    ('tdv1_s_guests', 'tenant_details_v1', 'guests', 5),
    ('tdv1_s_purpose', 'tenant_details_v1', 'purpose', 6),
    ('tdv1_s_employment', 'tenant_details_v1', 'employment', 7),
    ('tdv1_s_id_verification', 'tenant_details_v1', 'id_verification', 8),
    ('tdv1_s_special_requests', 'tenant_details_v1', 'special_requests', 9),
    ('tdv1_s_consent', 'tenant_details_v1', 'consent', 10);

INSERT INTO form_fields (id, template_id, section_id, parent_field_id, field_key, field_type, is_required, sort_order, validation_json, visible_if_json) VALUES
    ('tdv1_f_planned_arrival', 'tenant_details_v1', 'tdv1_s_stay', NULL, 'planned_arrival', 'date', 1, 1, '{}', NULL),
    ('tdv1_f_planned_departure', 'tenant_details_v1', 'tdv1_s_stay', NULL, 'planned_departure', 'date', 1, 2, '{"minNightsAfter":"planned_arrival","minNights":14}', NULL),

    ('tdv1_f_first_name', 'tenant_details_v1', 'tdv1_s_main_guest', NULL, 'first_name', 'text', 1, 1, '{"maxLength":100}', NULL),
    ('tdv1_f_last_name', 'tenant_details_v1', 'tdv1_s_main_guest', NULL, 'last_name', 'text', 1, 2, '{"maxLength":100}', NULL),
    ('tdv1_f_sex', 'tenant_details_v1', 'tdv1_s_main_guest', NULL, 'sex', 'single_choice', 1, 3, '{}', NULL),
    ('tdv1_f_date_of_birth', 'tenant_details_v1', 'tdv1_s_main_guest', NULL, 'date_of_birth', 'date', 1, 4, '{"notInFuture":true}', NULL),
    ('tdv1_f_citizenship', 'tenant_details_v1', 'tdv1_s_main_guest', NULL, 'citizenship', 'text', 1, 5, '{"maxLength":100}', NULL),
    ('tdv1_f_document_type', 'tenant_details_v1', 'tdv1_s_main_guest', NULL, 'document_type', 'single_choice', 1, 6, '{}', NULL),
    ('tdv1_f_document_number', 'tenant_details_v1', 'tdv1_s_main_guest', NULL, 'document_number', 'text', 1, 7, '{"maxLength":50}', NULL),

    ('tdv1_f_phone', 'tenant_details_v1', 'tdv1_s_contact', NULL, 'phone', 'tel', 1, 1, '{"minLength":6,"maxLength":30}', NULL),
    ('tdv1_f_contact_email', 'tenant_details_v1', 'tdv1_s_contact', NULL, 'contact_email', 'email', 1, 2, '{"maxLength":254}', NULL),

    ('tdv1_f_address_line1', 'tenant_details_v1', 'tdv1_s_address', NULL, 'address_line1', 'text', 1, 1, '{"maxLength":200}', NULL),
    ('tdv1_f_address_line2', 'tenant_details_v1', 'tdv1_s_address', NULL, 'address_line2', 'text', 0, 2, '{"maxLength":200}', NULL),
    ('tdv1_f_city', 'tenant_details_v1', 'tdv1_s_address', NULL, 'city', 'text', 1, 3, '{"maxLength":100}', NULL),
    ('tdv1_f_region', 'tenant_details_v1', 'tdv1_s_address', NULL, 'region', 'text', 0, 4, '{"maxLength":100}', NULL),
    ('tdv1_f_postcode', 'tenant_details_v1', 'tdv1_s_address', NULL, 'postcode', 'text', 1, 5, '{"maxLength":20}', NULL),
    ('tdv1_f_country', 'tenant_details_v1', 'tdv1_s_address', NULL, 'country', 'text', 1, 6, '{"maxLength":100}', NULL),

    ('tdv1_f_other_guests', 'tenant_details_v1', 'tdv1_s_guests', NULL, 'other_guests', 'guest_list', 0, 1, '{"maxItems":10}', NULL),
    ('tdv1_f_other_guests__first_name', 'tenant_details_v1', 'tdv1_s_guests', 'tdv1_f_other_guests', 'first_name', 'text', 1, 1, '{"maxLength":100}', NULL),
    ('tdv1_f_other_guests__last_name', 'tenant_details_v1', 'tdv1_s_guests', 'tdv1_f_other_guests', 'last_name', 'text', 1, 2, '{"maxLength":100}', NULL),
    ('tdv1_f_other_guests__sex', 'tenant_details_v1', 'tdv1_s_guests', 'tdv1_f_other_guests', 'sex', 'single_choice', 1, 3, '{}', NULL),
    ('tdv1_f_other_guests__date_of_birth', 'tenant_details_v1', 'tdv1_s_guests', 'tdv1_f_other_guests', 'date_of_birth', 'date', 1, 4, '{"notInFuture":true}', NULL),
    ('tdv1_f_other_guests__citizenship', 'tenant_details_v1', 'tdv1_s_guests', 'tdv1_f_other_guests', 'citizenship', 'text', 1, 5, '{"maxLength":100}', NULL),
    ('tdv1_f_other_guests__document_type', 'tenant_details_v1', 'tdv1_s_guests', 'tdv1_f_other_guests', 'document_type', 'single_choice', 1, 6, '{}', NULL),
    ('tdv1_f_other_guests__document_number', 'tenant_details_v1', 'tdv1_s_guests', 'tdv1_f_other_guests', 'document_number', 'text', 1, 7, '{"maxLength":50}', NULL),
    ('tdv1_f_other_guests__relationship', 'tenant_details_v1', 'tdv1_s_guests', 'tdv1_f_other_guests', 'relationship', 'single_choice', 1, 8, '{}', NULL),

    ('tdv1_f_stay_purpose', 'tenant_details_v1', 'tdv1_s_purpose', NULL, 'stay_purpose', 'single_choice', 1, 1, '{}', NULL),

    ('tdv1_f_employment_type', 'tenant_details_v1', 'tdv1_s_employment', NULL, 'employment_type', 'single_choice', 1, 1, '{}', NULL),
    ('tdv1_f_employer', 'tenant_details_v1', 'tdv1_s_employment', NULL, 'employer', 'text', 0, 2, '{"maxLength":200}', NULL),
    ('tdv1_f_job_title', 'tenant_details_v1', 'tdv1_s_employment', NULL, 'job_title', 'text', 0, 3, '{"maxLength":200}', NULL),

    ('tdv1_f_id_documents', 'tenant_details_v1', 'tdv1_s_id_verification', NULL, 'id_documents', 'file', 1, 1, '{"minFiles":1,"maxFiles":10,"maxFileBytes":10485760,"accept":["image/jpeg","image/png","application/pdf"]}', NULL),
    ('tdv1_f_video_call_willing', 'tenant_details_v1', 'tdv1_s_id_verification', NULL, 'video_call_willing', 'single_choice', 1, 2, '{}', NULL),
    ('tdv1_f_video_call_time', 'tenant_details_v1', 'tdv1_s_id_verification', NULL, 'video_call_time', 'text', 0, 3, '{"maxLength":200}', '{"field":"video_call_willing","equals":"yes"}'),

    ('tdv1_f_special_requests', 'tenant_details_v1', 'tdv1_s_special_requests', NULL, 'special_requests', 'textarea', 0, 1, '{"maxLength":2000}', NULL),

    ('tdv1_f_privacy_consent', 'tenant_details_v1', 'tdv1_s_consent', NULL, 'privacy_consent', 'checkbox', 1, 1, '{}', NULL);

INSERT INTO form_field_options (id, field_id, option_key, sort_order, allows_free_text) VALUES
    ('tdv1_o_sex__female', 'tdv1_f_sex', 'female', 1, 0),
    ('tdv1_o_sex__male', 'tdv1_f_sex', 'male', 2, 0),
    ('tdv1_o_sex__other', 'tdv1_f_sex', 'other', 3, 0),

    ('tdv1_o_document_type__passport', 'tdv1_f_document_type', 'passport', 1, 0),
    ('tdv1_o_document_type__id_card', 'tdv1_f_document_type', 'id_card', 2, 0),
    ('tdv1_o_document_type__residence_permit', 'tdv1_f_document_type', 'residence_permit', 3, 0),

    ('tdv1_o_other_guests__sex__female', 'tdv1_f_other_guests__sex', 'female', 1, 0),
    ('tdv1_o_other_guests__sex__male', 'tdv1_f_other_guests__sex', 'male', 2, 0),
    ('tdv1_o_other_guests__sex__other', 'tdv1_f_other_guests__sex', 'other', 3, 0),

    ('tdv1_o_other_guests__document_type__passport', 'tdv1_f_other_guests__document_type', 'passport', 1, 0),
    ('tdv1_o_other_guests__document_type__id_card', 'tdv1_f_other_guests__document_type', 'id_card', 2, 0),
    ('tdv1_o_other_guests__document_type__residence_permit', 'tdv1_f_other_guests__document_type', 'residence_permit', 3, 0),

    ('tdv1_o_other_guests__relationship__partner', 'tdv1_f_other_guests__relationship', 'partner', 1, 0),
    ('tdv1_o_other_guests__relationship__child', 'tdv1_f_other_guests__relationship', 'child', 2, 0),
    ('tdv1_o_other_guests__relationship__parent', 'tdv1_f_other_guests__relationship', 'parent', 3, 0),
    ('tdv1_o_other_guests__relationship__sibling', 'tdv1_f_other_guests__relationship', 'sibling', 4, 0),
    ('tdv1_o_other_guests__relationship__other_relative', 'tdv1_f_other_guests__relationship', 'other_relative', 5, 0),
    ('tdv1_o_other_guests__relationship__friend', 'tdv1_f_other_guests__relationship', 'friend', 6, 0),
    ('tdv1_o_other_guests__relationship__other', 'tdv1_f_other_guests__relationship', 'other', 7, 0),

    ('tdv1_o_stay_purpose__work_assignment', 'tdv1_f_stay_purpose', 'work_assignment', 1, 0),
    ('tdv1_o_stay_purpose__pensioner_seasonal', 'tdv1_f_stay_purpose', 'pensioner_seasonal', 2, 0),
    ('tdv1_o_stay_purpose__studies', 'tdv1_f_stay_purpose', 'studies', 3, 0),
    ('tdv1_o_stay_purpose__medical_treatment', 'tdv1_f_stay_purpose', 'medical_treatment', 4, 0),
    ('tdv1_o_stay_purpose__family_visit', 'tdv1_f_stay_purpose', 'family_visit', 5, 0),
    ('tdv1_o_stay_purpose__relocation', 'tdv1_f_stay_purpose', 'relocation', 6, 0),
    ('tdv1_o_stay_purpose__house_renovation', 'tdv1_f_stay_purpose', 'house_renovation', 7, 0),
    ('tdv1_o_stay_purpose__sports_event', 'tdv1_f_stay_purpose', 'sports_event', 8, 0),
    ('tdv1_o_stay_purpose__other', 'tdv1_f_stay_purpose', 'other', 9, 1),

    ('tdv1_o_employment_type__pensioner', 'tdv1_f_employment_type', 'pensioner', 1, 0),
    ('tdv1_o_employment_type__employee', 'tdv1_f_employment_type', 'employee', 2, 0),
    ('tdv1_o_employment_type__self_employed', 'tdv1_f_employment_type', 'self_employed', 3, 0),
    ('tdv1_o_employment_type__other', 'tdv1_f_employment_type', 'other', 4, 1),

    ('tdv1_o_video_call_willing__yes', 'tdv1_f_video_call_willing', 'yes', 1, 0),
    ('tdv1_o_video_call_willing__no', 'tdv1_f_video_call_willing', 'no', 2, 0);


-- =========================================================
-- ENGLISH (base language)
-- =========================================================

INSERT INTO form_translations (template_id, language, text_key, text) VALUES
    ('tenant_details_v1', 'en', 'template.title', '{offerTitle} – rental questionnaire'),
    ('tenant_details_v1', 'en', 'template.intro',
        'Please complete this short questionnaire so we can draft the rental contract and meet the Spanish guest registration requirements.'
        || char(10) || char(10) || 'Spanish law also requires us to record the non-tourist reason for your stay.'
        || char(10) || char(10) || 'Your answers remain confidential and are used only for the booking and for legal compliance.'),
    ('tenant_details_v1', 'en', 'template.success_message', 'Thank you for filling out all the information. We look forward to welcoming you to {offerTitle} and wish you a truly enjoyable stay!'),

    ('tenant_details_v1', 'en', 'section.stay.title', 'Trip & stay'),
    ('tenant_details_v1', 'en', 'section.stay.description', 'We rent for a minimum of 14 nights. We prefer stays of 30 nights or more, as they suit our seasonal rental model best.'),
    ('tenant_details_v1', 'en', 'field.planned_arrival.label', 'Planned arrival'),
    ('tenant_details_v1', 'en', 'field.planned_departure.label', 'Planned departure'),

    ('tenant_details_v1', 'en', 'section.main_guest.title', 'Main guest'),
    ('tenant_details_v1', 'en', 'section.main_guest.description', 'Please enter the details exactly as they appear in your passport or ID card.'),
    ('tenant_details_v1', 'en', 'field.first_name.label', 'First name(s)'),
    ('tenant_details_v1', 'en', 'field.last_name.label', 'Last name(s)'),
    ('tenant_details_v1', 'en', 'field.last_name.help', 'All surnames as shown in your passport or ID card.'),
    ('tenant_details_v1', 'en', 'field.sex.label', 'Sex (as shown in your passport or ID card)'),
    ('tenant_details_v1', 'en', 'option.sex.female', 'Female'),
    ('tenant_details_v1', 'en', 'option.sex.male', 'Male'),
    ('tenant_details_v1', 'en', 'option.sex.other', 'Other / X'),
    ('tenant_details_v1', 'en', 'field.date_of_birth.label', 'Date of birth'),
    ('tenant_details_v1', 'en', 'field.citizenship.label', 'Citizenship'),
    ('tenant_details_v1', 'en', 'field.document_type.label', 'Document type'),
    ('tenant_details_v1', 'en', 'option.document_type.passport', 'Passport'),
    ('tenant_details_v1', 'en', 'option.document_type.id_card', 'National ID card'),
    ('tenant_details_v1', 'en', 'option.document_type.residence_permit', 'Residence permit'),
    ('tenant_details_v1', 'en', 'field.document_number.label', 'Passport or ID number'),

    ('tenant_details_v1', 'en', 'section.contact.title', 'Contact details'),
    ('tenant_details_v1', 'en', 'section.contact.description', 'We use these details only to contact you about this booking.'),
    ('tenant_details_v1', 'en', 'field.phone.label', 'Phone number'),
    ('tenant_details_v1', 'en', 'field.phone.help', 'Including the country code, for example +46 70 123 45 67.'),
    ('tenant_details_v1', 'en', 'field.contact_email.label', 'Email address'),
    ('tenant_details_v1', 'en', 'field.contact_email.help', 'We have filled in the email address of your Google account. You can change it if you prefer another address.'),

    ('tenant_details_v1', 'en', 'section.address.title', 'Address details (main guest)'),
    ('tenant_details_v1', 'en', 'section.address.description', 'Please enter your current home address. This information will be used for rental agreements and mandatory legal registration.'),
    ('tenant_details_v1', 'en', 'field.address_line1.label', 'Address line 1'),
    ('tenant_details_v1', 'en', 'field.address_line1.placeholder', '20 Prince Street'),
    ('tenant_details_v1', 'en', 'field.address_line2.label', 'Address line 2'),
    ('tenant_details_v1', 'en', 'field.city.label', 'Town or city'),
    ('tenant_details_v1', 'en', 'field.city.placeholder', 'London'),
    ('tenant_details_v1', 'en', 'field.region.label', 'County / region'),
    ('tenant_details_v1', 'en', 'field.region.placeholder', 'Greater London'),
    ('tenant_details_v1', 'en', 'field.postcode.label', 'Postcode'),
    ('tenant_details_v1', 'en', 'field.country.label', 'Country'),

    ('tenant_details_v1', 'en', 'section.guests.title', 'Other guests'),
    ('tenant_details_v1', 'en', 'section.guests.description', 'Please add everyone who will stay with you, including children. The Spanish guest registration requires these details for every guest.'),
    ('tenant_details_v1', 'en', 'field.other_guests.label', 'Other guests'),
    ('tenant_details_v1', 'en', 'field.other_guests.help', 'Add one entry per guest. Leave empty if you travel alone.'),
    ('tenant_details_v1', 'en', 'field.other_guests.item.first_name.label', 'First name(s)'),
    ('tenant_details_v1', 'en', 'field.other_guests.item.last_name.label', 'Last name(s)'),
    ('tenant_details_v1', 'en', 'field.other_guests.item.sex.label', 'Sex'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.sex.female', 'Female'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.sex.male', 'Male'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.sex.other', 'Other / X'),
    ('tenant_details_v1', 'en', 'field.other_guests.item.date_of_birth.label', 'Date of birth'),
    ('tenant_details_v1', 'en', 'field.other_guests.item.citizenship.label', 'Citizenship'),
    ('tenant_details_v1', 'en', 'field.other_guests.item.document_type.label', 'Document type'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.document_type.passport', 'Passport'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.document_type.id_card', 'National ID card'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.document_type.residence_permit', 'Residence permit'),
    ('tenant_details_v1', 'en', 'field.other_guests.item.document_number.label', 'Passport or ID number'),
    ('tenant_details_v1', 'en', 'field.other_guests.item.relationship.label', 'Relationship to the main guest'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.relationship.partner', 'Spouse / partner'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.relationship.child', 'Child'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.relationship.parent', 'Parent'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.relationship.sibling', 'Sibling'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.relationship.other_relative', 'Other relative'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.relationship.friend', 'Friend'),
    ('tenant_details_v1', 'en', 'option.other_guests.item.relationship.other', 'Other'),

    ('tenant_details_v1', 'en', 'section.purpose.title', 'Purpose of stay'),
    ('tenant_details_v1', 'en', 'field.stay_purpose.label', 'Main reason for visiting Spain'),
    ('tenant_details_v1', 'en', 'field.stay_purpose.help',
        '**Main purpose of your stay in Spain**'
        || char(10) || 'Under Valencian Decree-Law 9/2024, stays beyond 10 days must have a *non-tourist* purpose. Please choose the option that best describes yours.'),
    ('tenant_details_v1', 'en', 'option.stay_purpose.work_assignment', 'Work assignment / remote work'),
    ('tenant_details_v1', 'en', 'option.stay_purpose.pensioner_seasonal', 'Seasonal stay as a pensioner'),
    ('tenant_details_v1', 'en', 'option.stay_purpose.studies', 'Study or training course'),
    ('tenant_details_v1', 'en', 'option.stay_purpose.medical_treatment', 'Medical treatment / rehabilitation'),
    ('tenant_details_v1', 'en', 'option.stay_purpose.family_visit', 'Family visit / caregiving duty'),
    ('tenant_details_v1', 'en', 'option.stay_purpose.relocation', 'Home-hunting / relocation preparation'),
    ('tenant_details_v1', 'en', 'option.stay_purpose.house_renovation', 'Own home under renovation'),
    ('tenant_details_v1', 'en', 'option.stay_purpose.sports_event', 'Sports participation or event staff'),
    ('tenant_details_v1', 'en', 'option.stay_purpose.other', 'Other non-tourist reason (please specify)'),

    ('tenant_details_v1', 'en', 'section.employment.title', 'Employment & income'),
    ('tenant_details_v1', 'en', 'section.employment.description', 'Helps us verify employment and identity for remote-work stays. Public links only. You can leave the employer and job title blank if you prefer.'),
    ('tenant_details_v1', 'en', 'field.employment_type.label', 'Employment type'),
    ('tenant_details_v1', 'en', 'option.employment_type.pensioner', 'Pensioner'),
    ('tenant_details_v1', 'en', 'option.employment_type.employee', 'Employee'),
    ('tenant_details_v1', 'en', 'option.employment_type.self_employed', 'Self-employed / freelance'),
    ('tenant_details_v1', 'en', 'option.employment_type.other', 'Other (please specify)'),
    ('tenant_details_v1', 'en', 'field.employer.label', 'Employer name & website'),
    ('tenant_details_v1', 'en', 'field.job_title.label', 'Job title or field'),

    ('tenant_details_v1', 'en', 'section.id_verification.title', 'ID verification'),
    ('tenant_details_v1', 'en', 'section.id_verification.description', 'A short video call (about 10 minutes via WhatsApp or Zoom) is part of our identity verification. It is recommended but not always required. We may ask for a call before confirming the booking and may decline the booking if the verification cannot be completed.'),
    ('tenant_details_v1', 'en', 'field.id_documents.label', 'Passport or ID card of every guest'),
    ('tenant_details_v1', 'en', 'field.id_documents.help',
        'To ensure a smooth check-in, please upload a photo or scan of **each guest''s** passport or EU ID card. For ID cards, please upload both sides. The files are treated confidentially and deleted after the stay.'
        || char(10) || 'PDF or image, up to {maxFiles} files, maximum {maxFileSizeMb} MB per file.'),
    ('tenant_details_v1', 'en', 'field.video_call_willing.label', 'Are you willing to do a 10-minute video call (WhatsApp/Zoom) showing your passport?'),
    ('tenant_details_v1', 'en', 'option.video_call_willing.yes', 'Yes'),
    ('tenant_details_v1', 'en', 'option.video_call_willing.no', 'No'),
    ('tenant_details_v1', 'en', 'field.video_call_time.label', 'Preferred time slot for the call'),

    ('tenant_details_v1', 'en', 'section.special_requests.title', 'Special needs & notes'),
    ('tenant_details_v1', 'en', 'field.special_requests.label', 'Special needs or requests'),
    ('tenant_details_v1', 'en', 'field.special_requests.help', 'We want your stay to be as comfortable and enjoyable as possible. Do you have any special needs or requests that we should know about? Any other information you would like to share?'),

    ('tenant_details_v1', 'en', 'section.consent.title', 'Privacy'),
    ('tenant_details_v1', 'en', 'field.privacy_consent.label', 'I have read the [privacy notice](https://costaseasons.com/legal-notice) and agree that my details are processed for this booking and for the legally required guest registration.');


-- =========================================================
-- SWEDISH
-- =========================================================

INSERT INTO form_translations (template_id, language, text_key, text) VALUES
    ('tenant_details_v1', 'sv', 'template.title', '{offerTitle} – uthyrning / frågeformulär'),
    ('tenant_details_v1', 'sv', 'template.intro',
        'Vänligen ta en stund att fylla i detta korta frågeformulär. Uppgifterna behövs för att vi ska kunna upprätta hyreskontraktet samt uppfylla de spanska myndigheternas krav på gästregistrering.'
        || char(10) || char(10) || 'Spansk lag kräver även att vi registrerar det icke-turistiska ändamålet med din vistelse.'
        || char(10) || char(10) || 'Alla uppgifter behandlas konfidentiellt och används enbart i samband med bokningen samt för att följa gällande lagar och regler.'),
    ('tenant_details_v1', 'sv', 'template.success_message', 'Tack för att du har fyllt i alla uppgifter. Vi ser fram emot att välkomna dig till {offerTitle} och önskar dig en riktigt trevlig vistelse!'),

    ('tenant_details_v1', 'sv', 'section.stay.title', 'Resa & vistelse'),
    ('tenant_details_v1', 'sv', 'section.stay.description', 'Vi hyr ut för minst 14 nätter. Vi föredrar vistelser på 30 nätter eller längre, eftersom de passar vår säsongsuthyrning bäst.'),
    ('tenant_details_v1', 'sv', 'field.planned_arrival.label', 'Planerad ankomst'),
    ('tenant_details_v1', 'sv', 'field.planned_departure.label', 'Planerad avresa'),

    ('tenant_details_v1', 'sv', 'section.main_guest.title', 'Huvudgäst'),
    ('tenant_details_v1', 'sv', 'section.main_guest.description', 'Ange uppgifterna exakt som de står i ditt pass eller ID-kort.'),
    ('tenant_details_v1', 'sv', 'field.first_name.label', 'Förnamn'),
    ('tenant_details_v1', 'sv', 'field.last_name.label', 'Efternamn'),
    ('tenant_details_v1', 'sv', 'field.last_name.help', 'Alla efternamn som de står i ditt pass eller ID-kort.'),
    ('tenant_details_v1', 'sv', 'field.sex.label', 'Kön (enligt ditt pass eller ID-kort)'),
    ('tenant_details_v1', 'sv', 'option.sex.female', 'Kvinna'),
    ('tenant_details_v1', 'sv', 'option.sex.male', 'Man'),
    ('tenant_details_v1', 'sv', 'option.sex.other', 'Annat / X'),
    ('tenant_details_v1', 'sv', 'field.date_of_birth.label', 'Födelsedatum'),
    ('tenant_details_v1', 'sv', 'field.citizenship.label', 'Medborgarskap'),
    ('tenant_details_v1', 'sv', 'field.document_type.label', 'Dokumenttyp'),
    ('tenant_details_v1', 'sv', 'option.document_type.passport', 'Pass'),
    ('tenant_details_v1', 'sv', 'option.document_type.id_card', 'Nationellt ID-kort'),
    ('tenant_details_v1', 'sv', 'option.document_type.residence_permit', 'Uppehållstillstånd'),
    ('tenant_details_v1', 'sv', 'field.document_number.label', 'Pass- eller ID-nummer'),

    ('tenant_details_v1', 'sv', 'section.contact.title', 'Kontaktuppgifter'),
    ('tenant_details_v1', 'sv', 'section.contact.description', 'Vi använder uppgifterna endast för att kontakta dig om den här bokningen.'),
    ('tenant_details_v1', 'sv', 'field.phone.label', 'Telefonnummer'),
    ('tenant_details_v1', 'sv', 'field.phone.help', 'Med landsnummer, till exempel +46 70 123 45 67.'),
    ('tenant_details_v1', 'sv', 'field.contact_email.label', 'E-postadress'),
    ('tenant_details_v1', 'sv', 'field.contact_email.help', 'Vi har fyllt i e-postadressen från ditt Google-konto. Du kan ändra den om du föredrar en annan adress.'),

    ('tenant_details_v1', 'sv', 'section.address.title', 'Adressuppgifter (huvudgäst)'),
    ('tenant_details_v1', 'sv', 'section.address.description', 'Vänligen fyll i din nuvarande hemadress. Uppgifterna används för hyreskontraktet och för obligatorisk juridisk registrering.'),
    ('tenant_details_v1', 'sv', 'field.address_line1.label', 'Gatuadress'),
    ('tenant_details_v1', 'sv', 'field.address_line1.placeholder', 'Storgatan 12'),
    ('tenant_details_v1', 'sv', 'field.address_line2.label', 'Adressrad 2 (t.ex. lägenhetsnummer)'),
    ('tenant_details_v1', 'sv', 'field.city.label', 'Ort'),
    ('tenant_details_v1', 'sv', 'field.city.placeholder', 'Uppsala'),
    ('tenant_details_v1', 'sv', 'field.region.label', 'Region / län'),
    ('tenant_details_v1', 'sv', 'field.region.placeholder', 'Uppsala län'),
    ('tenant_details_v1', 'sv', 'field.postcode.label', 'Postnummer'),
    ('tenant_details_v1', 'sv', 'field.country.label', 'Land'),

    ('tenant_details_v1', 'sv', 'section.guests.title', 'Övriga gäster'),
    ('tenant_details_v1', 'sv', 'section.guests.description', 'Lägg till alla som bor med dig, även barn. Den spanska gästregistreringen kräver dessa uppgifter för varje gäst.'),
    ('tenant_details_v1', 'sv', 'field.other_guests.label', 'Övriga gäster'),
    ('tenant_details_v1', 'sv', 'field.other_guests.help', 'Lägg till en rad per gäst. Lämna tomt om du reser ensam.'),
    ('tenant_details_v1', 'sv', 'field.other_guests.item.first_name.label', 'Förnamn'),
    ('tenant_details_v1', 'sv', 'field.other_guests.item.last_name.label', 'Efternamn'),
    ('tenant_details_v1', 'sv', 'field.other_guests.item.sex.label', 'Kön'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.sex.female', 'Kvinna'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.sex.male', 'Man'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.sex.other', 'Annat / X'),
    ('tenant_details_v1', 'sv', 'field.other_guests.item.date_of_birth.label', 'Födelsedatum'),
    ('tenant_details_v1', 'sv', 'field.other_guests.item.citizenship.label', 'Medborgarskap'),
    ('tenant_details_v1', 'sv', 'field.other_guests.item.document_type.label', 'Dokumenttyp'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.document_type.passport', 'Pass'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.document_type.id_card', 'Nationellt ID-kort'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.document_type.residence_permit', 'Uppehållstillstånd'),
    ('tenant_details_v1', 'sv', 'field.other_guests.item.document_number.label', 'Pass- eller ID-nummer'),
    ('tenant_details_v1', 'sv', 'field.other_guests.item.relationship.label', 'Relation till huvudgästen'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.relationship.partner', 'Make, maka / partner'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.relationship.child', 'Barn'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.relationship.parent', 'Förälder'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.relationship.sibling', 'Syskon'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.relationship.other_relative', 'Annan släkting'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.relationship.friend', 'Vän'),
    ('tenant_details_v1', 'sv', 'option.other_guests.item.relationship.other', 'Annat'),

    ('tenant_details_v1', 'sv', 'section.purpose.title', 'Syftet med vistelsen'),
    ('tenant_details_v1', 'sv', 'field.stay_purpose.label', 'Främsta anledningen till att besöka Spanien'),
    ('tenant_details_v1', 'sv', 'field.stay_purpose.help',
        '**Huvudsyfte med din vistelse i Spanien**'
        || char(10) || 'Enligt Valencias lag 9/2024 måste vistelser som överstiger 10 dagar ha ett *icke-turistiskt* syfte. Vänligen välj det alternativ som bäst beskriver anledningen till din vistelse.'),
    ('tenant_details_v1', 'sv', 'option.stay_purpose.work_assignment', 'Arbete / distansarbete'),
    ('tenant_details_v1', 'sv', 'option.stay_purpose.pensioner_seasonal', 'Säsongsvis vistelse som pensionär'),
    ('tenant_details_v1', 'sv', 'option.stay_purpose.studies', 'Studier eller utbildning'),
    ('tenant_details_v1', 'sv', 'option.stay_purpose.medical_treatment', 'Medicinsk behandling / rehabilitering'),
    ('tenant_details_v1', 'sv', 'option.stay_purpose.family_visit', 'Familjebesök / släktbesök'),
    ('tenant_details_v1', 'sv', 'option.stay_purpose.relocation', 'Förberedelser inför bostadssökande eller flytt'),
    ('tenant_details_v1', 'sv', 'option.stay_purpose.house_renovation', 'Renovering av egen bostad'),
    ('tenant_details_v1', 'sv', 'option.stay_purpose.sports_event', 'Deltagande i idrotts- eller andra evenemang (personal eller deltagare)'),
    ('tenant_details_v1', 'sv', 'option.stay_purpose.other', 'Annan icke-turistisk anledning (ange vilken)'),

    ('tenant_details_v1', 'sv', 'section.employment.title', 'Sysselsättning och inkomst'),
    ('tenant_details_v1', 'sv', 'section.employment.description',
        'Uppgifterna nedan hjälper oss att verifiera sysselsättning och identitet vid distansarbete.'
        || char(10) || 'Vänligen ange endast offentligt tillgängliga länkar. Det går bra att lämna arbetsgivare och yrkesroll tomma om du föredrar det.'),
    ('tenant_details_v1', 'sv', 'field.employment_type.label', 'Sysselsättningsform'),
    ('tenant_details_v1', 'sv', 'option.employment_type.pensioner', 'Pensionär'),
    ('tenant_details_v1', 'sv', 'option.employment_type.employee', 'Anställd'),
    ('tenant_details_v1', 'sv', 'option.employment_type.self_employed', 'Egenföretagare / frilans'),
    ('tenant_details_v1', 'sv', 'option.employment_type.other', 'Annat (ange vilket)'),
    ('tenant_details_v1', 'sv', 'field.employer.label', 'Arbetsgivarens namn och webbplats'),
    ('tenant_details_v1', 'sv', 'field.job_title.label', 'Yrkesroll / befattning eller verksamhetsområde'),

    ('tenant_details_v1', 'sv', 'section.id_verification.title', 'ID-verifiering'),
    ('tenant_details_v1', 'sv', 'section.id_verification.description', 'Ett kort videosamtal (ca 10 minuter via WhatsApp eller Zoom) är en del av vår ID-verifiering. Det rekommenderas men krävs inte alltid. Vi kan be om ett samtal innan vi bekräftar bokningen och kan avböja bokningen om verifieringen inte kan genomföras.'),
    ('tenant_details_v1', 'sv', 'field.id_documents.label', 'Pass eller ID-kort för alla gäster'),
    ('tenant_details_v1', 'sv', 'field.id_documents.help',
        'För att vi ska kunna säkerställa en smidig incheckning ber vi dig ladda upp ett foto eller en skanning av **alla gästers** pass eller EU-ID-kort. För ID-kort, ladda upp båda sidorna. Filerna behandlas konfidentiellt och tas bort efter vistelsen.'
        || char(10) || 'PDF eller bild, högst {maxFiles} filer, max {maxFileSizeMb} MB per fil.'),
    ('tenant_details_v1', 'sv', 'field.video_call_willing.label', 'Vill du göra ett kort videosamtal (ca 10 minuter via WhatsApp eller Zoom) för ID-verifiering?'),
    ('tenant_details_v1', 'sv', 'option.video_call_willing.yes', 'Ja'),
    ('tenant_details_v1', 'sv', 'option.video_call_willing.no', 'Nej'),
    ('tenant_details_v1', 'sv', 'field.video_call_time.label', 'Vilken tid passar dig bäst för samtalet?'),

    ('tenant_details_v1', 'sv', 'section.special_requests.title', 'Särskilda behov och anteckningar'),
    ('tenant_details_v1', 'sv', 'field.special_requests.label', 'Särskilda behov eller önskemål'),
    ('tenant_details_v1', 'sv', 'field.special_requests.help', 'Vi vill gärna att din vistelse blir så bekväm och trevlig som möjligt. Har du några särskilda behov eller önskemål som vi bör känna till? Annan information du vill dela?'),

    ('tenant_details_v1', 'sv', 'section.consent.title', 'Integritet'),
    ('tenant_details_v1', 'sv', 'field.privacy_consent.label', 'Jag har läst [integritetsmeddelandet](https://costaseasons.com/sv/legal-notice) och godkänner att mina uppgifter behandlas för den här bokningen och för den lagstadgade gästregistreringen.');
