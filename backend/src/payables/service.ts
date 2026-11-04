/** Authoritative invoice transactions: recheck grants/versions and commit decisions with their audit history. */
import { Injectable, Inject } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { Database } from "../database";
import type { Identity } from "../config";
import { ApiError } from "../errors";
import { recordAudit } from "../audit";
import {
  fields,
  totals,
  csv,
  fingerprint,
  referenceKey,
  routePolicy,
  type Fields,
  type Policy,
  type Route,
} from "./domain";
import { ClamAvScanner, type DocumentScanner } from "./scanner";
type Tx = Prisma.TransactionClient;
type Grant = {
  view: boolean;
  review: boolean;
  verify: boolean;
  approve: boolean;
  manage: boolean;
};
type Invoice = {
  id: string;
  organisation_id: string;
  entity_id: string;
  supplier_id: string;
  data: Fields;
  version: number;
  revision: number;
  state: string;
  correction_reason: string | null;
  route: Route | null;
  create_digest: string;
  created_at: Date;
  updated_at: Date;
};
const missing = () => new ApiError(404, "NOT_FOUND", "Resource not found.");
const conflict = () =>
  new ApiError(
    409,
    "VERSION_CONFLICT",
    "This record changed. Reload before trying again.",
  );
@Injectable()
export class PayablesService {
  scanner: DocumentScanner = new ClamAvScanner();
  constructor(@Inject(Database) readonly db: Database) {}
  async permission(
    tx: Tx,
    i: Identity,
    entityId: string,
    action: keyof Grant = "view",
  ): Promise<Grant> {
    // Shared locks prevent concurrent revocation during a financial mutation.
    const account = await tx.$queryRaw<
      { disabled: boolean }[]
    >`SELECT disabled FROM "Account" WHERE "userId"=${i.userId}::uuid FOR SHARE`;
    if (!account[0] || account[0].disabled) throw missing();
    const rows = await tx.$queryRaw<
      Grant[]
    >`SELECT g.view,g.review,g.verify,g.approve,g.manage FROM "ApGrant" g JOIN "EntityAccess" a USING(organisation_id,entity_id,user_id) JOIN "Membership" m USING(organisation_id,user_id) JOIN "Account" ac ON ac."userId"=g.user_id WHERE g.organisation_id=${i.organisationId}::uuid AND g.entity_id=${entityId}::uuid AND g.user_id=${i.userId}::uuid AND m.active AND (ac."userId" IS NULL OR NOT ac.disabled) FOR SHARE OF g,a,m`;
    if (!rows[0]?.view) throw missing();
    if (!rows[0][action])
      throw new ApiError(
        403,
        "FORBIDDEN",
        `Invoice ${action} permission is required.`,
      );
    return rows[0];
  }
  private async serial(tx: Tx, key: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
  }
  private async invoice(
    tx: Tx,
    i: Identity,
    id: string,
    action: keyof Grant = "view",
  ) {
    const rows = await tx.$queryRaw<
      Invoice[]
    >`SELECT * FROM "ApInvoice" WHERE id=${id}::uuid AND organisation_id=${i.organisationId}::uuid FOR UPDATE`;
    if (!rows[0]) throw missing();
    await this.permission(tx, i, rows[0].entity_id, action);
    return rows[0];
  }
  private async event(
    tx: Tx,
    i: Identity,
    n: Invoice,
    action: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ) {
    await tx.$executeRaw`INSERT INTO "ApEvent"(id,organisation_id,entity_id,invoice_id,actor_id,revision,action,reason,snapshot) VALUES(${randomUUID()}::uuid,${i.organisationId}::uuid,${n.entity_id}::uuid,${n.id}::uuid,${i.userId}::uuid,${n.revision},${action},${reason || null},${JSON.stringify({ data: n.data, route: n.route, state: n.state, metadata })}::jsonb)`;
    await recordAudit(tx, i, `payables.${action}`, n.id, n.entity_id, {
      version: n.version,
      ...(metadata?.origin === "assistant"
        ? { reasonCode: "assistant_command" }
        : {}),
    });
  }
  private async once<T>(
    tx: Tx,
    i: Identity,
    id: string,
    value: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    await this.serial(tx, `ap-operation:${i.organisationId}:${i.userId}:${id}`);
    const digest = fingerprint(value);
    const old = await tx.$queryRaw<
      { digest: string; result: T }[]
    >`SELECT digest,result FROM "ApOperation" WHERE organisation_id=${i.organisationId}::uuid AND user_id=${i.userId}::uuid AND id=${id}::uuid`;
    if (old[0]) {
      if (old[0].digest !== digest) throw conflict();
      return old[0].result;
    }
    const result = await run();
    await tx.$executeRaw`INSERT INTO "ApOperation" VALUES(${i.organisationId}::uuid,${i.userId}::uuid,${id}::uuid,${digest},${JSON.stringify(result)}::jsonb)`;
    return result;
  }
  async assistantSnapshot(
    i: Identity,
    entityId: string,
    month: string,
    invoiceId?: string | null,
    search?: string | null,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const capabilities = await this.permission(tx, i, entityId);
        const rows = await tx.$queryRaw<
          (Invoice & { supplier_name: string })[]
        >`SELECT n.*,s.name AS supplier_name FROM "ApInvoice" n JOIN "ApSupplier" s ON s.id=n.supplier_id WHERE n.organisation_id=${i.organisationId}::uuid AND n.entity_id=${entityId}::uuid AND left(n.data->>'invoiceDate',7)=${month} AND (${invoiceId || null}::uuid IS NULL OR n.id=${invoiceId || null}::uuid) AND (${search || ""}='' OR ${invoiceId || null}::uuid IS NOT NULL OR position(lower(${search || ""}) in lower(s.name))>0 OR position(lower(${search || ""}) in lower(n.data->>'reference'))>0) ORDER BY n.created_at DESC,n.id DESC LIMIT 1001`;
        if (rows.length > 1000)
          throw new ApiError(
            422,
            "SOURCE_LIMIT",
            "Select an exact supplier invoice; the Assistant reads at most1000 invoices per month.",
          );
        if (invoiceId && !rows.length) throw missing();
        const counts = {
            review: 0,
            verify: 0,
            approve: 0,
            approved: 0,
            rejected: 0,
          },
          amounts = { gross: 0n, approved: 0n };
        const items = rows.map((n) => {
          const parsed = fields.safeParse(n.data);
          if (!parsed.success)
            throw new ApiError(
              503,
              "SOURCE_INVALID",
              "Supplier invoice source needs review.",
            );
          n.data = parsed.data;
          const calculated = totals(n.data);
          if (!(n.state in counts))
            throw new ApiError(
              503,
              "SOURCE_INVALID",
              "Supplier invoice state needs review.",
            );
          counts[n.state as keyof typeof counts]++;
          amounts.gross += BigInt(calculated.gross);
          if (n.state === "approved")
            amounts.approved += BigInt(calculated.gross);
          return { ...n, totals: calculated };
        });
        const policy = await tx.apPolicy.findUnique({
          where: {
            organisationId_entityId: {
              organisationId: i.organisationId,
              entityId,
            },
          },
        });
        const latest = invoiceId
          ? await tx.$queryRaw<
              { scan_state: string }[]
            >`SELECT scan_state FROM "ApDocument" WHERE invoice_id=${invoiceId}::uuid AND organisation_id=${i.organisationId}::uuid AND entity_id=${entityId}::uuid ORDER BY revision DESC,id DESC LIMIT 1`
          : [];
        return {
          items,
          counts,
          total: items.length,
          gross: amounts.gross.toString(),
          approvedGross: amounts.approved.toString(),
          capabilities,
          policyPublished: !!policy?.published,
          documentReady:
            !!latest[0] &&
            ["clean", "synthetic"].includes(latest[0].scan_state),
          retrievedAt: new Date().toISOString(),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async capabilities(i: Identity, entityId: string) {
    return this.db.$transaction(async (tx) => {
      const capabilities = await this.permission(tx, i, entityId);
      const members = await tx.$queryRaw<
        { id: string; name: string; verify: boolean; approve: boolean }[]
      >`SELECT g.user_id AS id,COALESCE(ac.username,left(g.user_id::text,8)) AS name,g.verify,g.approve FROM "ApGrant" g JOIN "Membership" m USING(organisation_id,user_id) JOIN "EntityAccess" a USING(organisation_id,user_id,entity_id) JOIN "Account" ac ON ac."userId"=g.user_id WHERE g.organisation_id=${i.organisationId}::uuid AND g.entity_id=${entityId}::uuid AND g.view AND m.active AND (ac."userId" IS NULL OR NOT ac.disabled) ORDER BY g.user_id LIMIT 100`;
      return { capabilities, members, currency: "GBP" };
    });
  }
  private async administrator(tx: Tx, i: Identity) {
    const rows =
      await tx.$queryRaw`SELECT m.user_id FROM "Membership" m JOIN "Account" a ON a."userId"=m.user_id WHERE m.organisation_id=${i.organisationId}::uuid AND m.user_id=${i.userId}::uuid AND m.active AND m.is_administrator AND NOT a.disabled FOR SHARE OF m,a`;
    if (!(rows as unknown[]).length)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Administrator permission is required.",
      );
  }
  async grantList(i: Identity, entityId: string) {
    return this.db.$transaction(async (tx) => {
      await this.administrator(tx, i);
      const entity =
        await tx.$queryRaw`SELECT id FROM "Entity" WHERE organisation_id=${i.organisationId}::uuid AND id=${entityId}::uuid`;
      if (!(entity as unknown[]).length) throw missing();
      return {
        items:
          await tx.$queryRaw`SELECT a.user_id AS "userId",COALESCE(ac.username,left(a.user_id::text,8)) AS name,jsonb_build_object('view',coalesce(g.view,false),'review',coalesce(g.review,false),'verify',coalesce(g.verify,false),'approve',coalesce(g.approve,false),'manage',coalesce(g.manage,false)) AS capabilities FROM "EntityAccess" a JOIN "Membership" m USING(organisation_id,user_id) LEFT JOIN "Account" ac ON ac."userId"=a.user_id LEFT JOIN "ApGrant" g USING(organisation_id,user_id,entity_id) WHERE a.organisation_id=${i.organisationId}::uuid AND a.entity_id=${entityId}::uuid AND m.active AND (ac."userId" IS NULL OR NOT ac.disabled) ORDER BY a.user_id LIMIT 1000`,
      };
    });
  }
  async grants(i: Identity, b: { entityId: string; userId: string } & Grant) {
    return this.db.$transaction(async (tx) => {
      await this.administrator(tx, i);
      if (i.userId === b.userId)
        throw new ApiError(
          403,
          "FORBIDDEN",
          "An administrator must provision another member.",
        );
      await tx.$queryRaw`SELECT a.user_id FROM "EntityAccess" a JOIN "Membership" m USING(organisation_id,user_id) WHERE a.organisation_id=${i.organisationId}::uuid AND a.user_id=${b.userId}::uuid AND a.entity_id=${b.entityId}::uuid FOR SHARE OF a,m`;
      const target = await tx.entityAccess.findUnique({
        where: {
          organisationId_userId_entityId: {
            organisationId: i.organisationId,
            userId: b.userId,
            entityId: b.entityId,
          },
        },
        include: { membership: true },
      });
      if (!target?.membership.active) throw missing();
      await tx.$executeRaw`INSERT INTO "ApGrant" VALUES(${i.organisationId}::uuid,${b.entityId}::uuid,${b.userId}::uuid,${b.view},${b.review},${b.verify},${b.approve},${b.manage}) ON CONFLICT(organisation_id,entity_id,user_id) DO UPDATE SET view=EXCLUDED.view,review=EXCLUDED.review,verify=EXCLUDED.verify,approve=EXCLUDED.approve,manage=EXCLUDED.manage`;
      await tx.session.deleteMany({
        where: { userId: b.userId, organisationId: i.organisationId },
      });
      await recordAudit(tx, i, "payables.grant", b.userId, b.entityId);
      return { status: "saved" };
    });
  }
  async suppliers(i: Identity, entityId: string) {
    return this.db.$transaction(async (tx) => {
      await this.permission(tx, i, entityId);
      return {
        items:
          await tx.$queryRaw`SELECT id,name,tax_id AS "taxId",active,version FROM "ApSupplier" WHERE organisation_id=${i.organisationId}::uuid AND entity_id=${entityId}::uuid ORDER BY name,id LIMIT 500`,
      };
    });
  }
  async supplier(
    i: Identity,
    b: { id: string; entityId: string; name: string; taxId: string },
  ) {
    return this.db.$transaction(async (tx) => {
      await this.permission(tx, i, b.entityId, "review");
      await this.serial(tx, `ap-suppliers:${i.organisationId}:${b.entityId}`);
      await this.serial(tx, `ap-supplier:${b.id}`);
      const existing = await tx.$queryRaw<
        { organisation_id: string; entity_id: string; create_digest: string }[]
      >`SELECT * FROM "ApSupplier" WHERE id=${b.id}::uuid`;
      if (existing[0]) {
        if (
          existing[0].organisation_id !== i.organisationId ||
          existing[0].entity_id !== b.entityId
        )
          throw missing();
        if (existing[0].create_digest !== fingerprint(b)) throw conflict();
        return { id: b.id };
      }
      const capacity = await tx.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM "ApSupplier" WHERE organisation_id=${i.organisationId}::uuid AND entity_id=${b.entityId}::uuid`;
      if (capacity[0].count >= 500)
        throw new ApiError(
          409,
          "SUPPLIER_LIMIT",
          "This pilot company has reached its 500-supplier limit.",
        );
      await tx.$executeRaw`INSERT INTO "ApSupplier"(id,organisation_id,entity_id,name,tax_id,create_digest) VALUES(${b.id}::uuid,${i.organisationId}::uuid,${b.entityId}::uuid,${b.name},${b.taxId},${fingerprint(b)})`;
      await recordAudit(tx, i, "payables.supplier-created", b.id, b.entityId);
      return { id: b.id };
    });
  }
  async patchSupplier(
    i: Identity,
    id: string,
    b: {
      expectedVersion: number;
      name: string;
      taxId: string;
      active: boolean;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { entity_id: string }[]
      >`SELECT entity_id FROM "ApSupplier" WHERE id=${id}::uuid AND organisation_id=${i.organisationId}::uuid`;
      if (!rows[0]) throw missing();
      await this.permission(tx, i, rows[0].entity_id, "review");
      const count =
        await tx.$executeRaw`UPDATE "ApSupplier" SET name=${b.name},tax_id=${b.taxId},active=${b.active},version=version+1 WHERE id=${id}::uuid AND version=${b.expectedVersion}`;
      if (!count) throw conflict();
      await recordAudit(
        tx,
        i,
        "payables.supplier-updated",
        id,
        rows[0].entity_id,
        { version: b.expectedVersion + 1 },
      );
      return { id };
    });
  }
  async create(i: Identity, b: Fields & { id: string; entityId: string }) {
    totals(b);
    return this.db.$transaction(async (tx) => {
      await this.permission(tx, i, b.entityId, "review");
      await this.serial(tx, `ap-create:${i.organisationId}:${b.entityId}`);
      await this.serial(tx, `ap-id:${b.id}`);
      const old = await tx.$queryRaw<
        Invoice[]
      >`SELECT * FROM "ApInvoice" WHERE id=${b.id}::uuid`;
      if (old[0]) {
        if (
          old[0].organisation_id !== i.organisationId ||
          old[0].entity_id !== b.entityId
        )
          throw missing();
        if (old[0].create_digest !== fingerprint(b)) throw conflict();
        return { id: b.id };
      }
      await this.checkSupplier(tx, i, b.entityId, b.supplierId);
      await this.duplicate(tx, i, b.entityId, b.supplierId, b.reference);
      const data = fields.parse({
        supplierId: b.supplierId,
        reference: b.reference,
        invoiceDate: b.invoiceDate,
        dueDate: b.dueDate,
        currency: b.currency,
        declaredGross: b.declaredGross,
        lines: b.lines,
      });
      await tx.$executeRaw`INSERT INTO "ApInvoice"(id,organisation_id,entity_id,supplier_id,reference_key,data,create_digest) VALUES(${b.id}::uuid,${i.organisationId}::uuid,${b.entityId}::uuid,${b.supplierId}::uuid,${referenceKey(b.reference)},${JSON.stringify(data)}::jsonb,${fingerprint(b)})`;
      const n = await this.invoice(tx, i, b.id);
      await this.event(tx, i, n, "created");
      return { id: b.id };
    });
  }
  private async checkSupplier(
    tx: Tx,
    i: Identity,
    entityId: string,
    supplierId: string,
  ) {
    const s =
      await tx.$queryRaw`SELECT id FROM "ApSupplier" WHERE id=${supplierId}::uuid AND organisation_id=${i.organisationId}::uuid AND entity_id=${entityId}::uuid AND active`;
    if (!(s as unknown[]).length) throw missing();
  }
  private async duplicate(
    tx: Tx,
    i: Identity,
    entityId: string,
    supplierId: string,
    reference: string,
    exclude: string = randomUUID(),
  ) {
    const rows =
      await tx.$queryRaw`SELECT id FROM "ApInvoice" WHERE organisation_id=${i.organisationId}::uuid AND entity_id=${entityId}::uuid AND supplier_id=${supplierId}::uuid AND reference_key=${referenceKey(reference)} AND id<>${exclude}::uuid`;
    if ((rows as unknown[]).length)
      throw new ApiError(
        409,
        "DUPLICATE_REFERENCE",
        "This supplier reference already exists. Open the existing invoice or correct the reference.",
      );
  }
  async patch(
    i: Identity,
    id: string,
    b: Fields & { expectedVersion: number },
  ) {
    totals(b);
    return this.db.$transaction(async (tx) => {
      const n = await this.invoice(tx, i, id, "review");
      if (n.version !== b.expectedVersion) throw conflict();
      if (n.state === "rejected")
        throw new ApiError(
          409,
          "REJECTED",
          "Rejected invoices cannot be reopened.",
        );
      await this.serial(tx, `ap-create:${i.organisationId}:${n.entity_id}`);
      await this.checkSupplier(tx, i, n.entity_id, b.supplierId);
      await this.duplicate(tx, i, n.entity_id, b.supplierId, b.reference, id);
      const data = fields.parse({
        supplierId: b.supplierId,
        reference: b.reference,
        invoiceDate: b.invoiceDate,
        dueDate: b.dueDate,
        currency: b.currency,
        declaredGross: b.declaredGross,
        lines: b.lines,
      });
      await tx.$executeRaw`UPDATE "ApInvoice" SET data=${JSON.stringify(data)}::jsonb,supplier_id=${b.supplierId}::uuid,reference_key=${referenceKey(b.reference)},revision=revision+1,version=version+1,state='review',route=NULL,correction_reason=NULL,updated_at=now() WHERE id=${id}::uuid`;
      n.revision++;
      n.version++;
      n.data = data;
      n.route = null;
      n.state = "review";
      await this.event(tx, i, n, "revised");
      return { id };
    });
  }
  async detail(i: Identity, id: string) {
    return this.db.$transaction(async (tx) => {
      const n = await this.invoice(tx, i, id);
      const supplierRows = await tx.$queryRaw<
        { id: string; name: string; taxId: string }[]
      >`SELECT id,name,tax_id AS "taxId" FROM "ApSupplier" WHERE id=${n.supplier_id}::uuid`;
      const documents =
        await tx.$queryRaw`SELECT id,filename,digest,scan_state AS "scanState",revision,scan_result AS "scanResult" FROM "ApDocument" WHERE invoice_id=${id}::uuid ORDER BY created_at,id`;
      const events = await tx.$queryRaw<
        {
          id: string;
          actorId: string;
          revision: number;
          action: string;
          reason: string | null;
          createdAt: Date;
        }[]
      >`SELECT id,actor_id AS "actorId",revision,action,reason,created_at AS "createdAt" FROM "ApEvent" WHERE invoice_id=${id}::uuid ORDER BY created_at DESC,id DESC LIMIT 500`;
      const exports =
        await tx.$queryRaw`SELECT id,revision FROM "ApExport" WHERE invoice_id=${id}::uuid ORDER BY revision`;
      return {
        id: n.id,
        entityId: n.entity_id,
        data: n.data,
        supplier: supplierRows[0],
        version: n.version,
        revision: n.revision,
        state: n.state,
        correctionReason: n.correction_reason,
        route: n.route,
        totals: totals(n.data),
        documents,
        events,
        exports,
        payment: "unpaid",
        capabilities: await this.permission(tx, i, n.entity_id),
      };
    });
  }
  async list(
    i: Identity,
    b: {
      entityId: string;
      queue: string;
      search: string;
      offset: number;
      limit: number;
      status?: string;
      dueBefore?: string;
      month?: string;
      assignee?: string;
    },
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.permission(tx, i, b.entityId);
        const rows = await tx.$queryRaw<
          (Invoice & { supplier_name: string; document_ready: boolean })[]
        >`SELECT n.*,s.name AS supplier_name,COALESCE((SELECT d.scan_state IN ('synthetic','clean') FROM "ApDocument" d WHERE d.invoice_id=n.id ORDER BY d.revision DESC,d.id DESC LIMIT 1),false) AS document_ready FROM "ApInvoice" n JOIN "ApSupplier" s ON s.id=n.supplier_id WHERE n.organisation_id=${i.organisationId}::uuid AND n.entity_id=${b.entityId}::uuid AND (position(lower(${b.search}) in lower(s.name))>0 OR position(lower(${b.search}) in lower(n.data->>'reference'))>0) AND (${b.month || ""}='' OR left(n.data->>'invoiceDate',7)=${b.month || ""}) AND (${b.status || ""}='' OR n.state=${b.status || ""}) AND (${b.dueBefore || ""}='' OR n.data->>'dueDate'<=${b.dueBefore || ""}) ORDER BY n.created_at DESC,n.id DESC LIMIT 10001`;
        if (rows.length > 10000)
          throw new ApiError(
            422,
            "REGISTER_LIMIT",
            "Narrow the filters; at most 10,000 matching invoices are supported.",
          );
        const filtered = rows.filter(
          (n) =>
            !b.assignee ||
            n.route?.verifierId === b.assignee ||
            n.route?.approverIds[n.route.step] === b.assignee,
        );
        const counts = {
          all: filtered.length,
          review: 0,
          verify: 0,
          approve: 0,
          export: 0,
        };
        for (const n of filtered) {
          if (n.state === "review") counts.review++;
          if (n.state === "verify" && n.route?.verifierId === i.userId)
            counts.verify++;
          if (
            n.state === "approve" &&
            n.route?.approverIds[n.route.step] === i.userId
          )
            counts.approve++;
          if (n.state === "approved") counts.export++;
        }
        const queue = filtered.filter(
          (n) =>
            b.queue === "all" ||
            (b.queue === "review" && n.state === "review") ||
            (b.queue === "verify" &&
              n.state === "verify" &&
              n.route?.verifierId === i.userId) ||
            (b.queue === "approve" &&
              n.state === "approve" &&
              n.route?.approverIds[n.route.step] === i.userId) ||
            (b.queue === "export" && n.state === "approved"),
        );
        return {
          counts,
          total: queue.length,
          offset: b.offset,
          limit: b.limit,
          items: queue.slice(b.offset, b.offset + b.limit).map((n) => ({
            id: n.id,
            supplier: n.supplier_name,
            reference: n.data.reference,
            dueDate: n.data.dueDate,
            invoiceDate: n.data.invoiceDate,
            gross: totals(n.data).gross,
            currency: "GBP",
            state: n.state,
            version: n.version,
            owner:
              n.state === "verify"
                ? n.route?.verifierId
                : n.route?.approverIds[n.route.step],
            attention:
              !totals(n.data).matches ||
              !n.document_ready ||
              !!n.correction_reason,
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async policies(i: Identity, entityId: string) {
    return this.db.$transaction(async (tx) => {
      await this.permission(tx, i, entityId, "manage");
      const rows =
        await tx.$queryRaw`SELECT version,draft,published,published_version AS "publishedVersion" FROM "ApPolicy" WHERE organisation_id=${i.organisationId}::uuid AND entity_id=${entityId}::uuid`;
      return { item: (rows as unknown[])[0] || null };
    });
  }
  private async assignees(tx: Tx, i: Identity, entityId: string, p: Policy) {
    for (const r of [...p.rules, p.fallback]) {
      if (r.verifierId)
        await this.permission(
          tx,
          { ...i, userId: r.verifierId },
          entityId,
          "verify",
        );
      for (const a of r.approverIds)
        await this.permission(tx, { ...i, userId: a }, entityId, "approve");
    }
  }
  async policy(
    i: Identity,
    b: {
      operationId: string;
      entityId: string;
      expectedVersion: number;
      publish: boolean;
      definition: Policy;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      await this.permission(tx, i, b.entityId, "manage");
      await this.serial(tx, `ap-policy:${i.organisationId}:${b.entityId}`);
      return this.once(tx, i, b.operationId, b, async () => {
        await this.assignees(tx, i, b.entityId, b.definition);
        const rows = await tx.$queryRaw<
          { version: number }[]
        >`SELECT version FROM "ApPolicy" WHERE organisation_id=${i.organisationId}::uuid AND entity_id=${b.entityId}::uuid`;
        if ((rows[0]?.version || 0) !== b.expectedVersion) throw conflict();
        const v = b.expectedVersion + 1;
        await tx.$executeRaw`INSERT INTO "ApPolicy"(organisation_id,entity_id,version,draft) VALUES(${i.organisationId}::uuid,${b.entityId}::uuid,${v},${JSON.stringify(b.definition)}::jsonb) ON CONFLICT(organisation_id,entity_id) DO UPDATE SET version=EXCLUDED.version,draft=EXCLUDED.draft`;
        if (b.publish)
          await tx.$executeRaw`UPDATE "ApPolicy" SET published=draft,published_version=version,published_by=${i.userId}::uuid,published_at=now() WHERE organisation_id=${i.organisationId}::uuid AND entity_id=${b.entityId}::uuid`;
        await recordAudit(
          tx,
          i,
          b.publish ? "payables.policy-published" : "payables.policy-saved",
          b.entityId,
          b.entityId,
          { version: v },
        );
        return { version: v };
      });
    });
  }
  async action(
    i: Identity,
    id: string,
    b: {
      operationId: string;
      expectedVersion: number;
      action: string;
      reason?: string;
    },
    context?: { entityId: string; channel: "assistant" },
  ) {
    return this.db.$transaction(async (tx) => {
      const n = await this.invoice(
        tx,
        i,
        id,
        b.action === "review" || b.action === "correction"
          ? "review"
          : b.action === "verify"
            ? "verify"
            : b.action === "approve"
              ? "approve"
              : "view",
      );
      if (context && n.entity_id !== context.entityId) throw missing();
      return this.once(
        tx,
        i,
        b.operationId,
        context ? { id, ...b, context } : { id, ...b },
        async () => {
          if (n.version !== b.expectedVersion) throw conflict();
          if (
            ["challenge", "reject", "correction"].includes(b.action) &&
            !b.reason?.trim()
          )
            throw new ApiError(422, "REASON_REQUIRED", "A reason is required.");
          let state = n.state,
            route = n.route;
          if (b.action === "correction") {
            if (state !== "review") throw conflict();
            await tx.$executeRaw`UPDATE "ApInvoice" SET correction_reason=${b.reason!},version=version+1,updated_at=now() WHERE id=${id}::uuid`;
            n.version++;
            n.correction_reason = b.reason!;
            await this.event(
              tx,
              i,
              n,
              "correction",
              b.reason,
              context ? { origin: "assistant" } : undefined,
            );
            return { id, state, version: n.version };
          }
          if (b.action === "review") {
            if (n.correction_reason)
              throw new ApiError(
                422,
                "CORRECTION_REQUIRED",
                "Save corrected invoice details before submitting the requested correction.",
              );
            if (state !== "review") throw conflict();
            await this.checkSupplier(tx, i, n.entity_id, n.supplier_id);
            if (!totals(n.data).matches)
              throw new ApiError(
                422,
                "TOTAL_MISMATCH",
                "Declared total differs from calculated lines. Correct the fields before submitting.",
              );
            const docs =
              await tx.$queryRaw`SELECT scan_state FROM "ApDocument" WHERE invoice_id=${id}::uuid ORDER BY revision DESC,id DESC LIMIT 1`;
            if (
              (docs as { scan_state: string }[])[0]?.scan_state !==
                "synthetic" &&
              (docs as { scan_state: string }[])[0]?.scan_state !== "clean"
            )
              throw new ApiError(
                422,
                "DOCUMENT_QUARANTINED",
                "A cleared original PDF is required. Configure the scanner and rescan quarantined documents.",
              );
            const p = await tx.$queryRaw<
              { published: Policy; published_version: number }[]
            >`SELECT published,published_version FROM "ApPolicy" WHERE organisation_id=${i.organisationId}::uuid AND entity_id=${n.entity_id}::uuid FOR SHARE`;
            if (!p[0]?.published)
              throw new ApiError(
                422,
                "POLICY_REQUIRED",
                "Publish an approval policy first.",
              );
            await this.assignees(tx, i, n.entity_id, p[0].published);
            route = routePolicy(
              p[0].published,
              totals(n.data).gross,
              p[0].published_version,
              i.userId,
            );
            state = route.verified ? "approve" : "verify";
          } else {
            if (!route) throw conflict();
            if (state === "verify") {
              if (route.verifierId !== i.userId)
                throw new ApiError(
                  403,
                  "FORBIDDEN",
                  "Only the assigned verifier can decide.",
                );
              await this.permission(tx, i, n.entity_id, "verify");
              if (b.action === "verify") {
                route = { ...route, verified: true };
                state = "approve";
              } else if (b.action !== "challenge") throw conflict();
            } else if (state === "approve") {
              if (
                route.approverIds[route.step] !== i.userId ||
                route.submittedBy === i.userId
              )
                throw new ApiError(
                  403,
                  "FORBIDDEN",
                  "Only the current assigned approver can decide.",
                );
              await this.permission(tx, i, n.entity_id, "approve");
              if (b.action === "approve") {
                route = { ...route, step: route.step + 1 };
                if (route.step === route.approverIds.length) {
                  for (const actor of route.approverIds)
                    await this.permission(
                      tx,
                      { ...i, userId: actor },
                      n.entity_id,
                      "approve",
                    );
                  state = "approved";
                }
              } else if (
                !["challenge", "reject", "correction"].includes(b.action)
              )
                throw conflict();
            } else throw conflict();
            if (b.action === "challenge") {
              state = "review";
              route = null;
              n.revision++;
            }
            if (b.action === "reject") state = "rejected";
          }
          await tx.$executeRaw`UPDATE "ApInvoice" SET state=${state},route=${JSON.stringify(route)}::jsonb,revision=${n.revision},version=version+1,updated_at=now() WHERE id=${id}::uuid`;
          n.version++;
          n.route = route;
          n.state = state;
          await this.event(
            tx,
            i,
            n,
            b.action,
            b.reason,
            context ? { origin: "assistant" } : undefined,
          );
          return { id, state, version: n.version };
        },
      );
    });
  }
  private async scanPdf(bytes: Buffer) {
    const names = bytes
      .toString("latin1")
      .replace(/#([0-9a-f]{2})/gi, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    if (/\/Encrypt(?:[\s\/<>{}\[\]()%]|$)/.test(names))
      return {
        status: "quarantined" as const,
        engine: "unsupported-encrypted-pdf",
        scannedAt: null,
      };
    return this.scanner.scan(bytes);
  }
  async uploadAllowed(i: Identity, id: string, entityId: string) {
    return this.db.$transaction(async (tx) => {
      const n = await this.invoice(tx, i, id, "review");
      if (n.entity_id !== entityId) throw missing();
    });
  }
  async upload(
    i: Identity,
    id: string,
    b: {
      entityId: string;
      operationId: string;
      expectedVersion: number;
      filename: string;
    },
    bytes: Buffer,
    synthetic: boolean,
  ) {
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length < 10 ||
      bytes.length > 1048576 ||
      !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
      !bytes.subarray(-1024).includes(Buffer.from("%%EOF"))
    )
      throw new ApiError(
        422,
        "INVALID_PDF",
        "Upload a complete PDF of at most 1 MiB.",
      );
    await this.uploadAllowed(i, id, b.entityId);
    const scan = synthetic
      ? {
          status: "synthetic",
          engine: "allowlisted-test-fixture",
          scannedAt: new Date().toISOString(),
        }
      : await this.scanPdf(bytes);
    return this.db.$transaction(async (tx) => {
      const n = await this.invoice(tx, i, id, "review");
      if (n.entity_id !== b.entityId) throw missing();
      const digest = createHash("sha256").update(bytes).digest("hex");
      return this.once(tx, i, b.operationId, { id, ...b, digest }, async () => {
        if (n.version !== b.expectedVersion || n.state === "rejected")
          throw conflict();
        const capacity = await tx.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM "ApDocument" WHERE invoice_id=${id}::uuid`;
        if (capacity[0].count >= 20)
          throw new ApiError(
            409,
            "DOCUMENT_LIMIT",
            "This invoice has reached its 20-document limit.",
          );
        const documentId = randomUUID();
        await tx.$executeRaw`INSERT INTO "ApDocument"(id,organisation_id,entity_id,invoice_id,revision,bytes,digest,filename,scan_state,scan_result,uploader_id) VALUES(${documentId}::uuid,${i.organisationId}::uuid,${n.entity_id}::uuid,${id}::uuid,${n.revision + 1},${bytes},${digest},${b.filename},${scan.status},${JSON.stringify(scan)}::jsonb,${i.userId}::uuid)`;
        await tx.$executeRaw`UPDATE "ApInvoice" SET revision=revision+1,version=version+1,state='review',route=NULL,updated_at=now() WHERE id=${id}::uuid`;
        n.revision++;
        n.version++;
        n.route = null;
        n.state = "review";
        await this.event(tx, i, n, "document-added", scan.status, {
          documentId,
          digest,
          scan,
        });
        return {
          id: documentId,
          scanState: scan.status,
        };
      });
    });
  }
  async rescan(
    i: Identity,
    id: string,
    documentId: string,
    b: { operationId: string; expectedVersion: number },
  ) {
    const source = await this.db.$transaction(async (tx) => {
      await this.invoice(tx, i, id, "review");
      const rows = await tx.$queryRaw<
        { bytes: Buffer }[]
      >`SELECT bytes FROM "ApDocument" WHERE id=${documentId}::uuid AND invoice_id=${id}::uuid`;
      if (!rows[0]) throw missing();
      return Buffer.from(rows[0].bytes);
    });
    const scan = await this.scanPdf(source);
    return this.db.$transaction(async (tx) => {
      const n = await this.invoice(tx, i, id, "review");
      return this.once(
        tx,
        i,
        b.operationId,
        { id, documentId, ...b },
        async () => {
          if (n.version !== b.expectedVersion || n.state === "rejected")
            throw conflict();
          await tx.$executeRaw`UPDATE "ApDocument" SET scan_state=${scan.status},scan_result=${JSON.stringify(scan)}::jsonb WHERE id=${documentId}::uuid AND invoice_id=${id}::uuid`;
          await tx.$executeRaw`UPDATE "ApInvoice" SET version=version+1,revision=revision+1,state='review',route=NULL,updated_at=now() WHERE id=${id}::uuid`;
          n.version++;
          n.revision++;
          n.route = null;
          n.state = "review";
          await this.event(tx, i, n, "document-scanned", scan.status, {
            documentId,
            scan,
          });
          return { id: documentId, scanState: scan.status };
        },
      );
    });
  }
  async document(i: Identity, id: string, documentId: string) {
    return this.db.$transaction(async (tx) => {
      await this.invoice(tx, i, id);
      const rows = await tx.$queryRaw<
        { bytes: Buffer; scan_state: string }[]
      >`SELECT bytes,scan_state FROM "ApDocument" WHERE id=${documentId}::uuid AND invoice_id=${id}::uuid`;
      if (!rows[0]) throw missing();
      if (rows[0].scan_state !== "synthetic" && rows[0].scan_state !== "clean")
        throw new ApiError(
          409,
          "DOCUMENT_QUARANTINED",
          "Document is quarantined pending scanning.",
        );
      return Buffer.from(rows[0].bytes);
    });
  }
  async export(
    i: Identity,
    id: string,
    b: { operationId: string; expectedVersion: number },
    context?: { entityId: string; channel: "assistant" },
  ) {
    return this.db.$transaction(async (tx) => {
      const n = await this.invoice(tx, i, id, "review");
      if (context && n.entity_id !== context.entityId) throw missing();
      return this.once(
        tx,
        i,
        b.operationId,
        context ? { id, ...b, context } : { id, ...b },
        async () => {
          if (n.version !== b.expectedVersion || n.state !== "approved")
            throw conflict();
          const old = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM "ApExport" WHERE invoice_id=${id}::uuid AND revision=${n.revision}`;
          if (old[0]) return old[0];
          const exportId = randomUUID(),
            bytes = Buffer.from(csv(n.data, n.revision)),
            digest = createHash("sha256").update(bytes).digest("hex");
          await tx.$executeRaw`INSERT INTO "ApExport"(id,organisation_id,entity_id,invoice_id,revision,bytes,digest,actor_id) VALUES(${exportId}::uuid,${i.organisationId}::uuid,${n.entity_id}::uuid,${id}::uuid,${n.revision},${bytes},${digest},${i.userId}::uuid)`;
          await this.event(
            tx,
            i,
            n,
            "exported",
            undefined,
            context ? { origin: "assistant" } : undefined,
          );
          return { id: exportId };
        },
      );
    });
  }
  async exportFile(i: Identity, id: string) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { entity_id: string; bytes: Buffer }[]
      >`SELECT entity_id,bytes FROM "ApExport" WHERE id=${id}::uuid AND organisation_id=${i.organisationId}::uuid`;
      if (!rows[0]) throw missing();
      await this.permission(tx, i, rows[0].entity_id);
      return Buffer.from(rows[0].bytes);
    });
  }
}
