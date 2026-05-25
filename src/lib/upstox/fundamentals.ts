import { getAccessToken } from './auth';
import { UpstoxError } from './types';
import { getSymbolFromKey, getInstrumentKey } from './instruments';

export interface ParticularHistory {
  period: string;
  value: number;
}

export interface StatementRow {
  particular: string;
  history: ParticularHistory[];
}

export interface FinancialStatement {
  type: string;
  time_period: string;
  units_in: string;
  full_statement: StatementRow[];
  history?: {
    total_asset?: number;
    total_liability?: number;
    period: string;
    value?: number;
    change?: string;
  }[];
}

export interface ShareholdingHistory {
  period: string;
  percentage: number;
}

export interface ShareholdingPattern {
  category: string;
  history: ShareholdingHistory[];
}

export interface KeyRatio {
  name: string;
  company_value: string;
  sector_value: string;
}

export interface CorporateAction {
  name: string;
  expiry_date: string;
  amount: number | null;
  ratio: string | null;
  event_details: { key: string; value: string }[];
}

export interface CompetitorProfile {
  instrument_key: string;
  symbol?: string; // Resolved internally
  company_profile: string;
  sector: string;
  sector_market_cap_inr: { value: number; unit: string; formatted: string };
  sector_market_cap_usd: { value: number; unit: string; formatted: string };
}

export interface CompanyProfile {
  company_profile: string;
  sector: string;
  sector_market_cap_inr: { value: number; unit: string; formatted: string };
  sector_market_cap_usd: { value: number; unit: string; formatted: string };
}

export interface CompanyFundamentals {
  profile: CompanyProfile;
  balanceSheet: FinancialStatement;
  incomeStatement: FinancialStatement;
  cashFlow: FinancialStatement;
  balanceSheetQuarterly?: FinancialStatement;
  incomeStatementQuarterly?: FinancialStatement;
  cashFlowQuarterly?: FinancialStatement;
  shareHoldings: ShareholdingPattern[];
  keyRatios: KeyRatio[];
  corporateActions: CorporateAction[];
  competitors: CompetitorProfile[];
  isMock: boolean;
}

const BASE_URL = 'https://api.upstox.com/v2/fundamentals';

// ============================================================================
// Mock Database
// ============================================================================

