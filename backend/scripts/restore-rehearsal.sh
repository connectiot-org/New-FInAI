#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Only disposable synthetic databases; never dump application data during this rehearsal.
source_db="rehearsal_$(date +%s)_$RANDOM"
restore_db="${source_db}_restore"
archive=$(mktemp /tmp/finai-rehearsal.XXXXXX)
cleanup() {
 docker compose exec -T db dropdb -U finai --if-exists "$source_db"
 docker compose exec -T db dropdb -U finai --if-exists "$restore_db"
 rm -f "$archive"
}
trap cleanup EXIT
docker compose exec -T db createdb -U finai "$source_db"
docker compose exec -T db createdb -U finai "$restore_db"
FINAI_REHEARSAL_DB="$source_db" node --env-file=.env --input-type=module <<'JS'
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {randomUUID,createHash} from 'node:crypto';
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^rehearsal_\d+_\d+$/.test(process.env.FINAI_REHEARSAL_DB))throw new Error('Disposable local database required');
url.pathname='/'+process.env.FINAI_REHEARSAL_DB;
process.env.DATABASE_URL=url.toString();
const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,stdio:'ignore'});
if(migrated.status!==0)throw new Error('Rehearsal migrations failed');
const db=new PrismaClient();
try {
 const org=randomUUID(),entity=randomUUID(),id=randomUUID();
 await db.organisation.create({data:{id:org,name:'Restore rehearsal'}});
 await db.entity.create({data:{id:entity,organisationId:org,name:'Synthetic entity'}});
 const source={entityId:entity,month:'2060-10',title:'Synthetic copied task'};
 await db.checklistTask.create({data:{id,organisationId:org,entityId:entity,month:new Date('2060-10-01T00:00:00Z'),title:source.title,completed:false,version:1,createDigest:createHash('sha256').update(JSON.stringify([entity,source.month,source.title])).digest('hex')}});
 await db.subscriptionRenewal.create({data:{id:randomUUID(),organisationId:org,entityId:entity,supplierName:'Synthetic supplier',subscriptionName:'Synthetic renewal',renewalDate:new Date('2060-11-01T00:00:00Z')}});
 const actor=randomUUID(),snapshot=randomUUID();
 await db.user.create({data:{id:actor}});
 await db.membership.create({data:{organisationId:org,userId:actor,isAdministrator:true}});
 await db.entityAccess.create({data:{organisationId:org,userId:actor,entityId:entity,canWrite:false,canImport:true}});
 await db.serverAudit.create({data:{id:randomUUID(),organisationId:org,actorId:actor,entityId:entity,requestId:randomUUID(),action:'restore.synthetic',reference:id,outcome:'success',metadata:{version:1}}});
 await db.receivableSnapshot.create({data:{id:snapshot,organisationId:org,entityId:entity,version:1,sourceName:'Synthetic restore export',sourceCapturedAt:new Date('2026-10-23T00:00:00Z'),importingActorId:actor,digest:createHash('sha256').update('synthetic restore content').digest('hex'),rowCount:1}});
 await db.receivableSnapshotInvoice.create({data:{organisationId:org,entityId:entity,snapshotId:snapshot,invoiceId:'restore-invoice',customerId:'restore-customer',customerName:'Synthetic customer',issuedOn:new Date('2026-09-01T00:00:00Z'),status:'Partial',amountCents:100000n,paidCents:25000n}});
} finally {await db.$disconnect();}
JS
docker compose exec -T db pg_dump -U finai -Fc "$source_db" > "$archive"
docker compose exec -T db pg_restore -U finai -d "$restore_db" --exit-on-error < "$archive"
result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM \"ChecklistTask\" WHERE title='Synthetic copied task' AND completed=false AND version=1")
test "$result" = 1
schema_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('Account','Session','RateLimit')")
test "$schema_result" = 3
migration_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')
test "$migration_result" = 5
renewal_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM \"SubscriptionRenewal\" WHERE \"supplierName\"='Synthetic supplier' AND archived=false AND version=1")
test "$renewal_result" = 1
snapshot_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM \"ReceivableSnapshot\" s JOIN \"ReceivableSnapshotInvoice\" i ON i.snapshot_id=s.id AND i.organisation_id=s.organisation_id AND i.entity_id=s.entity_id WHERE s.version=1 AND s.row_count=1 AND i.amount_cents=100000 AND i.paid_cents=25000")
test "$snapshot_result" = 1
audit_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM \"ServerAudit\" a JOIN \"Membership\" m ON m.organisation_id=a.organisation_id AND m.user_id=a.actor_id JOIN \"EntityAccess\" e ON e.organisation_id=m.organisation_id AND e.user_id=m.user_id AND e.entity_id=a.entity_id WHERE m.is_administrator=true AND e.can_import=true AND e.can_write=false AND a.outcome='success'")
test "$audit_result" = 1
printf 'PASS: migrated synthetic application database restored; task/subscription/snapshot state, auth schema and migration history verified\n'
