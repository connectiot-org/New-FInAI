// Administrative only: run on a trusted database host. Passwords never enter argv.
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { Database } from "../src/database";
import { passwordOptions } from "../src/auth";
const db = new Database();
async function password() {
  if (!process.stdin.isTTY)
    throw new Error(
      "A trusted interactive terminal is required for hidden password input.",
    );
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const ask = (prompt: string) =>
    new Promise<string>((resolve) => {
      muted = false;
      rl.question(prompt, (value) => {
        muted = false;
        process.stdout.write("\n");
        resolve(value);
      });
      muted = true;
    });
  try {
    const a = await ask("Password (hidden): "),
      b = await ask("Confirm (hidden): ");
    if (a !== b || a.length < 12 || a.length > 1024)
      throw new Error("Passwords must match and contain 12–1024 characters.");
    return a;
  } finally {
    rl.close();
  }
}
try {
  const [command, username, organisationId] = process.argv.slice(2);
  if (!username || !/^[a-z0-9._-]{1,100}$/.test(username))
    throw new Error("Use a lowercase account name.");
  if (command === "create") {
    if (!organisationId)
      throw new Error("Organisation UUID required; it must already exist.");
    const hash = await argon2.hash(await password(), passwordOptions),
      userId = randomUUID();
    await db.$transaction(async (tx) => {
      await tx.organisation.findUniqueOrThrow({
        where: { id: organisationId },
      });
      await tx.user.create({ data: { id: userId } });
      await tx.account.create({
        data: { userId, username, passwordHash: hash },
      });
      await tx.membership.create({ data: { userId, organisationId } });
    });
    console.log(
      "Account created without entity grants. Grant access separately using the existing EntityAccess policy.",
    );
  } else if (command === "reset" || command === "revoke") {
    const account = await db.account.findUniqueOrThrow({ where: { username } });
    const hash =
      command === "reset"
        ? await argon2.hash(await password(), passwordOptions)
        : undefined;
    await db.$transaction(async (tx) => {
      if (hash)
        await tx.account.update({
          where: { userId: account.userId },
          data: { passwordHash: hash },
        });
      await tx.session.deleteMany({ where: { userId: account.userId } });
    });
    console.log("Sessions revoked.");
  } else
    throw new Error(
      "Usage: accounts.mts create <username> <organisationId> | reset <username> | revoke <username>",
    );
} catch {
  console.error("Account operation failed. Check the command, secure terminal input and administrative database configuration.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
