PRAGMA foreign_keys = ON;

-- =========================================================
-- OPTIONAL CLEANUP FOR RE-RUNS
-- =========================================================

DELETE FROM admin_audit_logs;
DELETE FROM generation_runs;
DELETE FROM blog_post_images;
DELETE FROM blog_posts;
DELETE FROM blog_topics;
DELETE FROM leads;
DELETE FROM offer_availability;
DELETE FROM offers;
DELETE FROM admin_users;

-- =========================================================
-- ADMIN USERS
-- =========================================================

INSERT INTO admin_users (
    id,
    email,
    full_name,
    auth_provider,
    auth_subject,
    role,
    is_active,
    last_login_at
) VALUES (
             'admin_001',
             'owner@example.com',
             'Portal Owner',
             'google',
             'google-owner-001',
             'owner',
             1,
             CURRENT_TIMESTAMP
         );

-- =========================================================
-- OFFERS
-- =========================================================

INSERT INTO offers (
    id,
    slug,
    title,
    location_name,
    summary,
    status,
    cover_image_url
) VALUES (
             'offer_001',
             'orihuela-costa-playa-flamenca-2br-workspace',
             '2-bedroom seasonal stay in Playa Flamenca',
             'Orihuela Costa',
             'Bright and practical apartment for a seasonal stay, suitable for remote work and longer temporary stays.',
             'active',
             'https://example.com/images/offers/playa-flamenca-2br-workspace.jpg'
         );

-- =========================================================
-- OFFER AVAILABILITY
-- =========================================================

INSERT INTO offer_availability (
    id,
    offer_id,
    date_from,
    date_to,
    status,
    note
) VALUES
      (
          'avail_001',
          'offer_001',
          '2026-09-01',
          '2026-10-31',
          'available',
          'Example available autumn period'
      ),
      (
          'avail_002',
          'offer_001',
          '2026-11-01',
          '2026-11-15',
          'tentative',
          'Tentative hold for manual review'
      ),
      (
          'avail_003',
          'offer_001',
          '2026-12-20',
          '2027-01-10',
          'blocked',
          'Blocked holiday period'
      );

-- =========================================================
-- BLOG TOPICS
-- =========================================================

INSERT INTO blog_topics (
    id,
    slug,
    name,
    language,
    is_active,
    priority,
    brief,
    target_audience,
    tone,
    required_points_json,
    forbidden_points_json
) VALUES
      (
          'topic_001',
          'orihuela-costa-seasonal-stays',
          'Orihuela Costa for seasonal stays',
          'en',
          1,
          10,
          'Explain why Orihuela Costa may suit temporary and seasonal stays without sounding like a tourist-booking ad.',
          'International adults looking for temporary stays on the Costa Blanca',
          'practical, calm, trustworthy',
          '["practical everyday life","services","temporary stay context"]',
          '["instant booking promises","tourist party framing"]'
      ),
      (
          'topic_002',
          'seasonal-rental-inquiry-checklist',
          'Checklist before sending a seasonal rental inquiry',
          'en',
          1,
          20,
          'Create a short practical checklist for people planning to send an inquiry for a temporary stay.',
          'People considering a seasonal rental inquiry',
          'clear, neutral, helpful',
          '["dates","stay purpose","guest details","expectations"]',
          '["legal overclaiming","hard-sell language"]'
      );

-- =========================================================
-- BLOG POSTS
-- =========================================================

