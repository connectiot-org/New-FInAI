#!/usr/bin/env bash
# Storage-only PostgreSQL restore/tenant-FK check, not a substitute for API acceptance.
set -euo pipefail
cd "$(dirname "$0")/.."
suffix=$(node -e 'console.log(crypto.randomUUID().replaceAll("-",""))')
source_db="ap_storage_${suffix}"
restore_db="ap_restore_${suffix}"
archive=$(mktemp /tmp/ap-storage.XXXXXX)
cleanup() {
 docker compose exec -T db dropdb -U finai --if-exists "$source_db" >/dev/null
 docker compose exec -T db dropdb -U finai --if-exists "$restore_db" >/dev/null
 rm -f "$archive"
}
trap cleanup EXIT
docker compose exec -T db createdb -U finai "$source_db"
docker compose exec -T db createdb -U finai "$restore_db"
for migration in prisma/migrations/*/migration.sql; do
 docker compose exec -T db psql -q -U finai -d "$source_db" -v ON_ERROR_STOP=1 < "$migration"
done
docker compose exec -T db psql -q -U finai -d "$source_db" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Organisation" VALUES ('11111111-1111-4111-8111-111111111111','Synthetic AP storage');
INSERT INTO "User" VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO "Membership"(organisation_id,user_id) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO "Entity" VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Synthetic A'),('22222222-2222-4222-8222-222222222223','11111111-1111-4111-8111-111111111111','Synthetic B');
INSERT INTO "EntityAccess"(organisation_id,user_id,entity_id) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222');
INSERT INTO "ApGrant" VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,true,false,false,false);
INSERT INTO "ApSupplier"(id,organisation_id,entity_id,name,tax_id,create_digest) VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Synthetic Supplier','TEST',repeat('a',64));
INSERT INTO "ApPolicy"(organisation_id,entity_id,draft,published,published_version) VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','{"currency":"GBP","rules":[]}'::jsonb,'{"currency":"GBP","rules":[]}'::jsonb,1);
INSERT INTO "ApInvoice"(id,organisation_id,entity_id,supplier_id,reference_key,data,create_digest,state,route) VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','synthetic-1','{"currency":"GBP","declaredGross":"12000"}',repeat('b',64),'approved','{"policyVersion":1,"step":2}');
INSERT INTO "ApDocument"(id,organisation_id,entity_id,invoice_id,revision,bytes,digest,filename,scan_state,uploader_id) SELECT '55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',1,b,encode(sha256(b),'hex'),'synthetic.pdf','synthetic','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' FROM (SELECT convert_to('%PDF-1.4'||repeat('0',20000)||'%%EOF','UTF8') AS b) x;
INSERT INTO "ApEvent"(id,organisation_id,entity_id,invoice_id,actor_id,revision,action,snapshot) VALUES ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'approve','{"state":"approved"}');
INSERT INTO "ApExport"(id,organisation_id,entity_id,invoice_id,revision,bytes,digest,actor_id) SELECT '77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',1,b,encode(sha256(b),'hex'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' FROM (SELECT convert_to(E'account,debit,credit\r\n6000,12000,0\r\n2100,0,12000\r\n','UTF8') AS b) x;
DO $$ BEGIN
 BEGIN
 UPDATE "ApInvoice" SET entity_id='22222222-2222-4222-8222-222222222223';
 RAISE EXCEPTION 'Cross-entity relation unexpectedly accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
END $$;
SQL
docker compose exec -T db pg_dump -U finai --format=custom "$source_db" > "$archive"
docker compose exec -T db pg_restore -U finai --exit-on-error --no-owner --dbname="$restore_db" < "$archive"
result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -v ON_ERROR_STOP=1 <<'SQL'
SELECT (SELECT count(*) FROM "ApDocument" WHERE digest=encode(sha256(bytes),'hex') AND octet_length(bytes)>16384)=1
 AND (SELECT count(*) FROM "ApExport" WHERE digest=encode(sha256(bytes),'hex'))=1
 AND (SELECT count(*) FROM "ApEvent" WHERE snapshot->>'state'='approved')=1
 AND (SELECT count(*) FROM "ApInvoice" WHERE route->>'step'='2' AND state='approved')=1
 AND (SELECT count(*) FROM "ApPolicy" WHERE published_version=1)=1
 AND (SELECT count(*) FROM "ApGrant" WHERE view AND review)=1;
SQL
)
test "$result" = t
printf 'PASS: storage-only AP document/export bytes, route, history, policy and grants restore; cross-entity FK denied. No API acceptance claimed.\n'
