CREATE TABLE "SubscriptionRenewal" (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  "supplierName" varchar(200) NOT NULL CHECK (char_length("supplierName") BETWEEN 1 AND 200 AND "supplierName"=btrim("supplierName")),
  "subscriptionName" varchar(200) NOT NULL CHECK (char_length("subscriptionName") BETWEEN 1 AND 200 AND "subscriptionName"=btrim("subscriptionName")),
  "renewalDate" date NOT NULL CHECK ("renewalDate" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  "cancellationDeadline" date CHECK ("cancellationDeadline" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' AND "cancellationDeadline" <= "renewalDate"),
  notes varchar(2000),
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionRenewal_organisation_id_entity_id_fkey" FOREIGN KEY (organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id)
);
CREATE INDEX "SubscriptionRenewal_organisation_id_entity_id_archived_renewal_idx" ON "SubscriptionRenewal" (organisation_id,entity_id,archived,"renewalDate",id);
