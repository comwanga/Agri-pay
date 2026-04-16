// Shared world currency list used by CurrencyConverter and DisplayOptions.
// Organised by region so search results feel intuitive.
// Flags use Unicode regional indicator pairs (standard emoji flag sequences).

export const WORLD_CURRENCIES = [
  // ── East Africa ────────────────────────────────────────────────────────────
  { code: 'KES', name: 'Kenyan Shilling',           flag: '🇰🇪' },
  { code: 'TZS', name: 'Tanzanian Shilling',        flag: '🇹🇿' },
  { code: 'UGX', name: 'Ugandan Shilling',          flag: '🇺🇬' },
  { code: 'RWF', name: 'Rwandan Franc',             flag: '🇷🇼' },
  { code: 'ETB', name: 'Ethiopian Birr',            flag: '🇪🇹' },
  { code: 'BIF', name: 'Burundian Franc',           flag: '🇧🇮' },
  { code: 'DJF', name: 'Djiboutian Franc',          flag: '🇩🇯' },
  { code: 'ERN', name: 'Eritrean Nakfa',            flag: '🇪🇷' },
  { code: 'SOS', name: 'Somali Shilling',           flag: '🇸🇴' },
  { code: 'SSP', name: 'South Sudanese Pound',      flag: '🇸🇸' },
  { code: 'SDG', name: 'Sudanese Pound',            flag: '🇸🇩' },
  // ── West Africa ────────────────────────────────────────────────────────────
  { code: 'NGN', name: 'Nigerian Naira',            flag: '🇳🇬' },
  { code: 'GHS', name: 'Ghanaian Cedi',             flag: '🇬🇭' },
  { code: 'XOF', name: 'West African CFA Franc',    flag: '🇸🇳' }, // Senegal as representative
  { code: 'GMD', name: 'Gambian Dalasi',            flag: '🇬🇲' },
  { code: 'GNF', name: 'Guinean Franc',             flag: '🇬🇳' },
  { code: 'LRD', name: 'Liberian Dollar',           flag: '🇱🇷' },
  { code: 'SLE', name: 'Sierra Leonean Leone',      flag: '🇸🇱' },
  { code: 'CVE', name: 'Cape Verdean Escudo',       flag: '🇨🇻' },
  { code: 'MRU', name: 'Mauritanian Ouguiya',       flag: '🇲🇷' },
  { code: 'STN', name: 'São Tomé Dobra',            flag: '🇸🇹' },
  // ── Central Africa ─────────────────────────────────────────────────────────
  { code: 'XAF', name: 'Central African CFA Franc', flag: '🇨🇲' }, // Cameroon as representative
  { code: 'CDF', name: 'Congolese Franc',           flag: '🇨🇩' },
  { code: 'AOA', name: 'Angolan Kwanza',            flag: '🇦🇴' },
  // ── North Africa ───────────────────────────────────────────────────────────
  { code: 'EGP', name: 'Egyptian Pound',            flag: '🇪🇬' },
  { code: 'MAD', name: 'Moroccan Dirham',           flag: '🇲🇦' },
  { code: 'TND', name: 'Tunisian Dinar',            flag: '🇹🇳' },
  { code: 'DZD', name: 'Algerian Dinar',            flag: '🇩🇿' },
  { code: 'LYD', name: 'Libyan Dinar',              flag: '🇱🇾' },
  // ── Southern Africa ────────────────────────────────────────────────────────
  { code: 'ZAR', name: 'South African Rand',        flag: '🇿🇦' },
  { code: 'ZMW', name: 'Zambian Kwacha',            flag: '🇿🇲' },
  { code: 'MZN', name: 'Mozambican Metical',        flag: '🇲🇿' },
  { code: 'BWP', name: 'Botswana Pula',             flag: '🇧🇼' },
  { code: 'ZWL', name: 'Zimbabwean Dollar',         flag: '🇿🇼' },
  { code: 'NAD', name: 'Namibian Dollar',           flag: '🇳🇦' },
  { code: 'MWK', name: 'Malawian Kwacha',           flag: '🇲🇼' },
  { code: 'SZL', name: 'Swazi Lilangeni',           flag: '🇸🇿' },
  { code: 'LSL', name: 'Lesotho Loti',              flag: '🇱🇸' },
  // ── Indian Ocean Islands ───────────────────────────────────────────────────
  { code: 'MGA', name: 'Malagasy Ariary',           flag: '🇲🇬' },
  { code: 'MUR', name: 'Mauritian Rupee',           flag: '🇲🇺' },
  { code: 'SCR', name: 'Seychellois Rupee',         flag: '🇸🇨' },
  { code: 'KMF', name: 'Comorian Franc',            flag: '🇰🇲' },
  // ── Americas ───────────────────────────────────────────────────────────────
  { code: 'USD', name: 'US Dollar',                 flag: '🇺🇸' },
  { code: 'CAD', name: 'Canadian Dollar',           flag: '🇨🇦' },
  { code: 'BRL', name: 'Brazilian Real',            flag: '🇧🇷' },
  { code: 'MXN', name: 'Mexican Peso',              flag: '🇲🇽' },
  { code: 'ARS', name: 'Argentine Peso',            flag: '🇦🇷' },
  { code: 'CLP', name: 'Chilean Peso',              flag: '🇨🇱' },
  { code: 'COP', name: 'Colombian Peso',            flag: '🇨🇴' },
  { code: 'PEN', name: 'Peruvian Sol',              flag: '🇵🇪' },
  // ── Europe ─────────────────────────────────────────────────────────────────
  { code: 'EUR', name: 'Euro',                      flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound',             flag: '🇬🇧' },
  { code: 'CHF', name: 'Swiss Franc',               flag: '🇨🇭' },
  { code: 'SEK', name: 'Swedish Krona',             flag: '🇸🇪' },
  { code: 'NOK', name: 'Norwegian Krone',           flag: '🇳🇴' },
  { code: 'DKK', name: 'Danish Krone',              flag: '🇩🇰' },
  { code: 'PLN', name: 'Polish Zloty',              flag: '🇵🇱' },
  { code: 'CZK', name: 'Czech Koruna',              flag: '🇨🇿' },
  { code: 'HUF', name: 'Hungarian Forint',          flag: '🇭🇺' },
  { code: 'UAH', name: 'Ukrainian Hryvnia',         flag: '🇺🇦' },
  { code: 'TRY', name: 'Turkish Lira',              flag: '🇹🇷' },
  { code: 'RUB', name: 'Russian Ruble',             flag: '🇷🇺' },
  // ── Middle East ────────────────────────────────────────────────────────────
  { code: 'AED', name: 'UAE Dirham',                flag: '🇦🇪' },
  { code: 'SAR', name: 'Saudi Riyal',               flag: '🇸🇦' },
  { code: 'QAR', name: 'Qatari Riyal',              flag: '🇶🇦' },
  { code: 'KWD', name: 'Kuwaiti Dinar',             flag: '🇰🇼' },
  { code: 'ILS', name: 'Israeli Shekel',            flag: '🇮🇱' },
  { code: 'BHD', name: 'Bahraini Dinar',            flag: '🇧🇭' },
  { code: 'OMR', name: 'Omani Rial',                flag: '🇴🇲' },
  { code: 'JOD', name: 'Jordanian Dinar',           flag: '🇯🇴' },
  // ── Asia Pacific ───────────────────────────────────────────────────────────
  { code: 'CNY', name: 'Chinese Yuan',              flag: '🇨🇳' },
  { code: 'JPY', name: 'Japanese Yen',              flag: '🇯🇵' },
  { code: 'INR', name: 'Indian Rupee',              flag: '🇮🇳' },
  { code: 'KRW', name: 'South Korean Won',          flag: '🇰🇷' },
  { code: 'SGD', name: 'Singapore Dollar',          flag: '🇸🇬' },
  { code: 'HKD', name: 'Hong Kong Dollar',          flag: '🇭🇰' },
  { code: 'TWD', name: 'Taiwan Dollar',             flag: '🇹🇼' },
  { code: 'AUD', name: 'Australian Dollar',         flag: '🇦🇺' },
  { code: 'NZD', name: 'New Zealand Dollar',        flag: '🇳🇿' },
  { code: 'MYR', name: 'Malaysian Ringgit',         flag: '🇲🇾' },
  { code: 'IDR', name: 'Indonesian Rupiah',         flag: '🇮🇩' },
  { code: 'PHP', name: 'Philippine Peso',           flag: '🇵🇭' },
  { code: 'THB', name: 'Thai Baht',                 flag: '🇹🇭' },
  { code: 'VND', name: 'Vietnamese Dong',           flag: '🇻🇳' },
  { code: 'PKR', name: 'Pakistani Rupee',           flag: '🇵🇰' },
  { code: 'BDT', name: 'Bangladeshi Taka',          flag: '🇧🇩' },
  { code: 'LKR', name: 'Sri Lankan Rupee',          flag: '🇱🇰' },
  { code: 'MMK', name: 'Myanmar Kyat',              flag: '🇲🇲' },
] as const

export type CurrencyCode = typeof WORLD_CURRENCIES[number]['code']

export function getCurrencyMeta(code: string) {
  return WORLD_CURRENCIES.find(c => c.code === code)
}
