CREATE TABLE "Account" ("userId" uuid PRIMARY KEY REFERENCES "User"(id), username varchar(100) NOT NULL UNIQUE, "passwordHash" text NOT NULL, disabled boolean NOT NULL DEFAULT false);
CREATE TABLE "Session" ("tokenHash" char(64) PRIMARY KEY, "userId" uuid NOT NULL REFERENCES "Account"("userId") ON DELETE CASCADE, "organisationId" uuid NOT NULL REFERENCES "Organisation"(id), "csrfHash" char(64) NOT NULL, "expiresAt" timestamptz(3) NOT NULL);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "RateLimit" (key char(64) PRIMARY KEY, "window" timestamptz(3) NOT NULL, count integer NOT NULL);
