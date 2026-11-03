CREATE TABLE "ApGrant" (
 organisation_id uuid NOT NULL, entity_id uuid NOT NULL, user_id uuid NOT NULL,
 view boolean NOT NULL DEFAULT false, review boolean NOT NULL DEFAULT false, verify boolean NOT NULL DEFAULT false, approve boolean NOT NULL DEFAULT false, manage boolean NOT NULL DEFAULT false,
 PRIMARY KEY(organisation_id,user_id,entity_id),
 FOREIGN KEY(organisation_id,user_id,entity_id) REFERENCES "EntityAccess"(organisation_id,user_id,entity_id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE TABLE "ApSupplier" (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, entity_id uuid NOT NULL,
 name varchar(200) NOT NULL, tax_id varchar(200) NOT NULL, active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, create_digest text NOT NULL,
 UNIQUE(organisation_id,entity_id,id), FOREIGN KEY(organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id)
);
CREATE TABLE "ApPolicy" (
 organisation_id uuid NOT NULL, entity_id uuid NOT NULL, version integer NOT NULL DEFAULT 1,
 draft jsonb NOT NULL, published jsonb, published_version integer, published_by uuid, published_at timestamptz,
 PRIMARY KEY(organisation_id,entity_id), FOREIGN KEY(organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id)
);
CREATE TABLE "ApInvoice" (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, entity_id uuid NOT NULL, supplier_id uuid NOT NULL,
 reference_key text NOT NULL, data jsonb NOT NULL, create_digest text NOT NULL, version integer NOT NULL DEFAULT 1, revision integer NOT NULL DEFAULT 1,
 correction_reason text, state text NOT NULL DEFAULT 'review' CHECK(state IN ('review','verify','approve','approved','rejected')), route jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,entity_id,id), UNIQUE(organisation_id,entity_id,supplier_id,reference_key),
 FOREIGN KEY(organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id),
 FOREIGN KEY(organisation_id,entity_id,supplier_id) REFERENCES "ApSupplier"(organisation_id,entity_id,id)
);
CREATE INDEX "ApInvoice_page" ON "ApInvoice"(organisation_id,entity_id,created_at DESC,id DESC);
CREATE TABLE "ApDocument" (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, entity_id uuid NOT NULL, invoice_id uuid NOT NULL, revision integer NOT NULL,
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 10 AND 1048576), digest text NOT NULL, filename varchar(200) NOT NULL,
 scan_state text NOT NULL DEFAULT 'quarantined' CHECK(scan_state IN ('quarantined','synthetic','clean','infected')), scan_result jsonb, uploader_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organisation_id,entity_id,invoice_id) REFERENCES "ApInvoice"(organisation_id,entity_id,id)
);
CREATE TABLE "ApEvent" (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, entity_id uuid NOT NULL, invoice_id uuid NOT NULL, actor_id uuid NOT NULL,
 revision integer NOT NULL, action text NOT NULL, reason text, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organisation_id,entity_id,invoice_id) REFERENCES "ApInvoice"(organisation_id,entity_id,id)
);
CREATE TABLE "ApOperation" (
 organisation_id uuid NOT NULL, user_id uuid NOT NULL, id uuid NOT NULL, digest text NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(organisation_id,user_id,id)
);
CREATE TABLE "ApExport" (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, entity_id uuid NOT NULL, invoice_id uuid NOT NULL, revision integer NOT NULL,
 bytes bytea NOT NULL, digest text NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,entity_id,invoice_id,revision), FOREIGN KEY(organisation_id,entity_id,invoice_id) REFERENCES "ApInvoice"(organisation_id,entity_id,id)
);
