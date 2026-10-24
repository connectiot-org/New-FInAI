CREATE TABLE "ReceivableSnapshot" (
 id UUID PRIMARY KEY, organisation_id UUID NOT NULL, entity_id UUID NOT NULL, version INTEGER NOT NULL CHECK(version>0),
 source_name VARCHAR(200) NOT NULL CHECK(length(btrim(source_name))>0), source_captured_at TIMESTAMPTZ(3) NOT NULL,
 imported_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, importing_actor_id UUID NOT NULL REFERENCES "User"(id),
 digest CHAR(64) NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), row_count INTEGER NOT NULL CHECK(row_count BETWEEN 0 AND 10000),
 CONSTRAINT receivable_entity_fk FOREIGN KEY(organisation_id,entity_id) REFERENCES "Entity"(organisation_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT receivable_version UNIQUE(organisation_id,entity_id,version),
 CONSTRAINT receivable_digest UNIQUE(organisation_id,entity_id,digest),
 CONSTRAINT receivable_scope UNIQUE(organisation_id,entity_id,id)
);
CREATE TABLE "ReceivableSnapshotInvoice" (
 organisation_id UUID NOT NULL, entity_id UUID NOT NULL, snapshot_id UUID NOT NULL,
 invoice_id VARCHAR(200) NOT NULL CHECK(length(btrim(invoice_id))>0), customer_id VARCHAR(200) NOT NULL CHECK(length(btrim(customer_id))>0),
 customer_name VARCHAR(200) CHECK(customer_name IS NULL OR length(btrim(customer_name))>0), issued_on DATE NOT NULL CHECK(issued_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 status VARCHAR(10) NOT NULL CHECK(status IN ('Draft','Issued','Partial','Paid')),
 amount_cents BIGINT NOT NULL CHECK(amount_cents BETWEEN 0 AND 9007199254740991), paid_cents BIGINT NOT NULL CHECK(paid_cents BETWEEN 0 AND amount_cents),
 CONSTRAINT receivable_status_money CHECK((status IN ('Draft','Issued') AND paid_cents=0) OR (status='Partial' AND paid_cents>0 AND paid_cents<amount_cents) OR (status='Paid' AND paid_cents=amount_cents)),
 CONSTRAINT receivable_invoice_pk PRIMARY KEY(organisation_id,entity_id,snapshot_id,invoice_id),
 CONSTRAINT receivable_snapshot_fk FOREIGN KEY(organisation_id,entity_id,snapshot_id) REFERENCES "ReceivableSnapshot"(organisation_id,entity_id,id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX receivable_invoice_scope_date ON "ReceivableSnapshotInvoice"(organisation_id,entity_id,snapshot_id,issued_on,customer_id);
