CREATE TABLE "Organisation" ("id" UUID PRIMARY KEY, "name" VARCHAR(200) NOT NULL);
CREATE TABLE "User" ("id" UUID PRIMARY KEY);
CREATE TABLE "Membership" (
  "organisation_id" UUID NOT NULL REFERENCES "Organisation"("id"),
  "user_id" UUID NOT NULL REFERENCES "User"("id"),
  "active" BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY ("organisation_id", "user_id")
);
CREATE TABLE "Entity" (
  "id" UUID PRIMARY KEY,
  "organisation_id" UUID NOT NULL REFERENCES "Organisation"("id"),
  "name" VARCHAR(200) NOT NULL,
  UNIQUE ("organisation_id", "id")
);
CREATE TABLE "EntityAccess" (
  "organisation_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "entity_id" UUID NOT NULL,
  "can_write" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("organisation_id", "user_id", "entity_id"),
  FOREIGN KEY ("organisation_id", "user_id") REFERENCES "Membership"("organisation_id", "user_id"),
  FOREIGN KEY ("organisation_id", "entity_id") REFERENCES "Entity"("organisation_id", "id")
);
CREATE TABLE "ChecklistTask" (
  "id" UUID PRIMARY KEY,
  "organisation_id" UUID NOT NULL,
  "entity_id" UUID NOT NULL,
  "month" DATE NOT NULL CHECK (EXTRACT(DAY FROM "month") = 1),
  "title" VARCHAR(200) NOT NULL CHECK (char_length("title") BETWEEN 1 AND 200 AND "title" = btrim("title")),
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "create_digest" CHAR(64) NOT NULL,
  FOREIGN KEY ("organisation_id", "entity_id") REFERENCES "Entity"("organisation_id", "id")
);
CREATE INDEX "ChecklistTask_organisation_id_entity_id_month_created_at_id_idx"
ON "ChecklistTask" ("organisation_id", "entity_id", "month", "created_at", "id");
