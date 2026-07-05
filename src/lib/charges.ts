// ============================================================================
// CHARGES & TAX CALCULATIONS — Zerodha Delivery Equity (NSE)
// ============================================================================
// Verified against Zerodha brokerage calculator sample:
//   Buy 1000 @ ₹100 (₹1L), Sell 1000 @ ₹100 (₹1L) → Total charges = ₹222.48
//
// Rates (Delivery Equity):
//   Brokerage:          ₹0 (Zerodha delivery is free)
//   STT:                0.1% on buy turnover + 0.1% on sell turnover
//   Exchange txn:       0.00308% on total turnover (NSE)
//   SEBI charges:       ₹10 per crore of total turnover
//   Stamp duty:         0.015% on buy turnover only
//   GST:                18% on (brokerage + exchange txn charge + SEBI charges)
// ============================================================================

export interface ChargesBreakdown {
    brokerage: number;
    stt: number;               // Securities Transaction Tax
    exchangeTxnCharge: number; // Exchange transaction charge
    gst: number;               // GST on (brokerage + exchange txn + SEBI)
    sebiCharges: number;       // SEBI regulatory fee
    stampDuty: number;         // Stamp duty (buy side only)
    totalCharges: number;
}

export interface TaxBreakdown {
    type: 'STCG' | 'LTCG' | 'NONE'; // NONE when gain <= 0
    rate: number;                     // 0.20 for STCG, 0.125 for LTCG
    taxAmount: number;
}

// ---------------------------------------------------------------------------
// Brokerage & Statutory Charges
// ---------------------------------------------------------------------------

/**
 * Calculate Zerodha delivery equity charges for a completed trade cycle.
 *
 * @param buyValue   Total buy-side turnover (qty × avg buy price)
 * @param sellValue  Total sell-side turnover (qty × avg sell price)
 */
export function calculateBrokerageCharges(
    buyValue: number,
    sellValue: number
): ChargesBreakdown {
    const totalTurnover = buyValue + sellValue;

    // Brokerage: ₹0 for Zerodha delivery
    const brokerage = 0;

    // STT: 0.1% on buy + 0.1% on sell (delivery equity)
    const stt = (buyValue * 0.001) + (sellValue * 0.001);

    // Exchange transaction charge: 0.00308% of total turnover (NSE)
    const exchangeTxnCharge = totalTurnover * 0.0000308;

    // SEBI charges: ₹10 per crore = 0.000001 of total turnover
    const sebiCharges = totalTurnover * 0.000001;

    // GST: 18% on (brokerage + exchange txn charge + SEBI charges)
    const gst = (brokerage + exchangeTxnCharge + sebiCharges) * 0.18;

    // Stamp duty: 0.015% on buy-side turnover only
    const stampDuty = buyValue * 0.00015;

    const totalCharges =
        brokerage +
        stt +
        exchangeTxnCharge +
        gst +
        sebiCharges +
        stampDuty;

    return {
        brokerage,
        stt,
        exchangeTxnCharge,
        gst,
        sebiCharges,
        stampDuty,
        totalCharges,
    };
}

// ---------------------------------------------------------------------------
// Capital Gains Tax
// ---------------------------------------------------------------------------

const STCG_RATE = 0.20;   // 20% — holding ≤ 365 days
const LTCG_RATE = 0.125;  // 12.5% — holding > 365 days

/**
 * Calculate capital gains tax on an exit.
 * No LTCG exemption is applied (simplified flat-rate model).
 *
 * @param gainLoss  Raw profit/loss (sell proceeds − cost basis)
 * @param holdDays  Weighted holding period in days
 */
export function calculateCapitalGainsTax(
    gainLoss: number,
    holdDays: number
): TaxBreakdown {
    // No tax on losses
    if (gainLoss <= 0) {
        return { type: 'NONE', rate: 0, taxAmount: 0 };
    }

    if (holdDays > 365) {
        return {
            type: 'LTCG',
            rate: LTCG_RATE,
            taxAmount: gainLoss * LTCG_RATE,
        };
    }

    return {
        type: 'STCG',
        rate: STCG_RATE,
        taxAmount: gainLoss * STCG_RATE,
    };
}

// ---------------------------------------------------------------------------
// Net Portfolio-Level Capital Gains Tax (with loss offset)
// ---------------------------------------------------------------------------
// Indian tax rules:
//   STCL (short-term loss) can offset STCG first, then any remaining offsets LTCG
//   LTCL (long-term  loss) can offset LTCG only
// ---------------------------------------------------------------------------

export interface NetTaxSummary {
    // Gross buckets
    grossStcgGains: number;   // Sum of gains held ≤ 365 days
    grossStcgLosses: number;  // Sum of losses held ≤ 365 days (positive magnitude)
    grossLtcgGains: number;   // Sum of gains held > 365 days
    grossLtcgLosses: number;  // Sum of losses held > 365 days (positive magnitude)
    // Net taxable amounts after offsets
    netTaxableStcg: number;   // taxable STCG after STCL offset
    netTaxableLtcg: number;   // taxable LTCG after LTCL + leftover STCL offset
    // Tax
    stcgTax: number;
    ltcgTax: number;
    totalTax: number;
}

/**
 * Compute portfolio-level capital gains tax accounting for loss offsets.
 * Accepts a lightweight array — avoids circular dependency with exits.ts.
 *
 * @param entries  Array of { gainLoss, timeHeld } from all completed exits
 */
export function calculateNetCapitalGainsTax(
    entries: { gainLoss: number; timeHeld: number }[]
): NetTaxSummary {
    let grossStcgGains = 0;
    let grossStcgLosses = 0; // stored as positive magnitude
    let grossLtcgGains = 0;
    let grossLtcgLosses = 0; // stored as positive magnitude

    for (const { gainLoss, timeHeld } of entries) {
        const isLong = timeHeld > 365;
        if (gainLoss >= 0) {
            if (isLong) grossLtcgGains += gainLoss;
            else grossStcgGains += gainLoss;
        } else {
            // Store as positive magnitude for clarity
            if (isLong) grossLtcgLosses += -gainLoss;
            else grossStcgLosses += -gainLoss;
        }
    }

    // Step 1: net STCG after STCL
    const netStcg = grossStcgGains - grossStcgLosses;
    // Leftover STCL after exhausting STCG (can offset LTCG)
    const leftoverStcl = netStcg < 0 ? -netStcg : 0;
    const netTaxableStcg = Math.max(0, netStcg);

    // Step 2: net LTCG after LTCL, then apply any leftover STCL
    const netLtcgAfterLtcl = grossLtcgGains - grossLtcgLosses;
    const netLtcg = netLtcgAfterLtcl - leftoverStcl;
    const netTaxableLtcg = Math.max(0, netLtcg);

    const stcgTax = netTaxableStcg * STCG_RATE;
    const ltcgTax = netTaxableLtcg * LTCG_RATE;

    return {
        grossStcgGains,
        grossStcgLosses,
        grossLtcgGains,
        grossLtcgLosses,
        netTaxableStcg,
        netTaxableLtcg,
        stcgTax,
        ltcgTax,
        totalTax: stcgTax + ltcgTax,
    };
}
