import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { ClamAvScanner } from "../src/payables/scanner";
const close = (server: Server) =>
  new Promise<void>((resolve) => server.close(() => resolve()));
test("scanner fails closed when unconfigured or unreachable", async () => {
  assert.equal(
    (await new ClamAvScanner({}).scan(Buffer.from("test"))).status,
    "quarantined",
  );
  assert.equal(
    (
      await new ClamAvScanner({
        AP_CLAMD_HOST: "127.0.0.1",
        AP_CLAMD_PORT: "1",
      }).scan(Buffer.from("test"))
    ).status,
    "quarantined",
  );
});
test("controlled ClamAV protocol verifies framing, clean/infected verdicts and signature age", async () => {
  let stale = false,
    infected = false,
    received = Buffer.alloc(0);
  const server = createServer((socket) => {
    let input = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      input = Buffer.concat([input, chunk]);
      if (input.subarray(0, 9).toString() === "zVERSION\0") {
        socket.end(
          `ClamAV 1.5.1/12345/${stale ? "Mon Jan 01 00:00:00 2001" : new Date().toUTCString()}\0`,
        );
        return;
      }
      if (
        input.length < 10 ||
        input.subarray(0, 10).toString() !== "zINSTREAM\0"
      )
        return;
      let offset = 10;
      const chunks: Buffer[] = [];
      while (offset + 4 <= input.length) {
        const length = input.readUInt32BE(offset);
        offset += 4;
        if (!length) {
          received = Buffer.concat(chunks);
          socket.end(
            infected ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0",
          );
          return;
        }
        if (offset + length > input.length) return;
        chunks.push(input.subarray(offset, offset + length));
        offset += length;
      }
    });
  });
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const scanner = new ClamAvScanner({
        AP_CLAMD_HOST: "127.0.0.1",
        AP_CLAMD_PORT: String((server.address() as { port: number }).port),
      }),
      bytes = Buffer.alloc(200000, 42);
    assert.equal((await scanner.scan(bytes)).status, "clean");
    assert.deepEqual(received, bytes);
    infected = true;
    assert.equal((await scanner.scan(bytes)).status, "infected");
    stale = true;
    assert.equal((await scanner.scan(bytes)).status, "quarantined");
  } finally {
    await close(server);
  }
});
