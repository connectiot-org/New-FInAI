CREATE TABLE "AssistantConversation" (
 id UUID PRIMARY KEY, organisation_id UUID NOT NULL, user_id UUID NOT NULL, entity_id UUID NOT NULL,
 month CHAR(7) NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(month,4)<>'0000'),currency CHAR(3) NOT NULL CHECK(currency~'^[A-Z]{3}$'),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),create_digest CHAR(64) NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY(organisation_id,user_id) REFERENCES "Membership"(organisation_id,user_id) ON DELETE NO ACTION,
 FOREIGN KEY(organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id) ON DELETE NO ACTION
);
CREATE INDEX "AssistantConversation_organisation_id_user_id_entity_id_created_at_idx" ON "AssistantConversation"(organisation_id,user_id,entity_id,created_at);
CREATE TABLE "AssistantTurn" (
 id UUID PRIMARY KEY,conversation_id UUID NOT NULL REFERENCES "AssistantConversation"(id) ON DELETE CASCADE,question VARCHAR(2000) NOT NULL,digest CHAR(64) NOT NULL,status VARCHAR(16) NOT NULL CHECK(status IN ('pending','completed','failed','cancelled')),lease UUID NOT NULL,lease_until TIMESTAMPTZ(3) NOT NULL,session_hash CHAR(64),answer JSONB,plan JSONB,failure_code VARCHAR(64),model VARCHAR(200) NOT NULL,policy VARCHAR(64) NOT NULL,created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at TIMESTAMPTZ(3)
);
CREATE INDEX "AssistantTurn_conversation_id_created_at_id_idx" ON "AssistantTurn"(conversation_id,created_at,id);
CREATE INDEX "AssistantTurn_status_lease_until_idx" ON "AssistantTurn"(status,lease_until);
CREATE UNIQUE INDEX assistant_one_pending ON "AssistantTurn"(conversation_id) WHERE status='pending';
CREATE TABLE "AssistantPreference" (
 id UUID PRIMARY KEY,organisation_id UUID NOT NULL,user_id UUID NOT NULL,entity_id UUID NOT NULL,detail VARCHAR(16) NOT NULL CHECK(detail IN ('concise','detailed')),note VARCHAR(500) NOT NULL,version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TIMESTAMPTZ(3) NOT NULL,
 FOREIGN KEY(organisation_id,user_id) REFERENCES "Membership"(organisation_id,user_id) ON DELETE NO ACTION,
 FOREIGN KEY(organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id) ON DELETE NO ACTION,
 UNIQUE(organisation_id,user_id,entity_id)
);
CREATE TABLE "AssistantBudget" (organisation_id UUID NOT NULL REFERENCES "Organisation"(id),day DATE NOT NULL,tokens INTEGER NOT NULL CHECK(tokens>=0),PRIMARY KEY(organisation_id,day));
CREATE TABLE "LedgerSnapshot" (
 id UUID PRIMARY KEY,organisation_id UUID NOT NULL,entity_id UUID NOT NULL,version INTEGER NOT NULL CHECK(version>0),digest CHAR(64) NOT NULL,actor_id UUID NOT NULL REFERENCES "User"(id),source_name VARCHAR(200) NOT NULL,captured_at TIMESTAMPTZ(3) NOT NULL,imported_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,content JSONB NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=6291456),
 FOREIGN KEY(organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id),UNIQUE(organisation_id,entity_id,version),UNIQUE(organisation_id,entity_id,digest)
);
