import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Database } from "../database";
import type { Identity } from "../config";
import { ApiError } from "../errors";
import { recordAudit } from "../audit";
import { requireImport } from "../workspace/permissions";
import { ReceivablesRepository, safeNumber } from "./repository";
import { parseRegister, registerDigest } from "./validation";
export const BROWSER_IMPORT_BYTES = 1024 * 1024;
const unavailable = () =>
  new ApiError(404, "NOT_FOUND", "Preview unavailable or expired.");
@Injectable()
export class ReceivablesImportService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(ReceivablesRepository) private repo: ReceivablesRepository,
  ) {}
  async preview(
    identity: Identity,
    sessionHash: string,
    entityId: string,
    expectedVersion: number,
    bytes: Buffer,
  ) {
    if (bytes.length > BROWSER_IMPORT_BYTES)
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        "Browser imports support at most 1 MiB. Use the trusted CLI for larger files.",
      );
    const input = parseRegister(bytes),
      digest = registerDigest(input),
      rows = input.invoices.filter(
        (v) => v.status !== "Draft" && v.paidCents < v.amountCents,
      ),
      invoiceCount = rows.length,
      customerCount = new Set(rows.map((v) => v.customerId)).size,
      totalCents = safeNumber(
        rows.reduce(
          (n, r) => n + BigInt(r.amountCents) - BigInt(r.paidCents),
          0n,
        ),
      );
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`preview:${identity.organisationId}:${identity.userId}`},0))`;
        await requireImport(tx, identity, entityId);
        if (
          (await tx.receivableImportStage.count({
            where: {
              organisationId: identity.organisationId,
              actorId: identity.userId,
              appliedVersion: null,
              expiresAt: { gt: new Date() },
            },
          })) >= 2
        )
          throw new ApiError(
            409,
            "CAPACITY_REACHED",
            "Discard an earlier preview or wait for it to expire before uploading another.",
          );
        const dry = await this.repo.import(
            identity,
            entityId,
            expectedVersion,
            input,
            false,
            tx,
          ),
          id = randomUUID(),
          expiresAt = new Date(Date.now() + 15 * 60000);
        await tx.receivableImportStage.create({
          data: {
            id,
            organisationId: identity.organisationId,
            entityId,
            actorId: identity.userId,
            sessionHash,
            expectedVersion,
            nextVersion: dry.version,
            digest,
            content: Buffer.from(JSON.stringify(input)),
            rowCount: input.invoices.length,
            invoiceCount,
            customerCount,
            totalCents: BigInt(totalCents),
            sourceName: input.sourceName,
            sourceCapturedAt: new Date(input.sourceCapturedAt),
            expiresAt,
          },
        });
        await recordAudit(
          tx,
          identity,
          "receivables.preview_created",
          id,
          entityId,
          { rowCount: input.invoices.length, nextVersion: dry.version },
        );
        return {
          stageId: id,
          entityId,
          expectedVersion,
          nextVersion: dry.version,
          digest,
          sourceName: input.sourceName,
          sourceCapturedAt: input.sourceCapturedAt,
          expiresAt: expiresAt.toISOString(),
          rowCount: input.invoices.length,
          invoiceCount,
          customerCount,
          totalCents,
        };
      },
      { timeout: 30000, maxWait: 15000 },
    );
  }
  async apply(
    identity: Identity,
    sessionHash: string,
    id: string,
    input: { expectedVersion: number; confirmDigest: string },
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ReceivableImportStage" WHERE id=${id}::uuid AND organisation_id=${identity.organisationId}::uuid AND actor_id=${identity.userId}::uuid AND session_hash=${sessionHash} FOR UPDATE`;
        const stage = await tx.receivableImportStage.findFirst({
          where: {
            id,
            organisationId: identity.organisationId,
            actorId: identity.userId,
            sessionHash,
            expiresAt: { gt: new Date() },
          },
        });
        if (!stage) throw unavailable();
        await requireImport(tx, identity, stage.entityId);
        if (
          stage.expectedVersion !== input.expectedVersion ||
          stage.digest !== input.confirmDigest
        )
          throw new ApiError(
            409,
            "VERSION_CONFLICT",
            "The preview confirmation does not match. Review a new preview.",
          );
        if (stage.appliedVersion !== null) {
          const current = await tx.receivableSnapshot.findFirst({
            where: {
              organisationId: identity.organisationId,
              entityId: stage.entityId,
            },
            orderBy: { version: "desc" },
          });
          if (
            current?.digest !== stage.digest ||
            current.version !== stage.appliedVersion
          )
            throw new ApiError(
              409,
              "VERSION_CONFLICT",
              "A newer source is current. Review import history.",
            );
          return {
            status: "unchanged",
            version: stage.appliedVersion,
            rowCount: stage.rowCount,
          };
        }
        const result = await this.repo.import(
          identity,
          stage.entityId,
          stage.expectedVersion,
          parseRegister(Buffer.from(stage.content)),
          true,
          tx,
        );
        if (!["imported", "unchanged"].includes(result.status))
          throw new Error("Unexpected import result.");
        await tx.receivableImportStage.update({
          where: { id },
          data: { appliedVersion: result.version, content: Buffer.alloc(0) },
        });
        await recordAudit(
          tx,
          identity,
          "receivables.preview_applied",
          id,
          stage.entityId,
          { version: result.version, rowCount: stage.rowCount },
        );
        return result;
      },
      { timeout: 30000, maxWait: 15000 },
    );
  }
  async discard(identity: Identity, sessionHash: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const stage = await tx.receivableImportStage.findFirst({
        where: {
          id,
          organisationId: identity.organisationId,
          actorId: identity.userId,
          sessionHash,
        },
      });
      if (!stage) throw unavailable();
      await requireImport(tx, identity, stage.entityId);
      await tx.receivableImportStage.delete({ where: { id } });
      await recordAudit(
        tx,
        identity,
        "receivables.preview_discarded",
        id,
        stage.entityId,
      );
      return { status: "discarded" };
    });
  }
}
