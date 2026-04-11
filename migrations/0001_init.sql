PRAGMA foreign_keys = ON;

-- =========================================================
-- OFFERS
-- Seasonal rent offerite põhiandmed
-- =========================================================

CREATE TABLE IF NOT EXISTS offers (
                                      id TEXT PRIMARY KEY,
                                      slug TEXT NOT NULL UNIQUE,
                                      title TEXT NOT NULL,
                                      location_name TEXT,
                                      summary TEXT,
                                      status TEXT NOT NULL DEFAULT 'draft', -- draft / active / inactive / archived
                                      cover_image_url TEXT,
                                      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_offers_status
    ON offers(status);

CREATE INDEX IF NOT EXISTS idx_offers_slug
    ON offers(slug);


-- =========================================================
-- OFFER AVAILABILITY
-- Offeri saadavuse perioodid
-- =========================================================

CREATE TABLE IF NOT EXISTS offer_availability (
                                                  id TEXT PRIMARY KEY,
                                                  offer_id TEXT NOT NULL,
                                                  date_from TEXT NOT NULL, -- YYYY-MM-DD
                                                  date_to TEXT NOT NULL,   -- YYYY-MM-DD
                                                  status TEXT NOT NULL,    -- available / blocked / tentative
                                                  note TEXT,
                                                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_offer_availability_offer_id
    ON offer_availability(offer_id);

CREATE INDEX IF NOT EXISTS idx_offer_availability_dates
    ON offer_availability(date_from, date_to);


-- =========================================================
-- LEADS
-- Inquiry formi kaudu saabunud huvilised
-- =========================================================

CREATE TABLE IF NOT EXISTS leads (
                                     id TEXT PRIMARY KEY,
                                     offer_id TEXT,
                                     status TEXT NOT NULL DEFAULT 'new', -- new / contacted / closed / spam / archived

                                     name TEXT NOT NULL,
                                     email TEXT NOT NULL,
                                     phone TEXT,
                                     message TEXT,

                                     requested_date_from TEXT,
                                     requested_date_to TEXT,

                                     auth_provider TEXT,  -- google
                                     auth_subject TEXT,   -- Google user unique id / sub
                                     source TEXT,         -- portal_form / admin_manual / import

                                     admin_notes TEXT,

                                     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                     updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                     FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL
    );

CREATE INDEX IF NOT EXISTS idx_leads_offer_id
    ON leads(offer_id);

CREATE INDEX IF NOT EXISTS idx_leads_status
    ON leads(status);

CREATE INDEX IF NOT EXISTS idx_leads_created_at
    ON leads(created_at);

CREATE INDEX IF NOT EXISTS idx_leads_email
    ON leads(email);


-- =========================================================
-- ADMIN USERS
-- Admin-liidese kasutajad, kellel on Google auth kaudu ligipääs
-- =========================================================

CREATE TABLE IF NOT EXISTS admin_users (
                                           id TEXT PRIMARY KEY,
                                           email TEXT NOT NULL UNIQUE,
                                           full_name TEXT,
                                           auth_provider TEXT NOT NULL DEFAULT 'google',
                                           auth_subject TEXT UNIQUE, -- Google sub, kui salvestad selle
                                           role TEXT NOT NULL DEFAULT 'editor', -- owner / admin / editor / viewer
                                           is_active INTEGER NOT NULL DEFAULT 1,
                                           last_login_at TEXT,
                                           created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                           updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_users_role
    ON admin_users(role);

CREATE INDEX IF NOT EXISTS idx_admin_users_is_active
    ON admin_users(is_active);


-- =========================================================
-- ADMIN AUDIT LOGS
-- Minimaalne audit / activity log admin tegevuste jaoks
-- =========================================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
                                                id TEXT PRIMARY KEY,
                                                admin_user_id TEXT,
                                                action_type TEXT NOT NULL,     -- create / update / delete / publish / login / generate
                                                entity_type TEXT NOT NULL,     -- offer / lead / blog_post / topic / image / admin_user
                                                entity_id TEXT,
                                                description TEXT,
                                                metadata_json TEXT,
                                                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
    );

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user_id
    ON admin_audit_logs(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity
    ON admin_audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
    ON admin_audit_logs(created_at);


-- =========================================================
-- BLOG TOPICS
-- AI-le hallatav teemade ja sisendreeglite kiht
-- =========================================================

CREATE TABLE IF NOT EXISTS blog_topics (
                                           id TEXT PRIMARY KEY,
                                           slug TEXT NOT NULL UNIQUE,
                                           name TEXT NOT NULL,
                                           language TEXT NOT NULL DEFAULT 'en',
                                           is_active INTEGER NOT NULL DEFAULT 1,
                                           priority INTEGER NOT NULL DEFAULT 100,

                                           brief TEXT,
                                           target_audience TEXT,
                                           tone TEXT,

                                           required_points_json TEXT,
                                           forbidden_points_json TEXT,

                                           created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                           updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blog_topics_active_priority
    ON blog_topics(is_active, priority);

CREATE INDEX IF NOT EXISTS idx_blog_topics_slug
    ON blog_topics(slug);


-- =========================================================
-- BLOG POSTS
-- Blogi postitused, nii AI draftid kui ka inimese loodud artiklid
-- =========================================================

CREATE TABLE IF NOT EXISTS blog_posts (
                                          id TEXT PRIMARY KEY,
                                          topic_id TEXT,

                                          slug TEXT UNIQUE,
                                          title TEXT NOT NULL,
                                          excerpt TEXT,

                                          seo_title TEXT,
                                          seo_description TEXT,

                                          content_md TEXT NOT NULL,
                                          status TEXT NOT NULL DEFAULT 'draft',
    -- draft / review / approved / rejected / published / archived

                                          created_by_type TEXT NOT NULL DEFAULT 'ai', -- ai / human
                                          author_name TEXT,

                                          cover_image_url TEXT,
                                          published_commit_sha TEXT,
                                          published_at TEXT,

                                          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                          FOREIGN KEY (topic_id) REFERENCES blog_topics(id) ON DELETE SET NULL
    );

CREATE INDEX IF NOT EXISTS idx_blog_posts_status
    ON blog_posts(status);

CREATE INDEX IF NOT EXISTS idx_blog_posts_topic_id
    ON blog_posts(topic_id);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug
    ON blog_posts(slug);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at
    ON blog_posts(published_at);


-- =========================================================
-- BLOG POST IMAGES
-- Postituse juurde seotud pildid
-- =========================================================

CREATE TABLE IF NOT EXISTS blog_post_images (
                                                id TEXT PRIMARY KEY,
                                                post_id TEXT NOT NULL,

                                                image_url TEXT NOT NULL,
                                                storage_key TEXT,
                                                alt_text TEXT,
                                                source_type TEXT NOT NULL, -- ai / upload / external

                                                is_selected INTEGER NOT NULL DEFAULT 0,

                                                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                                FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_blog_post_images_post_id
    ON blog_post_images(post_id);

CREATE INDEX IF NOT EXISTS idx_blog_post_images_selected
    ON blog_post_images(post_id, is_selected);


-- =========================================================
-- GENERATION RUNS
-- AI genereerimise logi postituste ja piltide jaoks
-- =========================================================

CREATE TABLE IF NOT EXISTS generation_runs (
                                               id TEXT PRIMARY KEY,
                                               topic_id TEXT,
                                               post_id TEXT,

                                               run_type TEXT NOT NULL,     -- post / image
                                               model_name TEXT,
                                               prompt_version TEXT,
                                               status TEXT NOT NULL,       -- started / success / failed

                                               error_message TEXT,
                                               result_summary TEXT,
                                               raw_result_json TEXT,

                                               created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                               updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                               FOREIGN KEY (topic_id) REFERENCES blog_topics(id) ON DELETE SET NULL,
    FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE SET NULL
    );

CREATE INDEX IF NOT EXISTS idx_generation_runs_post_id
    ON generation_runs(post_id);

CREATE INDEX IF NOT EXISTS idx_generation_runs_topic_id
    ON generation_runs(topic_id);

CREATE INDEX IF NOT EXISTS idx_generation_runs_status
    ON generation_runs(status);

CREATE INDEX IF NOT EXISTS idx_generation_runs_created_at
    ON generation_runs(created_at);
