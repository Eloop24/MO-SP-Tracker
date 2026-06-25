import type { Property } from '../shared/domain.js';

export const PORTFOLIO_TITLE = 'Missouri';

export const PROPERTIES: Property[] = [
  { code: 'CCMO', name: 'Canyon Creek',                  region: 'South Saint Louis', manager: 'Carolyn Kehoe',     address: '4851 Lemay Ferry Rd; Mehlville, MO 63129' },
  { code: 'FWMO', name: 'Forest Woods',                  region: 'South Saint Louis', manager: 'Vaneisha Holmes',    address: '101 Forest Parkway; Valley Park, MO 63088' },
  { code: 'PCMO', name: 'Park Commons',                  region: 'South Saint Louis', manager: 'Vaneisha Holmes',    address: '600 Park Commons Ct; Valley Park, MO 63088' },
  { code: 'TDMO', name: 'The District',                  region: 'South Saint Louis', manager: 'Colby Higgins',      address: '633 N McKnight Road; St Louis, MO 63132' },
  { code: 'GMMO', name: 'Greenmar',                      region: 'South Saint Louis',   manager: 'Chrystal Escobar',   address: '1054 Green Mountain Court; Fenton, MO 63026' },
  { code: 'HRMO', name: 'Hunters Ridge',                 region: 'South Saint Louis',   manager: 'Kristen Mooney',     address: '5625 Hunters Valley Court; St. Louis, MO 63129' },
  { code: 'SOMO', name: 'Southpointe',                   region: 'South Saint Louis',   manager: 'Amanda Pickering',   address: '9950 Pointe South Dr.; Sappington, MO 63128' },
  { code: 'SPMO', name: 'Suson Pines',                   region: 'South Saint Louis',   manager: 'Cindy Sykes',        address: '5265 Suson Hills Dr; St. Louis, MO 63128' },
  { code: 'STMO', name: 'The Retreat at Seven Trails',   region: 'South Saint Louis',   manager: 'Brittney Stokes',    address: '500 Seven Trails Drive; Ballwin, MO 63011' },
  { code: 'VLMO', name: 'Vicino on the Lake',            region: 'South Saint Louis',   manager: 'Christy Smith',      address: '1003 Mariners Point Dr.; Creve Coeur, MO 63141' },
  { code: 'WVMO', name: 'Westchester Village',           region: 'South Saint Louis',   manager: 'Manivanh Savilay',   address: "941 Clubhouse Lane; O'Fallon, MO 63366" },
  { code: 'GGMO', name: 'The Villages at General Grant', region: 'South Saint Louis',  manager: 'Cindy Schutz',       address: '7482 Hardscrapple Drive; Affton, MO 63123' },
  { code: 'HEMO', name: 'Heritage Estates',              region: 'South Saint Louis',  manager: 'Kirsten Green',      address: '9196 Heritage Drive; Affton, MO 63123' },
  { code: 'SWMO', name: 'Southwoods',                    region: 'South Saint Louis',  manager: 'Melody Whited',      address: '9287 Fort Sumter Lane; Sappington, MO 63126' },
  { code: 'VRMO', name: 'Village Royale',                region: 'South Saint Louis',  manager: 'Alen Palislamovic',  address: '5602 Duessel Lane; St. Louis, MO 63128' },
];

export const PCOLOR: Record<string, string> = {
  /* Mocky Saymiknha — blues */
  CCMO: '#5e97cc', FWMO: '#3f7cb8', PCMO: '#2f6199', TDMO: '#1d4f82',
  /* Brenda Conway — greens */
  GMMO: '#4caf82', HRMO: '#3a9870', SOMO: '#2e7d5e', SPMO: '#246650',
  STMO: '#1a4f3e', VLMO: '#5bbf94', WVMO: '#107040',
  /* Joseph Randoll — purples */
  GGMO: '#9b6bbf', HEMO: '#7d4fa8', SWMO: '#61388f', VRMO: '#472a6e',
};
