// ═══════════════════════════════════════════════════════════════════════
// Seed B: Retail 高管 demo
// 3 accounts, 3真实零售叙事：美国大型零售集团 / 英国食品零售集团 / 加拿大食品零售集团
// ═══════════════════════════════════════════════════════════════════════

import { emptyCaseData } from './types';
import type { CaseData } from './types';

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

export const RETAIL_SEED_IDS = {
  accounts: {
    us_retail: 'acc_retail_us_retail_us_001',
    uk_retail: 'acc_retail_uk_retail_uk_002',
    ca_retail: 'acc_retail_ca_retail_ca_003',
  },
  contacts: {
    us_retailOps: 'con_retail_us_retail_ops_001',
    us_retailTech: 'con_retail_us_retail_tech_002',
    us_retailMerch: 'con_retail_us_retail_merch_003',
    uk_retailRetail: 'con_retail_uk_retail_retail_004',
    uk_retailDigital: 'con_retail_uk_retail_digital_005',
    uk_retailCommercial: 'con_retail_uk_retail_commercial_006',
    ca_retailOps: 'con_retail_ca_retail_ops_007',
    ca_retailIt: 'con_retail_ca_retail_it_008',
    ca_retailProcurement: 'con_retail_ca_retail_proc_009',
  },
  opportunities: {
    us_retailNextGen: 'opp_retail_us_retail_nextgen_001',
    uk_retailPilot: 'opp_retail_uk_retail_value_002',
    ca_retailChallenger: 'opp_retail_ca_retail_challenger_003',
  },
} as const;

const A = RETAIL_SEED_IDS.accounts;
const C = RETAIL_SEED_IDS.contacts;
const O = RETAIL_SEED_IDS.opportunities;

export function getRetailSeedData(): CaseData { return emptyCaseData(); }