const MOCK_DATA: Record<string, Omit<CompanyFundamentals, 'isMock'>> = {
  // Reliance Industries (INE002A01018)
  'INE002A01018': {
    profile: {
      company_profile: 'Reliance Industries Limited is an Indian multinational conglomerate, headquartered in Mumbai. It includes businesses across energy, petrochemicals, natural gas, retail, telecommunications, mass media, and textiles. Reliance is the largest public company in India by market cap and revenues.',
      sector: 'Refineries & Petrochemicals',
      sector_market_cap_inr: { value: 1684532, unit: 'crore', formatted: '16,84,532.00 Cr' },
      sector_market_cap_usd: { value: 202.1, unit: 'billion', formatted: '$202.10B' }
    },
    balanceSheet: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Total Share Capital',
          history: [{ period: 'Mar 2022', value: 6765 }, { period: 'Mar 2023', value: 6766 }, { period: 'Mar 2024', value: 6766 }, { period: 'Mar 2025', value: 6766 }]
        },
        {
          particular: 'Total Reserves',
          history: [{ period: 'Mar 2022', value: 810145 }, { period: 'Mar 2023', value: 893452 }, { period: 'Mar 2024', value: 984532 }, { period: 'Mar 2025', value: 1084251 }]
        },
        {
          particular: 'Total Borrowings',
          history: [{ period: 'Mar 2022', value: 312543 }, { period: 'Mar 2023', value: 327891 }, { period: 'Mar 2024', value: 341254 }, { period: 'Mar 2025', value: 325412 }]
        },
        {
          particular: 'Other Liabilities',
          history: [{ period: 'Mar 2022', value: 187452 }, { period: 'Mar 2023', value: 201254 }, { period: 'Mar 2024', value: 215432 }, { period: 'Mar 2025', value: 228412 }]
        },
        {
          particular: 'Net Block (Fixed Assets)',
          history: [{ period: 'Mar 2022', value: 625412 }, { period: 'Mar 2023', value: 712543 }, { period: 'Mar 2024', value: 798451 }, { period: 'Mar 2025', value: 845123 }]
        },
        {
          particular: 'Capital Work In Progress',
          history: [{ period: 'Mar 2022', value: 178452 }, { period: 'Mar 2023', value: 145123 }, { period: 'Mar 2024', value: 125412 }, { period: 'Mar 2025', value: 112541 }]
        },
        {
          particular: 'Investments',
          history: [{ period: 'Mar 2022', value: 298451 }, { period: 'Mar 2023', value: 325412 }, { period: 'Mar 2024', value: 365412 }, { period: 'Mar 2025', value: 395412 }]
        },
        {
          particular: 'Other Assets',
          history: [{ period: 'Mar 2022', value: 214590 }, { period: 'Mar 2023', value: 246285 }, { period: 'Mar 2024', value: 258709 }, { period: 'Mar 2025', value: 291765 }]
        }
      ],
      history: [
        { period: 'Mar 2022', total_asset: 1316905, total_liability: 1316905 },
        { period: 'Mar 2023', total_asset: 1429363, total_liability: 1429363 },
        { period: 'Mar 2024', total_asset: 1547984, total_liability: 1547984 },
        { period: 'Mar 2025', total_asset: 1644841, total_liability: 1644841 }
      ]
    },
    incomeStatement: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Sales / Revenue',
          history: [{ period: 'Mar 2022', value: 699907 }, { period: 'Mar 2023', value: 877835 }, { period: 'Mar 2024', value: 900597 }, { period: 'Mar 2025', value: 978451 }]
        },
        {
          particular: 'Expenses',
          history: [{ period: 'Mar 2022', value: 589452 }, { period: 'Mar 2023', value: 735412 }, { period: 'Mar 2024', value: 752145 }, { period: 'Mar 2025', value: 812451 }]
        },
        {
          particular: 'Operating Profit (EBITDA)',
          history: [{ period: 'Mar 2022', value: 110455 }, { period: 'Mar 2023', value: 142423 }, { period: 'Mar 2024', value: 148452 }, { period: 'Mar 2025', value: 166000 }]
        },
        {
          particular: 'Depreciation',
          history: [{ period: 'Mar 2022', value: 29797 }, { period: 'Mar 2023', value: 40303 }, { period: 'Mar 2024', value: 44251 }, { period: 'Mar 2025', value: 48512 }]
        },
        {
          particular: 'Interest',
          history: [{ period: 'Mar 2022', value: 14584 }, { period: 'Mar 2023', value: 19571 }, { period: 'Mar 2024', value: 21452 }, { period: 'Mar 2025', value: 20125 }]
        },
        {
          particular: 'Net Profit',
          history: [{ period: 'Mar 2022', value: 60705 }, { period: 'Mar 2023', value: 66702 }, { period: 'Mar 2024', value: 69621 }, { period: 'Mar 2025', value: 78451 }]
        }
      ]
    },
    cashFlow: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Cash from Operating Activities',
          history: [{ period: 'Mar 2022', value: 110654 }, { period: 'Mar 2023', value: 115432 }, { period: 'Mar 2024', value: 135412 }, { period: 'Mar 2025', value: 154215 }]
        },
        {
          particular: 'Cash from Investing Activities',
          history: [{ period: 'Mar 2022', value: -115421 }, { period: 'Mar 2023', value: -125412 }, { period: 'Mar 2024', value: -145123 }, { period: 'Mar 2025', value: -132541 }]
        },
        {
          particular: 'Cash from Financing Activities',
          history: [{ period: 'Mar 2022', value: 4512 }, { period: 'Mar 2023', value: 9412 }, { period: 'Mar 2024', value: 8452 }, { period: 'Mar 2025', value: -18451 }]
        },
        {
          particular: 'Net Cash Flow',
          history: [{ period: 'Mar 2022', value: -255 }, { period: 'Mar 2023', value: -568 }, { period: 'Mar 2024', value: -1259 }, { period: 'Mar 2025', value: 3223 }]
        }
      ]
    },
    shareHoldings: [
      {
        category: 'Promoters',
        history: [{ period: 'Jun 2024', percentage: 50.39 }, { period: 'Sep 2024', percentage: 50.39 }, { period: 'Dec 2024', percentage: 50.39 }, { period: 'Mar 2025', percentage: 50.39 }]
      },
      {
        category: 'FII',
        history: [{ period: 'Jun 2024', percentage: 22.45 }, { period: 'Sep 2024', percentage: 22.12 }, { period: 'Dec 2024', percentage: 21.85 }, { period: 'Mar 2025', percentage: 22.01 }]
      },
      {
        category: 'DII',
        history: [{ period: 'Jun 2024', percentage: 16.12 }, { period: 'Sep 2024', percentage: 16.45 }, { period: 'Dec 2024', percentage: 16.78 }, { period: 'Mar 2025', percentage: 16.62 }]
      },
      {
        category: 'Public & Others',
        history: [{ period: 'Jun 2024', percentage: 11.04 }, { period: 'Sep 2024', percentage: 11.04 }, { period: 'Dec 2024', percentage: 10.98 }, { period: 'Mar 2025', percentage: 10.98 }]
      }
    ],
    keyRatios: [
      { name: 'P/E Ratio', company_value: '26.85', sector_value: '22.14' },
      { name: 'P/B Ratio', company_value: '2.45', sector_value: '2.12' },
      { name: 'ROE', company_value: '8.45%', sector_value: '10.50%' },
      { name: 'ROCE', company_value: '9.87%', sector_value: '11.12%' },
      { name: 'Debt to Equity', company_value: '0.35', sector_value: '0.48' },
      { name: 'Dividend Yield', company_value: '0.38%', sector_value: '0.52%' }
    ],
    corporateActions: [
      {
        name: 'Dividend',
        expiry_date: '2024-08-19',
        amount: 10.0,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Final' }, { key: 'Ex Date', value: '19 Aug 2024' }, { key: 'Announcement Date', value: '2024-05-15' }]
      },
      {
        name: 'Dividend',
        expiry_date: '2023-08-21',
        amount: 9.0,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Final' }, { key: 'Ex Date', value: '21 Aug 2023' }]
      },
      {
        name: 'Bonus',
        expiry_date: '2017-09-07',
        amount: null,
        ratio: '1:1',
        event_details: [{ key: 'Type', value: 'Bonus Issue' }, { key: 'Ex Date', value: '07 Sep 2017' }]
      }
    ],
    competitors: [
      {
        instrument_key: 'NSE_EQ|INE129A01019',
        company_profile: 'Indian Oil Corporation Limited is an Indian government-owned oil and gas explorer and producer headquartered in New Delhi.',
        sector: 'Refineries & Petrochemicals',
        sector_market_cap_inr: { value: 215432, unit: 'crore', formatted: '2,15,432.00 Cr' },
        sector_market_cap_usd: { value: 25.8, unit: 'billion', formatted: '$25.80B' }
      },
      {
        instrument_key: 'NSE_EQ|INE029A01011',
        company_profile: 'Bharat Petroleum Corporation Limited is an Indian government-owned oil and gas explorer and producer headquartered in Mumbai.',
        sector: 'Refineries & Petrochemicals',
        sector_market_cap_inr: { value: 125412, unit: 'crore', formatted: '1,25,412.00 Cr' },
        sector_market_cap_usd: { value: 15.0, unit: 'billion', formatted: '$15.00B' }
      }
    ]
  },

  // Tata Consultancy Services (INE467B01029)
  'INE467B01029': {
    profile: {
      company_profile: 'Tata Consultancy Services Limited is an Indian multinational information technology services and consulting company headquartered in Mumbai. It is a part of the Tata Group and operates in 150 locations across 46 countries.',
      sector: 'IT Services & Consulting',
      sector_market_cap_inr: { value: 1452154, unit: 'crore', formatted: '14,52,154.00 Cr' },
      sector_market_cap_usd: { value: 174.2, unit: 'billion', formatted: '$174.20B' }
    },
    balanceSheet: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Total Share Capital',
          history: [{ period: 'Mar 2022', value: 366 }, { period: 'Mar 2023', value: 366 }, { period: 'Mar 2024', value: 362 }, { period: 'Mar 2025', value: 362 }]
        },
        {
          particular: 'Total Reserves',
          history: [{ period: 'Mar 2022', value: 88741 }, { period: 'Mar 2023', value: 92451 }, { period: 'Mar 2024', value: 98451 }, { period: 'Mar 2025', value: 104512 }]
        },
        {
          particular: 'Total Borrowings',
          history: [{ period: 'Mar 2022', value: 0 }, { period: 'Mar 2023', value: 0 }, { period: 'Mar 2024', value: 0 }, { period: 'Mar 2025', value: 0 }]
        },
        {
          particular: 'Other Liabilities',
          history: [{ period: 'Mar 2022', value: 22541 }, { period: 'Mar 2023', value: 24512 }, { period: 'Mar 2024', value: 26541 }, { period: 'Mar 2025', value: 28541 }]
        },
        {
          particular: 'Net Block (Fixed Assets)',
          history: [{ period: 'Mar 2022', value: 21543 }, { period: 'Mar 2023', value: 22541 }, { period: 'Mar 2024', value: 24512 }, { period: 'Mar 2025', value: 25412 }]
        },
        {
          particular: 'Investments',
          history: [{ period: 'Mar 2022', value: 45123 }, { period: 'Mar 2023', value: 48512 }, { period: 'Mar 2024', value: 52145 }, { period: 'Mar 2025', value: 55412 }]
        },
        {
          particular: 'Other Assets',
          history: [{ period: 'Mar 2022', value: 44982 }, { period: 'Mar 2023', value: 46366 }, { period: 'Mar 2024', value: 48697 }, { period: 'Mar 2025', value: 52589 }]
        }
      ],
      history: [
        { period: 'Mar 2022', total_asset: 111648, total_liability: 111648 },
        { period: 'Mar 2023', total_asset: 117419, total_liability: 117419 },
        { period: 'Mar 2024', total_asset: 125354, total_liability: 125354 },
        { period: 'Mar 2025', total_asset: 133413, total_liability: 133413 }
      ]
    },
    incomeStatement: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Sales / Revenue',
          history: [{ period: 'Mar 2022', value: 191754 }, { period: 'Mar 2023', value: 225452 }, { period: 'Mar 2024', value: 240893 }, { period: 'Mar 2025', value: 261452 }]
        },
        {
          particular: 'Operating Profit (EBITDA)',
          history: [{ period: 'Mar 2022', value: 53059 }, { period: 'Mar 2023', value: 59254 }, { period: 'Mar 2024', value: 64125 }, { period: 'Mar 2025', value: 71254 }]
        },
        {
          particular: 'Depreciation',
          history: [{ period: 'Mar 2022', value: 4604 }, { period: 'Mar 2023', value: 5023 }, { period: 'Mar 2024', value: 5125 }, { period: 'Mar 2025', value: 5412 }]
        },
        {
          particular: 'Net Profit',
          history: [{ period: 'Mar 2022', value: 38327 }, { period: 'Mar 2023', value: 42147 }, { period: 'Mar 2024', value: 45908 }, { period: 'Mar 2025', value: 51254 }]
        }
      ]
    },
    cashFlow: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Cash from Operating Activities',
          history: [{ period: 'Mar 2022', value: 39949 }, { period: 'Mar 2023', value: 41254 }, { period: 'Mar 2024', value: 44254 }, { period: 'Mar 2025', value: 48512 }]
        },
        {
          particular: 'Cash from Investing Activities',
          history: [{ period: 'Mar 2022', value: -5412 }, { period: 'Mar 2023', value: -7851 }, { period: 'Mar 2024', value: -6512 }, { period: 'Mar 2025', value: -8412 }]
        },
        {
          particular: 'Cash from Financing Activities',
          history: [{ period: 'Mar 2022', value: -33451 }, { period: 'Mar 2023', value: -34123 }, { period: 'Mar 2024', value: -37541 }, { period: 'Mar 2025', value: -39541 }]
        },
        {
          particular: 'Net Cash Flow',
          history: [{ period: 'Mar 2022', value: 1086 }, { period: 'Mar 2023', value: -720 }, { period: 'Mar 2024', value: 201 }, { period: 'Mar 2025', value: 559 }]
        }
      ]
    },
    shareHoldings: [
      {
        category: 'Promoters',
        history: [{ period: 'Jun 2024', percentage: 71.90 }, { period: 'Sep 2024', percentage: 71.90 }, { period: 'Dec 2024', percentage: 71.90 }, { period: 'Mar 2025', percentage: 71.90 }]
      },
      {
        category: 'FII',
        history: [{ period: 'Jun 2024', percentage: 12.58 }, { period: 'Sep 2024', percentage: 12.65 }, { period: 'Dec 2024', percentage: 12.35 }, { period: 'Mar 2025', percentage: 12.42 }]
      },
      {
        category: 'DII',
        history: [{ period: 'Jun 2024', percentage: 10.45 }, { period: 'Sep 2024', percentage: 10.35 }, { period: 'Dec 2024', percentage: 10.65 }, { period: 'Mar 2025', percentage: 10.58 }]
      },
      {
        category: 'Public & Others',
        history: [{ period: 'Jun 2024', percentage: 5.07 }, { period: 'Sep 2024', percentage: 5.10 }, { period: 'Dec 2024', percentage: 5.10 }, { period: 'Mar 2025', percentage: 5.10 }]
      }
    ],
    keyRatios: [
      { name: 'P/E Ratio', company_value: '31.42', sector_value: '26.85' },
      { name: 'P/B Ratio', company_value: '14.15', sector_value: '8.45' },
      { name: 'ROE', company_value: '49.85%', sector_value: '31.12%' },
      { name: 'ROCE', company_value: '61.42%', sector_value: '39.85%' },
      { name: 'Debt to Equity', company_value: '0.00', sector_value: '0.12' },
      { name: 'Dividend Yield', company_value: '2.15%', sector_value: '1.45%' }
    ],
    corporateActions: [
      {
        name: 'Dividend',
        expiry_date: '2025-01-16',
        amount: 10.0,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Interim' }, { key: 'Ex Date', value: '16 Jan 2025' }]
      },
      {
        name: 'Dividend',
        expiry_date: '2024-07-16',
        amount: 28.0,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Final & Special' }, { key: 'Ex Date', value: '16 Jul 2024' }]
      },
      {
        name: 'Buyback',
        expiry_date: '2023-11-24',
        amount: 4150.0,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Tender Offer' }, { key: 'Ex Date', value: '24 Nov 2023' }]
      }
    ],
    competitors: [
      {
        instrument_key: 'NSE_EQ|INE009A01021',
        company_profile: 'Infosys Limited is an Indian multinational information technology company that provides business consulting, information technology and outsourcing services.',
        sector: 'IT Services & Consulting',
        sector_market_cap_inr: { value: 712451, unit: 'crore', formatted: '7,12,451.00 Cr' },
        sector_market_cap_usd: { value: 85.5, unit: 'billion', formatted: '$85.50B' }
      },
      {
        instrument_key: 'NSE_EQ|INE075A01022',
        company_profile: 'Wipro Limited is an Indian multinational corporation that provides information technology, consultant, and business process services headquartered in Bangalore.',
        sector: 'IT Services & Consulting',
        sector_market_cap_inr: { value: 284512, unit: 'crore', formatted: '2,84,512.00 Cr' },
        sector_market_cap_usd: { value: 34.1, unit: 'billion', formatted: '$34.10B' }
      }
    ]
  },

  // Infosys (INE009A01021)
  'INE009A01021': {
    profile: {
      company_profile: 'Infosys Limited is an Indian multinational information technology corporation providing business consulting, information technology, and outsourcing services. It was founded in Pune and is headquartered in Bangalore, currently ranking as the second-largest Indian IT company.',
      sector: 'IT Services & Consulting',
      sector_market_cap_inr: { value: 712451, unit: 'crore', formatted: '7,12,451.00 Cr' },
      sector_market_cap_usd: { value: 85.5, unit: 'billion', formatted: '$85.50B' }
    },
    balanceSheet: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Total Share Capital',
          history: [{ period: 'Mar 2022', value: 2103 }, { period: 'Mar 2023', value: 2068 }, { period: 'Mar 2024', value: 2075 }, { period: 'Mar 2025', value: 2075 }]
        },
        {
          particular: 'Total Reserves',
          history: [{ period: 'Mar 2022', value: 73254 }, { period: 'Mar 2023', value: 74215 }, { period: 'Mar 2024', value: 79851 }, { period: 'Mar 2025', value: 85412 }]
        },
        {
          particular: 'Total Borrowings',
          history: [{ period: 'Mar 2022', value: 0 }, { period: 'Mar 2023', value: 0 }, { period: 'Mar 2024', value: 0 }, { period: 'Mar 2025', value: 0 }]
        },
        {
          particular: 'Other Liabilities',
          history: [{ period: 'Mar 2022', value: 14512 }, { period: 'Mar 2023', value: 16541 }, { period: 'Mar 2024', value: 18512 }, { period: 'Mar 2025', value: 20451 }]
        },
        {
          particular: 'Net Block (Fixed Assets)',
          history: [{ period: 'Mar 2022', value: 16541 }, { period: 'Mar 2023', value: 17851 }, { period: 'Mar 2024', value: 19512 }, { period: 'Mar 2025', value: 21451 }]
        },
        {
          particular: 'Investments',
          history: [{ period: 'Mar 2022', value: 28451 }, { period: 'Mar 2023', value: 31254 }, { period: 'Mar 2024', value: 34512 }, { period: 'Mar 2025', value: 38512 }]
        },
        {
          particular: 'Other Assets',
          history: [{ period: 'Mar 2022', value: 44877 }, { period: 'Mar 2023', value: 43719 }, { period: 'Mar 2024', value: 46414 }, { period: 'Mar 2025', value: 47974 }]
        }
      ],
      history: [
        { period: 'Mar 2022', total_asset: 89869, total_liability: 89869 },
        { period: 'Mar 2023', total_asset: 92824, total_liability: 92824 },
        { period: 'Mar 2024', total_asset: 100438, total_liability: 100438 },
        { period: 'Mar 2025', total_asset: 107938, total_liability: 107938 }
      ]
    },
    incomeStatement: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Sales / Revenue',
          history: [{ period: 'Mar 2022', value: 121641 }, { period: 'Mar 2023', value: 146767 }, { period: 'Mar 2024', value: 153671 }, { period: 'Mar 2025', value: 168451 }]
        },
        {
          particular: 'Operating Profit (EBITDA)',
          history: [{ period: 'Mar 2022', value: 31492 }, { period: 'Mar 2023', value: 35131 }, { period: 'Mar 2024', value: 37451 }, { period: 'Mar 2025', value: 41254 }]
        },
        {
          particular: 'Depreciation',
          history: [{ period: 'Mar 2022', value: 3477 }, { period: 'Mar 2023', value: 4225 }, { period: 'Mar 2024', value: 4851 }, { period: 'Mar 2025', value: 5124 }]
        },
        {
          particular: 'Net Profit',
          history: [{ period: 'Mar 2022', value: 22110 }, { period: 'Mar 2023', value: 24095 }, { period: 'Mar 2024', value: 26233 }, { period: 'Mar 2025', value: 29541 }]
        }
      ]
    },
    cashFlow: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Cash from Operating Activities',
          history: [{ period: 'Mar 2022', value: 24964 }, { period: 'Mar 2023', value: 23145 }, { period: 'Mar 2024', value: 26451 }, { period: 'Mar 2025', value: 29124 }]
        },
        {
          particular: 'Cash from Investing Activities',
          history: [{ period: 'Mar 2022', value: -4812 }, { period: 'Mar 2023', value: -5412 }, { period: 'Mar 2024', value: -6125 }, { period: 'Mar 2025', value: -6541 }]
        },
        {
          particular: 'Cash from Financing Activities',
          history: [{ period: 'Mar 2022', value: -19851 }, { period: 'Mar 2023', value: -18512 }, { period: 'Mar 2024', value: -20125 }, { period: 'Mar 2025', value: -21451 }]
        },
        {
          particular: 'Net Cash Flow',
          history: [{ period: 'Mar 2022', value: 301 }, { period: 'Mar 2023', value: -779 }, { period: 'Mar 2024', value: 201 }, { period: 'Mar 2025', value: 1132 }]
        }
      ]
    },
    shareHoldings: [
      {
        category: 'Promoters',
        history: [{ period: 'Jun 2024', percentage: 14.65 }, { period: 'Sep 2024', percentage: 14.65 }, { period: 'Dec 2024', percentage: 14.65 }, { period: 'Mar 2025', percentage: 14.65 }]
      },
      {
        category: 'FII',
        history: [{ period: 'Jun 2024', percentage: 34.12 }, { period: 'Sep 2024', percentage: 33.85 }, { period: 'Dec 2024', percentage: 33.54 }, { period: 'Mar 2025', percentage: 33.72 }]
      },
      {
        category: 'DII',
        history: [{ period: 'Jun 2024', percentage: 36.14 }, { period: 'Sep 2024', percentage: 36.42 }, { period: 'Dec 2024', percentage: 36.85 }, { period: 'Mar 2025', percentage: 36.65 }]
      },
      {
        category: 'Public & Others',
        history: [{ period: 'Jun 2024', percentage: 15.09 }, { period: 'Sep 2024', percentage: 15.08 }, { period: 'Dec 2024', percentage: 14.96 }, { period: 'Mar 2025', percentage: 14.98 }]
      }
    ],
    keyRatios: [
      { name: 'P/E Ratio', company_value: '24.15', sector_value: '26.85' },
      { name: 'P/B Ratio', company_value: '7.85', sector_value: '8.45' },
      { name: 'ROE', company_value: '30.45%', sector_value: '31.12%' },
      { name: 'ROCE', company_value: '38.45%', sector_value: '39.85%' },
      { name: 'Debt to Equity', company_value: '0.00', sector_value: '0.12' },
      { name: 'Dividend Yield', company_value: '2.48%', sector_value: '1.45%' }
    ],
    corporateActions: [
      {
        name: 'Dividend',
        expiry_date: '2024-10-29',
        amount: 21.0,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Interim' }, { key: 'Ex Date', value: '29 Oct 2024' }]
      },
      {
        name: 'Dividend',
        expiry_date: '2024-05-31',
        amount: 28.0,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Final & Special' }, { key: 'Ex Date', value: '31 May 2024' }]
      }
    ],
    competitors: [
      {
        instrument_key: 'NSE_EQ|INE467B01029',
        company_profile: 'Tata Consultancy Services Limited is an Indian IT giant offering services globally, part of the Tata conglomerate.',
        sector: 'IT Services & Consulting',
        sector_market_cap_inr: { value: 1452154, unit: 'crore', formatted: '14,52,154.00 Cr' },
        sector_market_cap_usd: { value: 174.2, unit: 'billion', formatted: '$174.20B' }
      },
      {
        instrument_key: 'NSE_EQ|INE075A01022',
        company_profile: 'Wipro Limited is an Indian multinational IT services company.',
        sector: 'IT Services & Consulting',
        sector_market_cap_inr: { value: 284512, unit: 'crore', formatted: '2,84,512.00 Cr' },
        sector_market_cap_usd: { value: 34.1, unit: 'billion', formatted: '$34.10B' }
      }
    ]
  },

  // HDFC Bank (INE040A01034)
  'INE040A01034': {
    profile: {
      company_profile: 'HDFC Bank Limited is an Indian banking and financial services company headquartered in Mumbai. It is India\'s largest private sector bank by assets and the world\'s tenth-largest bank by market capitalization as of 2024, following its merger with parent HDFC.',
      sector: 'Banking & Financials',
      sector_market_cap_inr: { value: 1254124, unit: 'crore', formatted: '12,54,124.00 Cr' },
      sector_market_cap_usd: { value: 150.5, unit: 'billion', formatted: '$150.50B' }
    },
    balanceSheet: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Capital',
          history: [{ period: 'Mar 2022', value: 554 }, { period: 'Mar 2023', value: 558 }, { period: 'Mar 2024', value: 759 }, { period: 'Mar 2025', value: 759 }]
        },
        {
          particular: 'Reserves',
          history: [{ period: 'Mar 2022', value: 239538 }, { period: 'Mar 2023', value: 279581 }, { period: 'Mar 2024', value: 435123 }, { period: 'Mar 2025', value: 489412 }]
        },
        {
          particular: 'Deposits',
          history: [{ period: 'Mar 2022', value: 1559218 }, { period: 'Mar 2023', value: 1883395 }, { period: 'Mar 2024', value: 2381254 }, { period: 'Mar 2025', value: 2654125 }]
        },
        {
          particular: 'Borrowings',
          history: [{ period: 'Mar 2022', value: 184817 }, { period: 'Mar 2023', value: 206383 }, { period: 'Mar 2024', value: 685124 }, { period: 'Mar 2025', value: 625412 }]
        },
        {
          particular: 'Other Liabilities',
          history: [{ period: 'Mar 2022', value: 84405 }, { period: 'Mar 2023', value: 95412 }, { period: 'Mar 2024', value: 154123 }, { period: 'Mar 2025', value: 168412 }]
        },
        {
          particular: 'Cash & Balances',
          history: [{ period: 'Mar 2022', value: 152119 }, { period: 'Mar 2023', value: 193765 }, { period: 'Mar 2024', value: 215412 }, { period: 'Mar 2025', value: 235412 }]
        },
        {
          particular: 'Investments',
          history: [{ period: 'Mar 2022', value: 455537 }, { period: 'Mar 2023', value: 517001 }, { period: 'Mar 2024', value: 712541 }, { period: 'Mar 2025', value: 785412 }]
        },
        {
          particular: 'Advances (Loans)',
          history: [{ period: 'Mar 2022', value: 1368821 }, { period: 'Mar 2023', value: 1600586 }, { period: 'Mar 2024', value: 2508123 }, { period: 'Mar 2025', value: 2785412 }]
        },
        {
          particular: 'Fixed & Other Assets',
          history: [{ period: 'Mar 2022', value: 92055 }, { period: 'Mar 2023', value: 154977 }, { period: 'Mar 2024', value: 220308 }, { period: 'Mar 2025', value: 131884 }]
        }
      ],
      history: [
        { period: 'Mar 2022', total_asset: 2068532, total_liability: 2068532 },
        { period: 'Mar 2023', total_asset: 2466329, total_liability: 2466329 },
        { period: 'Mar 2024', total_asset: 3656384, total_liability: 3656384 },
        { period: 'Mar 2025', total_asset: 3938120, total_liability: 3938120 }
      ]
    },
    incomeStatement: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Interest Earned',
          history: [{ period: 'Mar 2022', value: 127814 }, { period: 'Mar 2023', value: 161586 }, { period: 'Mar 2024', value: 273512 }, { period: 'Mar 2025', value: 312541 }]
        },
        {
          particular: 'Interest Expended',
          history: [{ period: 'Mar 2022', value: 55762 }, { period: 'Mar 2023', value: 74743 }, { period: 'Mar 2024', value: 158451 }, { period: 'Mar 2025', value: 178412 }]
        },
        {
          particular: 'Net Interest Income (NII)',
          history: [{ period: 'Mar 2022', value: 72052 }, { period: 'Mar 2023', value: 86843 }, { period: 'Mar 2024', value: 115061 }, { period: 'Mar 2025', value: 134129 }]
        },
        {
          particular: 'Other Income',
          history: [{ period: 'Mar 2022', value: 29510 }, { period: 'Mar 2023', value: 31215 }, { period: 'Mar 2024', value: 41254 }, { period: 'Mar 2025', value: 46541 }]
        },
        {
          particular: 'Operating Expenses',
          history: [{ period: 'Mar 2022', value: 37442 }, { period: 'Mar 2023', value: 47582 }, { period: 'Mar 2024', value: 68451 }, { period: 'Mar 2025', value: 72154 }]
        },
        {
          particular: 'Provisions',
          history: [{ period: 'Mar 2022', value: 15062 }, { period: 'Mar 2023', value: 11920 }, { period: 'Mar 2024', value: 17541 }, { period: 'Mar 2025', value: 15412 }]
        },
        {
          particular: 'Net Profit',
          history: [{ period: 'Mar 2022', value: 36961 }, { period: 'Mar 2023', value: 44109 }, { period: 'Mar 2024', value: 60805 }, { period: 'Mar 2025', value: 65412 }]
        }
      ]
    },
    cashFlow: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Cash from Operating Activities',
          history: [{ period: 'Mar 2022', value: -42541 }, { period: 'Mar 2023', value: 68412 }, { period: 'Mar 2024', value: 125412 }, { period: 'Mar 2025', value: 145123 }]
        },
        {
          particular: 'Cash from Investing Activities',
          history: [{ period: 'Mar 2022', value: -22541 }, { period: 'Mar 2023', value: -31254 }, { period: 'Mar 2024', value: -54125 }, { period: 'Mar 2025', value: -45123 }]
        },
        {
          particular: 'Cash from Financing Activities',
          history: [{ period: 'Mar 2022', value: 92541 }, { period: 'Mar 2023', value: -22541 }, { period: 'Mar 2024', value: -45123 }, { period: 'Mar 2025', value: -84512 }]
        },
        {
          particular: 'Net Cash Flow',
          history: [{ period: 'Mar 2022', value: 27459 }, { period: 'Mar 2023', value: 14617 }, { period: 'Mar 2024', value: 26164 }, { period: 'Mar 2025', value: 15488 }]
        }
      ]
    },
    shareHoldings: [
      {
        category: 'Promoters',
        history: [{ period: 'Jun 2024', percentage: 0.00 }, { period: 'Sep 2024', percentage: 0.00 }, { period: 'Dec 2024', percentage: 0.00 }, { period: 'Mar 2025', percentage: 0.00 }]
      },
      {
        category: 'FII',
        history: [{ period: 'Jun 2024', percentage: 47.15 }, { period: 'Sep 2024', percentage: 47.45 }, { period: 'Dec 2024', percentage: 47.12 }, { period: 'Mar 2025', percentage: 47.35 }]
      },
      {
        category: 'DII',
        history: [{ period: 'Jun 2024', percentage: 33.45 }, { period: 'Sep 2024', percentage: 33.12 }, { period: 'Dec 2024', percentage: 33.54 }, { period: 'Mar 2025', percentage: 33.25 }]
      },
      {
        category: 'Public & Others',
        history: [{ period: 'Jun 2024', percentage: 19.40 }, { period: 'Sep 2024', percentage: 19.43 }, { period: 'Dec 2024', percentage: 19.34 }, { period: 'Mar 2025', percentage: 19.40 }]
      }
    ],
    keyRatios: [
      { name: 'P/E Ratio', company_value: '19.45', sector_value: '17.12' },
      { name: 'P/B Ratio', company_value: '2.85', sector_value: '2.14' },
      { name: 'ROE', company_value: '16.42%', sector_value: '14.12%' },
      { name: 'ROA', company_value: '1.92%', sector_value: '1.45%' },
      { name: 'Net NPA %', company_value: '0.33%', sector_value: '0.45%' },
      { name: 'Dividend Yield', company_value: '1.18%', sector_value: '1.05%' }
    ],
    corporateActions: [
      {
        name: 'Dividend',
        expiry_date: '2024-05-10',
        amount: 19.5,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Final' }, { key: 'Ex Date', value: '10 May 2024' }]
      },
      {
        name: 'Dividend',
        expiry_date: '2023-05-16',
        amount: 19.0,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Final' }, { key: 'Ex Date', value: '16 May 2023' }]
      },
      {
        name: 'Split',
        expiry_date: '2019-09-19',
        amount: null,
        ratio: '1:2',
        event_details: [{ key: 'Ex Date', value: '19 Sep 2019' }, { key: 'Old FV', value: '2' }, { key: 'New FV', value: '1' }]
      }
    ],
    competitors: [
      {
        instrument_key: 'NSE_EQ|INE090A01021',
        company_profile: 'ICICI Bank Limited is an Indian multinational banking and financial services company headquartered in Mumbai.',
        sector: 'Banking & Financials',
        sector_market_cap_inr: { value: 854125, unit: 'crore', formatted: '8,54,125.00 Cr' },
        sector_market_cap_usd: { value: 102.5, unit: 'billion', formatted: '$102.50B' }
      },
      {
        instrument_key: 'NSE_EQ|INE002A01018',
        company_profile: 'State Bank of India is an Indian multinational public sector bank and financial services statutory body headquartered in Mumbai.',
        sector: 'Banking & Financials',
        sector_market_cap_inr: { value: 712541, unit: 'crore', formatted: '7,12,541.00 Cr' },
        sector_market_cap_usd: { value: 85.5, unit: 'billion', formatted: '$85.50B' }
      }
    ]
  }
};

