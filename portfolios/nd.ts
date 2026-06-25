import type { Property } from '../shared/domain.js';

export const PORTFOLIO_TITLE = 'North Dakota';

export const PROPERTIES: Property[] = [
  { code: 'CLND', name: 'The Commons & Landing',        region: 'Minot',     manager: 'Holly Haman' },
  { code: 'SPND', name: 'South Pointe',                  region: 'Minot',     manager: 'Holly Haman' },
  { code: 'TPND', name: 'The Plaza',                     region: 'Minot',     manager: 'Holly Haman' },
  { code: 'TCND', name: 'The Chateau',                   region: 'Minot',     manager: 'Holly Haman' },
  { code: 'WYND', name: 'The Wyatt at Northern Lights',  region: 'Minot',     manager: 'Holly Haman' },
  { code: 'BCND', name: 'The Reserve at Bison Crossing', region: 'Williston', manager: 'Brittanee Purdue' },
  { code: 'ECND', name: 'The Reserve at Elk Crossing',   region: 'Williston', manager: 'Brittanee Purdue' },
  { code: 'FHND', name: 'Fair Hills Apartments',         region: 'Williston', manager: 'Brittanee Purdue' },
  { code: 'PHND', name: 'Plantation at Hunters Run',     region: 'Williston', manager: 'Brittanee Purdue' },
];

export const PCOLOR: Record<string, string> = {
  /* Minot — blues */
  CLND: '#5e97cc', SPND: '#3f7cb8', TPND: '#2f6199', TCND: '#234e7d', WYND: '#183a5e',
  /* Williston — oranges */
  BCND: '#e0973a', ECND: '#d2731f', FHND: '#b8501f', PHND: '#8f3818',
};

export const CONTRACT_CONFIG = {
  section3Term: 'This Agreement shall remain in effect until {TERM_END_DATE} unless sooner terminated in accordance with this Agreement.',
  section7GuaranteePrefix: 'for a period of',
  ownerName: '',
  ownerTitle: '',
};
