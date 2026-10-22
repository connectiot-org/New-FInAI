import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import * as argon2 from "argon2";
import type { Request, Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "./errors";
import { parse, uuid } from "./validation";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};
const cookieName = "__Host-finai_session";
const denied = () =>
  new ApiError(401, "UNAUTHENTICATED", "Sign-in failed or session expired.");
export class Auth {
  constructor(private db: PrismaClient) {}
  async limit(key: string, maximum: number, seconds: number) {
    const hash = digest(key),
      window = new Date(
        Math.floor(Date.now() / (seconds * 1000)) * seconds * 1000,
      );
    const rows = await this.db.$queryRaw<
      { count: number }[]
    >`INSERT INTO "RateLimit" (key, "window", count) VALUES (${hash},${window},1) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateLimit"."window"=EXCLUDED."window" THEN "RateLimit".count+1 ELSE 1 END, "window"=EXCLUDED."window" RETURNING count`;
    if (rows[0].count > maximum)
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many requests. Try again later.",
      );
  }
  token(req: Request) {
    return (
      req.headers.cookie
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1) || ""
    );
  }
  cookie(res: Response, token: string, maxAge = 28800) {
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`,
    );
  }
  async session(req: Request) {
    const token = this.token(req);
    if (!/^[a-f0-9]{64}$/.test(token)) throw denied();
    const session = await this.db.session.findUnique({
      where: { tokenHash: digest(token) },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) throw denied();
    const account = await this.db.account.findUnique({
      where: { userId: session.userId },
    });
    const member = await this.db.membership.findUnique({
      where: {
        organisationId_userId: {
          organisationId: session.organisationId,
          userId: session.userId,
        },
      },
    });
    if (!account || account.disabled || !member?.active) throw denied();
    return session;
  }
  async login(req: Request, res: Response) {
    const input = parse(
      z.strictObject({
        username: z.string().min(1).max(100),
        password: z.string().min(1).max(1024),
        organisationId: uuid,
      }),
      req.body,
    );
    await this.limit(
      `login-ip:${req.headers["x-finai-client-ip"] || "unknown"}`,
      30,
      900,
    );
    await this.limit(`login-account:${input.username.toLowerCase()}`, 10, 900);
    const account = await this.db.account.findUnique({
      where: { username: input.username.toLowerCase() },
    });
    // A shared budget bounds expensive Argon2 work across rotating IPs/accounts.
    await this.limit("login-global", 60, 60);
    // Always pay the Argon2 cost, including unknown accounts.
    const valid = account
      ? await argon2.verify(account.passwordHash, input.password)
      : (await argon2.hash(input.password, passwordOptions), false);
    if (!valid || !account || account.disabled) throw denied();
    const member = await this.db.membership.findUnique({
      where: {
        organisationId_userId: {
          organisationId: input.organisationId,
          userId: account.userId,
        },
      },
    });
    if (!member?.active) throw denied();
    const token = randomBytes(32).toString("hex");
    // Derive token only for its owner; store a digest and return through same-origin JSON.
    const csrf = digest(`csrf:${token}`);
    await this.db.$transaction(async (tx) => {
      // Serialize against administrative password reset/disable updates. If reset
      // won while Argon2 was verifying, the old proof must not create a session.
      const current = await tx.$queryRaw<
        { passwordHash: string; disabled: boolean }[]
      >`SELECT "passwordHash", disabled FROM "Account" WHERE "userId"=${account.userId}::uuid FOR SHARE`;
      if (
        !current[0] ||
        current[0].disabled ||
        current[0].passwordHash !== account.passwordHash
      )
        throw denied();
      await tx.session.deleteMany({
        where: { tokenHash: digest(this.token(req)) },
      });
      await tx.session.create({
        data: {
          tokenHash: digest(token),
          userId: account.userId,
          organisationId: input.organisationId,
          csrfHash: digest(csrf),
          expiresAt: new Date(Date.now() + 8 * 3600000),
        },
      });
    });
    this.cookie(res, token);
    res.json({ csrfToken: csrf });
  }
  csrf(req: Request, session: { csrfHash: string }) {
    const value = req.headers["x-csrf-token"];
    if (typeof value !== "string" || !equal(digest(value), session.csrfHash))
      throw new ApiError(403, "FORBIDDEN", "Invalid CSRF token.");
  }
  async logout(req: Request, res: Response) {
    await this.db.session.deleteMany({
      where: { tokenHash: digest(this.token(req)) },
    });
    this.cookie(res, "", 0);
    res.json({ status: "signed-out" });
  }
}