// ============================================================================
// Data Retrieval Logic
// ============================================================================

/**
 * Helper to fetch optional endpoints with a fallback default value
 */
async function fetchOptionalEndpoint<T>(url: string, token: string, defaultValue: T): Promise<T> {
  try {
    return await fetchUpstoxEndpoint<T>(url, token);
  } catch (error) {
    console.warn(`[Upstox Fundamentals] Optional endpoint failed: ${url}. Using empty default.`, error);
    return defaultValue;
  }
}

/**
 * Fetch all company fundamental datasets (parallelized)
 */
export async function getCompanyFundamentals(isin: string, symbol: string): Promise<CompanyFundamentals> {
  const isinClean = isin.toUpperCase();
  const token = await getStoredTokenQuiet();

  if (!token) {
    console.log(`[Upstox Fundamentals] No valid token, falling back to mock data for ISIN: ${isinClean}`);
    return getMockFundamentals(isinClean, symbol);
  }

  try {
    // Resolve full instrument key for competitors endpoint (expects e.g. NSE_EQ|ISIN)
    const instrumentKey = (await getInstrumentKey(symbol)) || `NSE_EQ|${isinClean}`;

    // 1. Fetch essential core data (profile, balance sheet, income statement)
    // If these fail, we throw and fall back to mock data. Fetch yearly by default, grab quarterly optionally.
    const [
      profile,
      balanceSheet,
      incomeStatement,
      balanceSheetQuarterly,
      incomeStatementQuarterly
    ] = await Promise.all([
      fetchUpstoxEndpoint<CompanyProfile>(`${BASE_URL}/${isinClean}/profile`, token),
      fetchUpstoxEndpoint<FinancialStatement>(`${BASE_URL}/${isinClean}/balance-sheet?fs=true&time_period=yearly`, token),
      fetchUpstoxEndpoint<FinancialStatement>(`${BASE_URL}/${isinClean}/income-statement?fs=true&time_period=yearly`, token),
      fetchOptionalEndpoint<FinancialStatement>(
        `${BASE_URL}/${isinClean}/balance-sheet?fs=true&time_period=quarterly`,
        token,
        { type: 'consolidated', time_period: 'quarterly', units_in: 'crore', full_statement: [], history: [] }
      ),
      fetchOptionalEndpoint<FinancialStatement>(
        `${BASE_URL}/${isinClean}/income-statement?fs=true&time_period=quarterly`,
        token,
        { type: 'consolidated', time_period: 'quarterly', units_in: 'crore', full_statement: [], history: [] }
      ),
    ]);

    // 2. Fetch optional auxiliary data (cash flow, holdings, ratios, actions, competitors)
    // Wrap them in try-catch so secondary failures don't ruin the whole page load
    const [
      cashFlow,
      cashFlowQuarterly,
      shareHoldings,
      keyRatios,
      corporateActions,
      competitors
    ] = await Promise.all([
      fetchOptionalEndpoint<FinancialStatement>(
        `${BASE_URL}/${isinClean}/cash-flow?fs=true&time_period=yearly`,
        token,
        { type: 'consolidated', time_period: 'yearly', units_in: 'crore', full_statement: [], history: [] }
      ),
      fetchOptionalEndpoint<FinancialStatement>(
        `${BASE_URL}/${isinClean}/cash-flow?fs=true&time_period=quarterly`,
        token,
        { type: 'consolidated', time_period: 'quarterly', units_in: 'crore', full_statement: [], history: [] }
      ),
      fetchOptionalEndpoint<ShareholdingPattern[]>(
        `${BASE_URL}/${isinClean}/share-holdings`,
        token,
        []
      ),
      fetchOptionalEndpoint<KeyRatio[]>(
        `${BASE_URL}/${isinClean}/key-ratios`,
        token,
        []
      ),
      fetchOptionalEndpoint<CorporateAction[]>(
        `${BASE_URL}/${isinClean}/corporate-actions`,
        token,
        []
      ),
      fetchOptionalEndpoint<CompetitorProfile[]>(
        `${BASE_URL}/${instrumentKey}/competitors`,
        token,
        []
      ),
    ]);

    // Post-process competitors to resolve symbols
    const competitorsWithSymbols = await Promise.all(
      (competitors || []).map(async (c) => {
        const compSymbol = await getSymbolFromKey(c.instrument_key);
        return {
          ...c,
          symbol: compSymbol || c.instrument_key.split('|')[1] || 'UNKNOWN',
        };
      })
    );

    // Fetch latest price from DB
    let latestPrice: number | null = null;
    try {
      const { prisma: db } = await import('../db');
      const priceRecord = await db.screenerPrice.findFirst({
        where: { symbol: symbol.toUpperCase() },
        orderBy: { date: 'desc' }
      });
      if (priceRecord) {
        latestPrice = priceRecord.close;
      } else {
        const momentumRecord = await db.momentumScore.findFirst({
          where: { symbol: symbol.toUpperCase() },
          orderBy: { computedDate: 'desc' }
        });
        if (momentumRecord) {
          latestPrice = momentumRecord.currentPrice;
        }
      }
    } catch (e) {
      console.warn(`[Upstox Fundamentals] Failed to fetch price from DB for ${symbol}:`, e);
    }

    // Calculate Dividend Yield if price is available
    let calculatedYield = '—';
    if (latestPrice && latestPrice > 0 && Array.isArray(corporateActions) && corporateActions.length > 0) {
      try {
        const referenceDate = new Date();
        const twelveMonthsAgo = new Date(referenceDate);
        twelveMonthsAgo.setFullYear(referenceDate.getFullYear() - 1);

        let totalDividend = 0;
        for (const action of corporateActions) {
          if (action.name.toLowerCase().includes('dividend')) {
            const divDate = new Date(action.expiry_date);
            if (!isNaN(divDate.getTime())) {
              if (divDate >= twelveMonthsAgo && divDate <= referenceDate) {
                totalDividend += action.amount || 0;
              }
            }
          }
        }
        if (totalDividend > 0) {
          calculatedYield = `${((totalDividend / latestPrice) * 100).toFixed(2)}%`;
        }
      } catch (e) {
        console.warn(`[Upstox Fundamentals] Failed to calculate dividend yield for ${symbol}:`, e);
      }
    }

    // Safely append or update Dividend Yield in keyRatios
    const updatedKeyRatios = Array.isArray(keyRatios) ? [...keyRatios] : [];
    const hasDivYield = updatedKeyRatios.some(r => r.name.toLowerCase().includes('dividend yield'));
    if (!hasDivYield) {
      updatedKeyRatios.push({
        name: 'Dividend Yield',
        company_value: calculatedYield,
        sector_value: '—'
      });
    }

    return {
      profile,
      balanceSheet,
      incomeStatement,
      cashFlow,
      balanceSheetQuarterly,
      incomeStatementQuarterly,
      cashFlowQuarterly,
      shareHoldings,
      keyRatios: updatedKeyRatios,
      corporateActions,
      competitors: competitorsWithSymbols,
      isMock: false,
    };
  } catch (error) {
    console.error(`[Upstox Fundamentals] API failed for ${symbol} (${isinClean}). Falling back to mock.`, error);
    return getMockFundamentals(isinClean, symbol);
  }
}

