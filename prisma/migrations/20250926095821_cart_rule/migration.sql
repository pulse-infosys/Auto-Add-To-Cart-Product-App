-- CreateTable
CREATE TABLE "CartRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minCartValue" REAL NOT NULL,
    "maxCartValue" REAL,
    "hasUpperLimit" BOOLEAN NOT NULL DEFAULT false,
    "actionType" TEXT NOT NULL,
    "productIds" TEXT NOT NULL,
    "worksInReverse" BOOLEAN NOT NULL DEFAULT false,
    "allowMultipleTriggers" BOOLEAN NOT NULL DEFAULT false,
    "executeOncePerSession" BOOLEAN NOT NULL DEFAULT false,
    "preventQuantityChanges" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RuleExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "sessionId" TEXT,
    "cartId" TEXT,
    "executed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CartRule_shop_idx" ON "CartRule"("shop");

-- CreateIndex
CREATE INDEX "RuleExecution_shop_sessionId_idx" ON "RuleExecution"("shop", "sessionId");

-- CreateIndex
CREATE INDEX "RuleExecution_shop_cartId_idx" ON "RuleExecution"("shop", "cartId");
