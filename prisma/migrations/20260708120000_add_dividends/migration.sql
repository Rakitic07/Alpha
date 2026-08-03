-- CreateTable
CREATE TABLE IF NOT EXISTS "Dividend" (
    "id"          INTEGER      NOT NULL PRIMARY KEY AUTOINCREMENT,
    "isin"        TEXT         NOT NULL,
    "symbol"      TEXT,
    "exDate"      DATETIME     NOT NULL,
    "payDate"     DATETIME,
    "amount"      REAL         NOT NULL,
    "dps"         REAL,
    "quantity"    REAL,
    "fiscalYear"  TEXT         NOT NULL,
    "quarter"     TEXT,
    "source"      TEXT         NOT NULL DEFAULT 'zerodha_taxpnl',
    "createdAt"   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME     NOT NULL
);

-- CreateIndex (dedup key)
CREATE UNIQUE INDEX "Dividend_isin_exDate_key" ON "Dividend"("isin", "exDate");

-- CreateIndex
CREATE INDEX "Dividend_isin_idx"       ON "Dividend"("isin");
CREATE INDEX "Dividend_symbol_idx"     ON "Dividend"("symbol");
CREATE INDEX "Dividend_fiscalYear_idx" ON "Dividend"("fiscalYear");
CREATE INDEX "Dividend_exDate_idx"     ON "Dividend"("exDate");
