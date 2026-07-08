-- CreateTable
CREATE TABLE "Dividend" (
    "id"          SERIAL       NOT NULL,
    "isin"        TEXT         NOT NULL,
    "symbol"      TEXT,
    "exDate"      TIMESTAMP(3) NOT NULL,
    "payDate"     TIMESTAMP(3),
    "amount"      DOUBLE PRECISION NOT NULL,
    "dps"         DOUBLE PRECISION,
    "quantity"    DOUBLE PRECISION,
    "fiscalYear"  TEXT         NOT NULL,
    "quarter"     TEXT,
    "source"      TEXT         NOT NULL DEFAULT 'zerodha_taxpnl',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (dedup key)
CREATE UNIQUE INDEX "Dividend_isin_exDate_key" ON "Dividend"("isin", "exDate");

-- CreateIndex
CREATE INDEX "Dividend_isin_idx"       ON "Dividend"("isin");
CREATE INDEX "Dividend_symbol_idx"     ON "Dividend"("symbol");
CREATE INDEX "Dividend_fiscalYear_idx" ON "Dividend"("fiscalYear");
CREATE INDEX "Dividend_exDate_idx"     ON "Dividend"("exDate");