/**
 * Silent token check that doesn't crash the server component if unauthenticated
 */
async function getStoredTokenQuiet(): Promise<string | null> {
  try {
    return await getAccessToken();
  } catch {
    return null;
  }
}

/**
 * Fetch helper for Upstox REST endpoints
 */
async function fetchUpstoxEndpoint<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new UpstoxError(
      `Fundamentals fetch failed: ${response.status} - ${errorText}`,
      response.status
    );
  }

  const json = await response.json();
  if (json.status !== 'success' || !json.data) {
    throw new UpstoxError(json.message || 'Invalid API response status');
  }

  return json.data as T;
}

/**
 * Helper to dynamically convert yearly financial statements to quarterly statements for mock data.
 * Scales flow variables (e.g. income statement, cash flow items) by 1/4 (with slight noise),
 * while keeping stock variables (e.g. balance sheet items) at their absolute values.
 */
function convertYearlyToQuarterlyMock(statement: FinancialStatement, isFlowVariable: boolean): FinancialStatement {
  const quarters = ['Jun 2024', 'Sep 2024', 'Dec 2024', 'Mar 2025'];
  
  const full_statement = statement.full_statement.map(row => {
    const history = quarters.map((quarter, idx) => {
      const yearlyVal = row.history[idx]?.value ?? (row.history[row.history.length - 1]?.value || 0);
      let value = yearlyVal;
      if (isFlowVariable) {
        const base = yearlyVal / 4;
        const variation = (Math.sin(idx + 1) * 0.05) * base; // deterministic variation to avoid ssr hydration mismatch
        value = Math.round(base + variation);
      }
      return {
        period: quarter,
        value
      };
    });
    return {
      particular: row.particular,
      history
    };
  });

  const history = statement.history?.map((h, idx) => {
    const quarter = quarters[idx] || 'Mar 2025';
    return {
      period: quarter,
      total_asset: h.total_asset,
      total_liability: h.total_liability,
      value: h.value != null ? (isFlowVariable ? Math.round(h.value / 4) : h.value) : undefined,
      change: h.change
    };
  });

  return {
    ...statement,
    time_period: 'quarterly',
    full_statement,
    history
  };
}

