ALTER TABLE "Membership" ADD COLUMN is_administrator BOOLEAN NOT NULL DEFAULT false, ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE "EntityAccess" ADD COLUMN can_import BOOLEAN NOT NULL DEFAULT false, ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
-- Preserve the existing trusted CLI's explicit can_write import authority during upgrade.
UPDATE "EntityAccess" SET can_import=can_write;
CREATE TABLE "ServerAudit" (
 id UUID PRIMARY KEY, organisation_id UUID NOT NULL REFERENCES "Organisation"(id), actor_id UUID NOT NULL REFERENCES "User"(id), entity_id UUID,
 request_id UUID NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, action VARCHAR(64) NOT NULL, reference VARCHAR(100) NOT NULL, outcome VARCHAR(20) NOT NULL CHECK(outcome='success'), metadata JSONB NOT NULL CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=2048),
 FOREIGN KEY(organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX audit_organisation_time ON "ServerAudit"(organisation_id,created_at,id);
CREATE TABLE "ReceivableImportStage" (
 id UUID PRIMARY KEY, organisation_id UUID NOT NULL REFERENCES "Organisation"(id), entity_id UUID NOT NULL, actor_id UUID NOT NULL REFERENCES "User"(id), session_hash CHAR(64) NOT NULL,
 expected_version INTEGER NOT NULL CHECK(expected_version>=0), next_version INTEGER NOT NULL CHECK(next_version>0), digest CHAR(64) NOT NULL CHECK(digest~'^[a-f0-9]{64}$'), content BYTEA NOT NULL CHECK(octet_length(content)<=1049600),
 row_count INTEGER NOT NULL CHECK(row_count BETWEEN 0 AND 10000), invoice_count INTEGER NOT NULL CHECK(invoice_count BETWEEN 0 AND row_count), customer_count INTEGER NOT NULL CHECK(customer_count BETWEEN 0 AND invoice_count), total_cents BIGINT NOT NULL CHECK(total_cents BETWEEN 0 AND 9007199254740991),
 source_name VARCHAR(200) NOT NULL, source_captured_at TIMESTAMPTZ(3) NOT NULL, expires_at TIMESTAMPTZ(3) NOT NULL, applied_version INTEGER CHECK(applied_version>0),
 FOREIGN KEY(organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX import_stage_actor_expiry ON "ReceivableImportStage"(organisation_id,actor_id,expires_at);
