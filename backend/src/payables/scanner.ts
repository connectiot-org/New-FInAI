import { createConnection } from "node:net";
export type ScanResult = {
  status: "clean" | "infected" | "quarantined";
  engine: string;
  scannedAt: string | null;
};
export interface DocumentScanner {
  scan(bytes: Buffer): Promise<ScanResult>;
}
/** ClamAV INSTREAM protocol. Configure a private trusted clamd endpoint; never a browser setting. */
export class ClamAvScanner implements DocumentScanner {
  private active = 0;
  private readonly host?: string;
  private readonly port: number;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.host = env.AP_CLAMD_HOST;
    this.port = Number(env.AP_CLAMD_PORT || 3310);
    if (
      this.host &&
      (!Number.isInteger(this.port) ||
        this.port < 1 ||
        this.port > 65535 ||
        !/^[a-zA-Z0-9.:-]+$/.test(this.host))
    )
      throw new Error("Invalid private AP scanner endpoint.");
  }
  async scan(bytes: Buffer): Promise<ScanResult> {
    const quarantined: ScanResult = {
      status: "quarantined",
      engine: "unavailable",
      scannedAt: null,
    };
    if (!this.host || this.active >= 4) return quarantined;
    this.active++;
    try {
      const version = await this.command(Buffer.from("zVERSION\0"));
      // Refuse stale or unidentifiable signatures. ClamAV VERSION includes engine/database/date.
      const parts = version.split("/");
      const signatureDate = Date.parse(parts.slice(2).join("/"));
      if (
        !version.startsWith("ClamAV ") ||
        !Number.isFinite(signatureDate) ||
        Date.now() - signatureDate > 7 * 86400000 ||
        signatureDate > Date.now() + 86400000
      )
        return quarantined;
      const chunks: Buffer[] = [Buffer.from("zINSTREAM\0")];
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        const chunk = bytes.subarray(offset, offset + 65536),
          size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        chunks.push(size, chunk);
      }
      chunks.push(Buffer.alloc(4));
      const result = await this.command(Buffer.concat(chunks));
      const status =
        result === "stream: OK"
          ? "clean"
          : /^stream: .+ FOUND$/.test(result)
            ? "infected"
            : "quarantined";
      return {
        status,
        engine: version.slice(0, 200),
        scannedAt: new Date().toISOString(),
      };
    } catch {
      return quarantined;
    } finally {
      this.active--;
    }
  }
  private command(bytes: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host!, port: this.port });
      let reply = Buffer.alloc(0),
        settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        socket.destroy();
        if (error) reject(error);
        else resolve(reply.toString("utf8").replace(/\0.*$/s, "").trim());
      };
      // Bound the whole command; partial replies must not extend a scan slot.
      const deadline = setTimeout(
        () => finish(new Error("Scanner timeout")),
        10000,
      );
      deadline.unref();
      socket.on("error", (error) => finish(error));
      socket.on("connect", () => socket.write(bytes));
      socket.on("data", (chunk) => {
        reply = Buffer.concat([reply, chunk]);
        if (reply.length > 2048)
          return finish(new Error("Invalid scanner response"));
        if (reply.includes(0)) finish();
      });
      socket.on("end", () => finish());
    });
  }
}