/**
 * Returns mock fundamentals data, adjusting values/names dynamically for non-seeded symbols
 */
function getMockFundamentals(isin: string, symbol: string): CompanyFundamentals {
  // If we have a direct match in seed database, return it
  if (MOCK_DATA[isin]) {
    const base = MOCK_DATA[isin];
    return {
      ...base,
      balanceSheetQuarterly: convertYearlyToQuarterlyMock(base.balanceSheet, false),
      incomeStatementQuarterly: convertYearlyToQuarterlyMock(base.incomeStatement, true),
      cashFlowQuarterly: convertYearlyToQuarterlyMock(base.cashFlow, true),
      isMock: true,
    };
  }

  // Otherwise, construct a plausible set of mock data dynamically using symbol information
  const defaultBaseMcap = Math.random() * 200000 + 10000;
  const sector = symbol.includes('BANK') ? 'Banking & Financials' : symbol.includes('TECH') || symbol.includes('INFY') || symbol.includes('TCS') ? 'IT Services & Consulting' : 'Infrastructure & Energy';
  
  const baseData = {
    profile: {
      company_profile: `${symbol} is a leading enterprise in the ${sector} sector. It operates broad and diversified lines of business nationally and internationally, contributing to industry growth and development.`,
      sector,
      sector_market_cap_inr: { value: Math.round(defaultBaseMcap * 4), unit: 'crore', formatted: `${Math.round(defaultBaseMcap * 4).toLocaleString('en-IN')}.00 Cr` },
      sector_market_cap_usd: { value: Math.round((defaultBaseMcap * 4) / 83), unit: 'billion', formatted: `$${Math.round((defaultBaseMcap * 4) / 83).toFixed(1)}B` }
    },
    balanceSheet: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Total Share Capital',
          history: [{ period: 'Mar 2022', value: 1200 }, { period: 'Mar 2023', value: 1200 }, { period: 'Mar 2024', value: 1200 }, { period: 'Mar 2025', value: 1200 }]
        },
        {
          particular: 'Total Reserves',
          history: [{ period: 'Mar 2022', value: 45000 }, { period: 'Mar 2023', value: 52000 }, { period: 'Mar 2024', value: 61000 }, { period: 'Mar 2025', value: 71000 }]
        },
        {
          particular: 'Total Borrowings',
          history: [{ period: 'Mar 2022', value: 15000 }, { period: 'Mar 2023', value: 18000 }, { period: 'Mar 2024', value: 20000 }, { period: 'Mar 2025', value: 17000 }]
        },
        {
          particular: 'Other Liabilities',
          history: [{ period: 'Mar 2022', value: 8000 }, { period: 'Mar 2023', value: 9500 }, { period: 'Mar 2024', value: 11000 }, { period: 'Mar 2025', value: 13000 }]
        },
        {
          particular: 'Fixed Assets',
          history: [{ period: 'Mar 2022', value: 35000 }, { period: 'Mar 2023', value: 41000 }, { period: 'Mar 2024', value: 48000 }, { period: 'Mar 2025', value: 51000 }]
        },
        {
          particular: 'Investments',
          history: [{ period: 'Mar 2022', value: 18000 }, { period: 'Mar 2023', value: 20000 }, { period: 'Mar 2024', value: 23000 }, { period: 'Mar 2025', value: 26000 }]
        },
        {
          particular: 'Other Assets',
          history: [{ period: 'Mar 2022', value: 16200 }, { period: 'Mar 2023', value: 19700 }, { period: 'Mar 2024', value: 21000 }, { period: 'Mar 2025', value: 25000 }]
        }
      ],
      history: [
        { period: 'Mar 2022', total_asset: 69200, total_liability: 69200 },
        { period: 'Mar 2023', total_asset: 80700, total_liability: 80700 },
        { period: 'Mar 2024', total_asset: 92000, total_liability: 92000 },
        { period: 'Mar 2025', total_asset: 102000, total_liability: 102000 }
      ]
    },
    incomeStatement: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Sales / Revenue',
          history: [{ period: 'Mar 2022', value: 35000 }, { period: 'Mar 2023', value: 42000 }, { period: 'Mar 2024', value: 49000 }, { period: 'Mar 2025', value: 58000 }]
        },
        {
          particular: 'Operating Profit (EBITDA)',
          history: [{ period: 'Mar 2022', value: 8500 }, { period: 'Mar 2023', value: 10500 }, { period: 'Mar 2024', value: 12500 }, { period: 'Mar 2025', value: 15600 }]
        },
        {
          particular: 'Depreciation',
          history: [{ period: 'Mar 2022', value: 1200 }, { period: 'Mar 2023', value: 1500 }, { period: 'Mar 2024', value: 1800 }, { period: 'Mar 2025', value: 2100 }]
        },
        {
          particular: 'Net Profit',
          history: [{ period: 'Mar 2022', value: 5100 }, { period: 'Mar 2023', value: 6500 }, { period: 'Mar 2024', value: 7800 }, { period: 'Mar 2025', value: 9800 }]
        }
      ]
    },
    cashFlow: {
      type: 'consolidated',
      time_period: 'yearly',
      units_in: 'crore',
      full_statement: [
        {
          particular: 'Cash from Operating Activities',
          history: [{ period: 'Mar 2022', value: 7800 }, { period: 'Mar 2023', value: 9200 }, { period: 'Mar 2024', value: 11000 }, { period: 'Mar 2025', value: 13500 }]
        },
        {
          particular: 'Cash from Investing Activities',
          history: [{ period: 'Mar 2022', value: -6000 }, { period: 'Mar 2023', value: -7500 }, { period: 'Mar 2024', value: -8500 }, { period: 'Mar 2025', value: -10000 }]
        },
        {
          particular: 'Cash from Financing Activities',
          history: [{ period: 'Mar 2022', value: -1200 }, { period: 'Mar 2023', value: -1300 }, { period: 'Mar 2024', value: -2000 }, { period: 'Mar 2025', value: -3000 }]
        },
        {
          particular: 'Net Cash Flow',
          history: [{ period: 'Mar 2022', value: 600 }, { period: 'Mar 2023', value: 400 }, { period: 'Mar 2024', value: 500 }, { period: 'Mar 2025', value: 500 }]
        }
      ]
    },
    shareHoldings: [
      {
        category: 'Promoters',
        history: [{ period: 'Jun 2024', percentage: 48.5 }, { period: 'Sep 2024', percentage: 48.5 }, { period: 'Dec 2024', percentage: 48.5 }, { period: 'Mar 2025', percentage: 48.5 }]
      },
      {
        category: 'FII',
        history: [{ period: 'Jun 2024', percentage: 21.2 }, { period: 'Sep 2024', percentage: 21.4 }, { period: 'Dec 2024', percentage: 21.1 }, { period: 'Mar 2025', percentage: 21.3 }]
      },
      {
        category: 'DII',
        history: [{ period: 'Jun 2024', percentage: 18.5 }, { period: 'Sep 2024', percentage: 18.2 }, { period: 'Dec 2024', percentage: 18.6 }, { period: 'Mar 2025', percentage: 18.4 }]
      },
      {
        category: 'Public & Others',
        history: [{ period: 'Jun 2024', percentage: 11.8 }, { period: 'Sep 2024', percentage: 11.9 }, { period: 'Dec 2024', percentage: 11.8 }, { period: 'Mar 2025', percentage: 11.8 }]
      }
    ],
    keyRatios: [
      { name: 'P/E Ratio', company_value: '22.45', sector_value: '24.12' },
      { name: 'P/B Ratio', company_value: '3.12', sector_value: '3.54' },
      { name: 'ROE', company_value: '14.85%', sector_value: '13.12%' },
      { name: 'ROCE', company_value: '17.42%', sector_value: '15.65%' },
      { name: 'Debt to Equity', company_value: '0.24', sector_value: '0.35' },
      { name: 'Dividend Yield', company_value: '1.25%', sector_value: '1.12%' }
    ],
    corporateActions: [
      {
        name: 'Dividend',
        expiry_date: '2024-09-12',
        amount: 8.5,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Final' }, { key: 'Ex Date', value: '12 Sep 2024' }]
      },
      {
        name: 'Dividend',
        expiry_date: '2023-09-14',
        amount: 7.0,
        ratio: null,
        event_details: [{ key: 'Type', value: 'Final' }, { key: 'Ex Date', value: '14 Sep 2023' }]
      }
    ],
    competitors: [
      {
        instrument_key: 'NSE_EQ|INE002A01018',
        symbol: 'RELIANCE',
        company_profile: 'Reliance Industries Limited is an Indian multinational energy and petrochemicals conglomerate.',
        sector: 'Refineries & Petrochemicals',
        sector_market_cap_inr: { value: 1684532, unit: 'crore', formatted: '16,84,532.00 Cr' },
        sector_market_cap_usd: { value: 202.1, unit: 'billion', formatted: '$202.10B' }
      },
      {
        instrument_key: 'NSE_EQ|INE467B01029',
        symbol: 'TCS',
        company_profile: 'Tata Consultancy Services Limited is a leading global IT services provider.',
        sector: 'IT Services & Consulting',
        sector_market_cap_inr: { value: 1452154, unit: 'crore', formatted: '14,52,154.00 Cr' },
        sector_market_cap_usd: { value: 174.2, unit: 'billion', formatted: '$174.20B' }
      }
    ]
  };

  return {
    ...baseData,
    balanceSheetQuarterly: convertYearlyToQuarterlyMock(baseData.balanceSheet, false),
    incomeStatementQuarterly: convertYearlyToQuarterlyMock(baseData.incomeStatement, true),
    cashFlowQuarterly: convertYearlyToQuarterlyMock(baseData.cashFlow, true),
    isMock: true,
  };
}
