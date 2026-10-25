-- Bounded UUID-only receipts prevent a delayed create retry from undoing deletion.
CREATE TABLE "AssistantDeletion" (
 id UUID NOT NULL,kind VARCHAR(16) NOT NULL CHECK(kind IN ('conversation','preference')),organisation_id UUID NOT NULL REFERENCES "Organisation"(id),user_id UUID NOT NULL REFERENCES "User"(id),created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TIMESTAMPTZ(3) NOT NULL,PRIMARY KEY(id,kind)
);
CREATE INDEX "AssistantDeletion_expires_at_idx" ON "AssistantDeletion"(expires_at);
