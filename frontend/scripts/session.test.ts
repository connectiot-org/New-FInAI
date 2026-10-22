import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionChanged,
  sessionExpired,
  sessionRevision,
} from "../src/lib/session-lifecycle.ts";
test("an old unauthorized reply cannot expire a new session and current expiry is delivered once", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const browser = new EventTarget();
  let expirations = 0;
  browser.addEventListener("finai:session-expired", () => expirations++);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: browser,
  });
  try {
    const oldRequest = sessionRevision();
    sessionChanged(); // Sign-in completed while the old request was pending.
    sessionExpired(oldRequest);
    assert.equal(expirations, 0);
    const currentRequest = sessionRevision();
    sessionExpired(currentRequest);
    assert.equal(expirations, 1);
    sessionExpired(currentRequest);
    assert.equal(expirations, 1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
