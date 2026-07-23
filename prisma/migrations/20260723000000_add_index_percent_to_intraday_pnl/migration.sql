-- Add index benchmark percent columns to IntradayPnL table
-- nifty50Percent: Nifty 50 % change co-stored at each intraday P/L snapshot
-- n500m50Percent: Nifty500 Momentum 50 % change co-stored at each intraday P/L snapshot
-- Both nullable for backward compatibility with existing rows

ALTER TABLE "IntradayPnL" ADD COLUMN "nifty50Percent" REAL;
ALTER TABLE "IntradayPnL" ADD COLUMN "n500m50Percent" REAL;
