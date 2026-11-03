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
import {readFileSync} from 'node:fs';
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
 const {validateLedger}=await import('./dist/src/ledger/source.js');
 const ledgerSource=validateLedger(JSON.parse(readFileSync('../contracts/examples/assistant-ledger.synthetic.json','utf8')));
 const conversation=randomUUID();
 await db.assistantConversation.create({data:{id:conversation,organisationId:org,userId:actor,entityId:entity,month:'2026-09',currency:'USD',createDigest:'a'.repeat(64),expiresAt:new Date('2030-01-01')}});
 await db.assistantTurn.create({data:{id:randomUUID(),conversationId:conversation,question:'Synthetic restore question',digest:'b'.repeat(64),status:'completed',answer:{facts:[],sources:[],notes:['Synthetic restore answer'],basis:'Synthetic fixture only',detail:'concise'},model:'controlled-fixture',policy:'grounded-facts-v1',lease:randomUUID(),leaseUntil:new Date(0),finishedAt:new Date()}});
 await db.assistantPreference.create({data:{id:randomUUID(),organisationId:org,userId:actor,entityId:entity,detail:'concise',note:'Synthetic explicit preference',expiresAt:new Date('2030-01-01')}});
 await db.ledgerSnapshot.create({data:{id:randomUUID(),organisationId:org,entityId:entity,actorId:actor,version:1,digest:createHash('sha256').update(JSON.stringify(ledgerSource)).digest('hex'),sourceName:ledgerSource.sourceName,capturedAt:new Date(ledgerSource.capturedAt),content:ledgerSource}});
 await db.receivableSnapshot.create({data:{id:snapshot,organisationId:org,entityId:entity,version:1,sourceName:'Synthetic restore export',sourceCapturedAt:new Date('2026-10-23T00:00:00Z'),importingActorId:actor,digest:createHash('sha256').update('synthetic restore content').digest('hex'),rowCount:1}});
 await db.receivableSnapshotInvoice.create({data:{organisationId:org,entityId:entity,snapshotId:snapshot,invoiceId:'restore-invoice',customerId:'restore-customer',customerName:'Synthetic customer',issuedOn:new Date('2026-09-01T00:00:00Z'),status:'Partial',amountCents:100000n,paidCents:25000n}});
 // Exercise the real AP service before backing up, rather than inserting an approved flag.
 const {Database}=await import('./dist/src/database.js');
 const {PayablesService}=await import('./dist/src/payables/service.js');
 const apDb=new Database(),ap=new PayablesService(apDb),approver=randomUUID(),supplier=randomUUID(),invoice=randomUUID();
 try {
  await db.account.create({data:{userId:actor,username:'restore-ap-reviewer',passwordHash:'synthetic-service-fixture'}});
  await db.user.create({data:{id:approver}});await db.account.create({data:{userId:approver,username:'restore-ap-approver',passwordHash:'synthetic-service-fixture'}});
  await db.membership.create({data:{organisationId:org,userId:approver}});await db.entityAccess.create({data:{organisationId:org,userId:approver,entityId:entity}});
  await db.apGrant.createMany({data:[{organisationId:org,entityId:entity,userId:actor,view:true,review:true,manage:true},{organisationId:org,entityId:entity,userId:approver,view:true,approve:true}]});
  const identity={organisationId:org,userId:actor};
  await ap.supplier(identity,{id:supplier,entityId:entity,name:'Restore AP supplier',taxId:'SYNTHETIC'});
  await ap.policy(identity,{operationId:randomUUID(),entityId:entity,expectedVersion:0,publish:true,definition:{currency:'GBP',rules:[],fallback:{verifierId:null,approverIds:[approver]}}});
  const input={...JSON.parse(readFileSync('../contracts/payables-examples/bill.json','utf8')),id:invoice,entityId:entity,supplierId:supplier,reference:'RESTORE-AP-001'};
  await ap.create(identity,input);
  await ap.upload(identity,invoice,{entityId:entity,operationId:randomUUID(),expectedVersion:1,filename:'restore.pdf'},Buffer.from('%PDF-1.4\n'+('0'.repeat(20000))+'\n%%EOF'),true);
  await ap.action(identity,invoice,{operationId:randomUUID(),expectedVersion:2,action:'review'});
  await ap.action({organisationId:org,userId:approver},invoice,{operationId:randomUUID(),expectedVersion:3,action:'approve'});
  await ap.export(identity,invoice,{operationId:randomUUID(),expectedVersion:4});
 } finally {await apDb.$disconnect();}

} finally {await db.$disconnect();}
JS
docker compose exec -T db pg_dump -U finai -Fc "$source_db" > "$archive"
docker compose exec -T db pg_restore -U finai -d "$restore_db" --exit-on-error < "$archive"
result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM \"ChecklistTask\" WHERE title='Synthetic copied task' AND completed=false AND version=1")
test "$result" = 1
schema_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('Account','Session','RateLimit')")
test "$schema_result" = 3
migration_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')
test "$migration_result" = 8
renewal_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM \"SubscriptionRenewal\" WHERE \"supplierName\"='Synthetic supplier' AND archived=false AND version=1")
test "$renewal_result" = 1
snapshot_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM \"ReceivableSnapshot\" s JOIN \"ReceivableSnapshotInvoice\" i ON i.snapshot_id=s.id AND i.organisation_id=s.organisation_id AND i.entity_id=s.entity_id WHERE s.version=1 AND s.row_count=1 AND i.amount_cents=100000 AND i.paid_cents=25000")
test "$snapshot_result" = 1
audit_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM \"ServerAudit\" a JOIN \"Membership\" m ON m.organisation_id=a.organisation_id AND m.user_id=a.actor_id JOIN \"EntityAccess\" e ON e.organisation_id=m.organisation_id AND e.user_id=m.user_id AND e.entity_id=a.entity_id WHERE m.is_administrator=true AND e.can_import=true AND e.can_write=false AND a.outcome='success' AND a.action='restore.synthetic'")
test "$audit_result" = 1
assistant_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" -c "SELECT count(*) FROM \"AssistantConversation\" c JOIN \"AssistantTurn\" t ON t.conversation_id=c.id JOIN \"AssistantPreference\" p ON p.organisation_id=c.organisation_id AND p.user_id=c.user_id AND p.entity_id=c.entity_id JOIN \"LedgerSnapshot\" l ON l.organisation_id=c.organisation_id AND l.entity_id=c.entity_id WHERE t.status='completed' AND t.answer->>'detail'='concise' AND p.detail='concise' AND l.version=1")
test "$assistant_result" = 1
ap_result=$(docker compose exec -T db psql -At -U finai -d "$restore_db" <<'SQL'
SELECT (SELECT count(*) FROM "ApInvoice" WHERE state='approved' AND data->>'reference'='RESTORE-AP-001' AND route->>'policyVersion'='1' AND route->>'step'='1')=1
 AND (SELECT count(*) FROM "ApDocument" WHERE octet_length(bytes)>16384 AND digest=encode(sha256(bytes),'hex'))=1
 AND (SELECT count(*) FROM "ApExport" WHERE revision=2 AND digest=encode(sha256(bytes),'hex'))=1
 AND (SELECT count(*) FROM "ApEvent" WHERE action='approve' AND snapshot->>'state'='approved')=1
 AND (SELECT count(*) FROM "ApPolicy" WHERE published_version=1)=1
 AND (SELECT count(*) FROM "ApGrant")=2;
SQL
)
test "$ap_result" = t
printf 'PASS: migrated synthetic application database restored; task/subscription/snapshot/Assistant and approved AP/PDF/export state, auth schema and eight migrations verified\n'
