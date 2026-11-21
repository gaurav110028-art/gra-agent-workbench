CREATE TABLE gra.workspaces (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO gra.workspaces (id) VALUES ('gra');

CREATE TABLE gra.legacy_import_records (
  workspace_id text NOT NULL REFERENCES gra.workspaces(id),
  kind text NOT NULL CHECK (kind IN ('agents', 'workflows', 'versions')),
  legacy_id text NOT NULL CHECK (legacy_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  parent_kind text GENERATED ALWAYS AS (CASE WHEN kind <> 'agents' THEN 'agents'::text END) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, kind, legacy_id),
  UNIQUE (workspace_id, kind, legacy_id, fingerprint),
  FOREIGN KEY (workspace_id, parent_kind, legacy_id) REFERENCES gra.legacy_import_records(workspace_id, kind, legacy_id)
);

CREATE TABLE gra.legacy_import_batches (
  workspace_id text NOT NULL REFERENCES gra.workspaces(id),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  actor_id text NOT NULL CHECK (actor_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  format_version integer NOT NULL CHECK (format_version = 1),
  inserted_count integer NOT NULL CHECK (inserted_count >= 0),
  existing_count integer NOT NULL CHECK (existing_count >= 0),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, fingerprint),
  CHECK (inserted_count + existing_count BETWEEN 1 AND 250)
);

CREATE TABLE gra.legacy_import_entries (
  workspace_id text NOT NULL,
  batch_fingerprint text NOT NULL,
  kind text NOT NULL,
  legacy_id text NOT NULL,
  record_fingerprint text NOT NULL,
  inserted boolean NOT NULL,
  PRIMARY KEY (workspace_id, batch_fingerprint, kind, legacy_id),
  FOREIGN KEY (workspace_id, batch_fingerprint) REFERENCES gra.legacy_import_batches(workspace_id, fingerprint),
  FOREIGN KEY (workspace_id, kind, legacy_id, record_fingerprint)
    REFERENCES gra.legacy_import_records(workspace_id, kind, legacy_id, fingerprint)
);
CREATE UNIQUE INDEX legacy_record_first_import
  ON gra.legacy_import_entries (workspace_id, kind, legacy_id) WHERE inserted;

CREATE TABLE gra.admin_audit_events (
  workspace_id text NOT NULL REFERENCES gra.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id text NOT NULL CHECK (actor_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  batch_fingerprint text,
  inserted_count integer CHECK (inserted_count >= 0),
  existing_count integer CHECK (existing_count >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, event_type, batch_fingerprint),
  FOREIGN KEY (workspace_id, batch_fingerprint) REFERENCES gra.legacy_import_batches(workspace_id, fingerprint),
  CHECK (event_type <> 'legacy_import' OR (batch_fingerprint IS NOT NULL AND inserted_count IS NOT NULL AND existing_count IS NOT NULL))
);

-- Operational data is intentionally separate from inert legacy archives.
CREATE TABLE gra.agents (
  workspace_id text NOT NULL REFERENCES gra.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id, id)
);
CREATE TABLE gra.workflows (
  workspace_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, agent_id) REFERENCES gra.agents(workspace_id, id)
);
CREATE TABLE gra.workflow_versions (
  workspace_id text NOT NULL,
  workflow_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  graph jsonb NOT NULL CHECK (jsonb_typeof(graph) = 'object'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  PRIMARY KEY (workspace_id, workflow_id, version),
  FOREIGN KEY (workspace_id, workflow_id) REFERENCES gra.workflows(workspace_id, id)
);

CREATE TABLE gra.contacts (
  workspace_id text NOT NULL REFERENCES gra.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^[+][1-9][0-9]{1,14}$'),
  country_calling_code text NOT NULL CHECK (country_calling_code ~ '^[1-9][0-9]{0,2}$'),
  consent_status text NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown', 'opted_in', 'opted_out')),
  consent_recorded_at timestamptz,
  consent_source text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, phone_e164),
  CHECK (phone_e164 LIKE '+' || country_calling_code || '%' AND length(phone_e164) > length(country_calling_code) + 1),
  CHECK (consent_status = 'unknown' OR (consent_recorded_at IS NOT NULL AND consent_source IS NOT NULL))
);
CREATE TABLE gra.whatsapp_templates (
  workspace_id text NOT NULL REFERENCES gra.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider_name text NOT NULL CHECK (length(btrim(provider_name)) BETWEEN 1 AND 200),
  language text NOT NULL CHECK (length(btrim(language)) BETWEEN 2 AND 32),
  version integer NOT NULL CHECK (version > 0),
  variables jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(variables) = 'array'),
  media_requirements jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(media_requirements) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'disabled')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, provider_name, language, version)
);
CREATE TABLE gra.whatsapp_campaigns (
  workspace_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'paused', 'running', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, template_id),
  FOREIGN KEY (workspace_id, template_id) REFERENCES gra.whatsapp_templates(workspace_id, id),
  CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL)
);
CREATE TABLE gra.whatsapp_campaign_recipients (
  workspace_id text NOT NULL,
  campaign_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, campaign_id, contact_id),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES gra.whatsapp_campaigns(workspace_id, id),
  FOREIGN KEY (workspace_id, contact_id) REFERENCES gra.contacts(workspace_id, id)
);
CREATE TABLE gra.whatsapp_reminders (
  workspace_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  template_id uuid NOT NULL,
  interval_seconds integer NOT NULL CHECK (interval_seconds > 0),
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('paused', 'enabled', 'retired')),
  last_attempt_at timestamptz,
  next_eligible_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, id, contact_id, template_id),
  FOREIGN KEY (workspace_id, contact_id) REFERENCES gra.contacts(workspace_id, id),
  FOREIGN KEY (workspace_id, template_id) REFERENCES gra.whatsapp_templates(workspace_id, id),
  CHECK (status <> 'enabled' OR next_eligible_at IS NOT NULL)
);
CREATE TABLE gra.whatsapp_message_attempts (
  workspace_id text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  template_id uuid NOT NULL,
  campaign_id uuid,
  reminder_id uuid,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('pending', 'submitted', 'failed', 'unknown')),
  submitted_at timestamptz,
  completed_at timestamptz,
  provider_message_id text,
  provider_status integer CHECK (provider_status BETWEEN 100 AND 599),
  error_code text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  UNIQUE (workspace_id, provider_message_id),
  FOREIGN KEY (workspace_id, contact_id) REFERENCES gra.contacts(workspace_id, id),
  FOREIGN KEY (workspace_id, template_id) REFERENCES gra.whatsapp_templates(workspace_id, id),
  FOREIGN KEY (workspace_id, campaign_id, contact_id)
    REFERENCES gra.whatsapp_campaign_recipients(workspace_id, campaign_id, contact_id),
  FOREIGN KEY (workspace_id, campaign_id, template_id)
    REFERENCES gra.whatsapp_campaigns(workspace_id, id, template_id),
  FOREIGN KEY (workspace_id, reminder_id, contact_id, template_id)
    REFERENCES gra.whatsapp_reminders(workspace_id, id, contact_id, template_id),
  CHECK (campaign_id IS NULL OR reminder_id IS NULL),
  CHECK (status <> 'submitted' OR submitted_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= COALESCE(submitted_at, created_at))
);