INSERT INTO blog_posts (
    id,
    topic_id,
    slug,
    title,
    excerpt,
    seo_title,
    seo_description,
    content_md,
    status,
    created_by_type,
    author_name,
    cover_image_url,
    published_commit_sha,
    published_at
) VALUES
      (
          'post_001',
          'topic_001',
          'why-orihuela-costa-works-for-seasonal-stays',
          'Why Orihuela Costa works well for seasonal stays',
          'A practical overview of why Orihuela Costa can work well for longer temporary stays.',
          'Why Orihuela Costa works well for seasonal stays',
          'Explore why Orihuela Costa may be a practical choice for seasonal and temporary stays.',
          '# Why Orihuela Costa works well for seasonal stays

        Orihuela Costa can be a practical option for people looking for a temporary base on the Costa Blanca.

        ## Everyday convenience

        The area offers access to supermarkets, services, cafés, coastal walking areas and road connections that can make longer stays easier to manage.

        ## Better fit for some temporary stays

        For some guests, the appeal is not only the coastline but also the ability to settle into a more regular day-to-day rhythm for several weeks or months.

        ## Practical planning still matters

        A suitable stay depends on timing, purpose of stay, expected duration and whether the property matches the guest''s real day-to-day needs.',
          'draft',
          'human',
          'Portal Owner',
          'https://example.com/images/blog/orihuela-costa-seasonal-stays.jpg',
          NULL,
          NULL
      ),
      (
          'post_002',
          'topic_002',
          'what-to-check-before-sending-a-seasonal-rental-inquiry',
          'What to check before sending a seasonal rental inquiry',
          'A short checklist to review before sending an inquiry for a temporary stay.',
          'What to check before sending a seasonal rental inquiry',
          'Review a simple checklist before sending a seasonal rental inquiry.',
          '# What to check before sending a seasonal rental inquiry

        Before sending an inquiry, it helps to prepare a few practical details.

        ## Confirm your dates

        Be clear about your preferred arrival and departure dates and whether those dates are fixed or flexible.

        ## Explain the stay briefly

        A short explanation of the purpose of stay helps the host understand whether the property is likely to be suitable.

        ## Mention key expectations

        If you need workspace, parking, specific sleeping arrangements or a certain stay length, it is better to mention that early.',
          'draft',
          'human',
          'Portal Owner',
          'https://example.com/images/blog/seasonal-rental-inquiry-checklist.jpg',
          NULL,
          NULL
      );

-- =========================================================
-- BLOG POST IMAGES
-- =========================================================

INSERT INTO blog_post_images (
    id,
    post_id,
    image_url,
    storage_key,
    alt_text,
    source_type,
    is_selected
) VALUES
      (
          'img_001',
          'post_001',
          'https://example.com/images/blog/orihuela-costa-seasonal-stays.jpg',
          'blog/orihuela-costa-seasonal-stays.jpg',
          'View related to seasonal stays in Orihuela Costa',
          'external',
          1
      ),
      (
          'img_002',
          'post_002',
          'https://example.com/images/blog/seasonal-rental-inquiry-checklist.jpg',
          'blog/seasonal-rental-inquiry-checklist.jpg',
          'Checklist style image for seasonal rental inquiry article',
          'external',
          1
      );

-- =========================================================
-- GENERATION RUNS
-- =========================================================

INSERT INTO generation_runs (
    id,
    topic_id,
    post_id,
    run_type,
    model_name,
    prompt_version,
    status,
    error_message,
    result_summary,
    raw_result_json
) VALUES
      (
          'run_001',
          'topic_001',
          'post_001',
          'post',
          'gpt-5.4',
          'v1',
          'success',
          NULL,
          'Generated draft article for Orihuela Costa seasonal stays topic.',
          '{"example":true,"kind":"post"}'
      ),
      (
          'run_002',
          'topic_002',
          'post_002',
          'post',
          'gpt-5.4',
          'v1',
          'success',
          NULL,
          'Generated inquiry checklist article draft.',
          '{"example":true,"kind":"post"}'
      );

-- =========================================================
-- LEADS
-- =========================================================

INSERT INTO leads (
    id,
    offer_id,
    status,
    name,
    email,
    phone,
    message,
    requested_date_from,
    requested_date_to,
    auth_provider,
    auth_subject,
    source,
    admin_notes
) VALUES (
             'lead_001',
             'offer_001',
             'new',
             'John Smith',
             'john.smith@example.com',
             '+44 7700 900123',
             'Interested in a 6-week seasonal stay. I would need stable internet and a quiet place for remote work.',
             '2026-10-05',
             '2026-11-16',
             'google',
             'google-user-123',
             'portal_form',
             'Example seed lead for local testing'
         );

-- =========================================================
-- ADMIN AUDIT LOGS
-- =========================================================

INSERT INTO admin_audit_logs (
    id,
    admin_user_id,
    action_type,
    entity_type,
    entity_id,
    description,
    metadata_json
) VALUES
      (
          'audit_001',
          'admin_001',
          'create',
          'offer',
          'offer_001',
          'Created initial example offer',
          '{"source":"seed.sql"}'
      ),
      (
          'audit_002',
          'admin_001',
          'create',
          'blog_post',
          'post_001',
          'Inserted example blog post',
          '{"source":"seed.sql"}'
      ),
      (
          'audit_003',
          'admin_001',
          'create',
          'lead',
          'lead_001',
          'Inserted example lead',
          '{"source":"seed.sql"}'
      );
