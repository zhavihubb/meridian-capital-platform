/* ==========================================================
   Country → currency mapping (world coverage)
   Owner's spec: US → USD ($), UK → EUR (€) per request.
   rate = user-currency per 1 USD (display conversion only).
   ========================================================== */

const EUR = { code: 'EUR', symbol: '€', rate: 1.08, name: 'Euro', flag: '🇪🇺' };
const GBP = { code: 'GBP', symbol: '£', rate: 0.79, name: 'British Pound', flag: '🇬🇧' };
const USD = { code: 'USD', symbol: '$', rate: 1, name: 'US Dollar', flag: '🇺🇸' };
const CAD = { code: 'CAD', symbol: 'C$', rate: 1.36, name: 'Canadian Dollar', flag: '🇨🇦' };
const AUD = { code: 'AUD', symbol: 'A$', rate: 1.52, name: 'Australian Dollar', flag: '🇦🇺' };
const NZD = { code: 'NZD', symbol: 'NZ$', rate: 1.64, name: 'New Zealand Dollar', flag: '🇳🇿' };
const NGN = { code: 'NGN', symbol: '₦', rate: 1550, name: 'Nigerian Naira', flag: '🇳🇬' };
const ZAR = { code: 'ZAR', symbol: 'R', rate: 18.4, name: 'South African Rand', flag: '🇿🇦' };
const KES = { code: 'KES', symbol: 'KSh', rate: 130, name: 'Kenyan Shilling', flag: '🇰🇪' };
const GHS = { code: 'GHS', symbol: 'GH₵', rate: 15.2, name: 'Ghanaian Cedi', flag: '🇬🇭' };
const INR = { code: 'INR', symbol: '₹', rate: 83.3, name: 'Indian Rupee', flag: '🇮🇳' };
const JPY = { code: 'JPY', symbol: '¥', rate: 155, name: 'Japanese Yen', flag: '🇯🇵' };
const CNY = { code: 'CNY', symbol: '¥', rate: 7.24, name: 'Chinese Yuan', flag: '🇨🇳' };
const KRW = { code: 'KRW', symbol: '₩', rate: 1370, name: 'South Korean Won', flag: '🇰🇷' };
const TWD = { code: 'TWD', symbol: 'NT$', rate: 32.2, name: 'Taiwan Dollar', flag: '🇹🇼' };
const HKD = { code: 'HKD', symbol: 'HK$', rate: 7.82, name: 'Hong Kong Dollar', flag: '🇭🇰' };
const SGD = { code: 'SGD', symbol: 'S$', rate: 1.35, name: 'Singapore Dollar', flag: '🇸🇬' };
const BRL = { code: 'BRL', symbol: 'R$', rate: 5.45, name: 'Brazilian Real', flag: '🇧🇷' };
const MXN = { code: 'MXN', symbol: 'MX$', rate: 17.1, name: 'Mexican Peso', flag: '🇲🇽' };
const AED = { code: 'AED', symbol: 'د.إ', rate: 3.67, name: 'UAE Dirham', flag: '🇦🇪' };
const SAR = { code: 'SAR', symbol: '﷼', rate: 3.75, name: 'Saudi Riyal', flag: '🇸🇦' };
const CHF = { code: 'CHF', symbol: 'CHF', rate: 0.90, name: 'Swiss Franc', flag: '🇨🇭' };
const SEK = { code: 'SEK', symbol: 'kr', rate: 10.5, name: 'Swedish Krona', flag: '🇸🇪' };
const NOK = { code: 'NOK', symbol: 'kr', rate: 10.7, name: 'Norwegian Krone', flag: '🇳🇴' };
const DKK = { code: 'DKK', symbol: 'kr', rate: 6.87, name: 'Danish Krone', flag: '🇩🇰' };
const PLN = { code: 'PLN', symbol: 'zł', rate: 3.95, name: 'Polish Złoty', flag: '🇵🇱' };
const CZK = { code: 'CZK', symbol: 'Kč', rate: 22.9, name: 'Czech Koruna', flag: '🇨🇿' };
const HUF = { code: 'HUF', symbol: 'Ft', rate: 360, name: 'Hungarian Forint', flag: '🇭🇺' };
const RON = { code: 'RON', symbol: 'lei', rate: 4.58, name: 'Romanian Leu', flag: '🇷🇴' };
const BGN = { code: 'BGN', symbol: 'лв', rate: 1.81, name: 'Bulgarian Lev', flag: '🇧🇬' };
const TRY = { code: 'TRY', symbol: '₺', rate: 32.5, name: 'Turkish Lira', flag: '🇹🇷' };
const RUB = { code: 'RUB', symbol: '₽', rate: 92, name: 'Russian Ruble', flag: '🇷🇺' };
const UAH = { code: 'UAH', symbol: '₴', rate: 39.5, name: 'Ukrainian Hryvnia', flag: '🇺🇦' };
const THB = { code: 'THB', symbol: '฿', rate: 36.5, name: 'Thai Baht', flag: '🇹🇭' };
const MYR = { code: 'MYR', symbol: 'RM', rate: 4.72, name: 'Malaysian Ringgit', flag: '🇲🇾' };
const IDR = { code: 'IDR', symbol: 'Rp', rate: 16200, name: 'Indonesian Rupiah', flag: '🇮🇩' };
const PHP = { code: 'PHP', symbol: '₱', rate: 58.2, name: 'Philippine Peso', flag: '🇵🇭' };
const VND = { code: 'VND', symbol: '₫', rate: 25400, name: 'Vietnamese Dong', flag: '🇻🇳' };
const PKR = { code: 'PKR', symbol: 'Rs', rate: 278, name: 'Pakistani Rupee', flag: '🇵🇰' };
const BDT = { code: 'BDT', symbol: '৳', rate: 117, name: 'Bangladeshi Taka', flag: '🇧🇩' };
const LKR = { code: 'LKR', symbol: 'Rs', rate: 300, name: 'Sri Lankan Rupee', flag: '🇱🇰' };
const NPR = { code: 'NPR', symbol: 'Rs', rate: 133, name: 'Nepalese Rupee', flag: '🇳🇵' };
const EGP = { code: 'EGP', symbol: 'E£', rate: 48.5, name: 'Egyptian Pound', flag: '🇪🇬' };
const MAD = { code: 'MAD', symbol: 'DH', rate: 10.1, name: 'Moroccan Dirham', flag: '🇲🇦' };
const TZS = { code: 'TZS', symbol: 'TSh', rate: 2650, name: 'Tanzanian Shilling', flag: '🇹🇿' };
const UGX = { code: 'UGX', symbol: 'USh', rate: 3900, name: 'Ugandan Shilling', flag: '🇺🇬' };
const XOF = { code: 'XOF', symbol: 'CFA', rate: 605, name: 'West African CFA Franc', flag: '🌍' };
const XAF = { code: 'XAF', symbol: 'FCFA', rate: 605, name: 'Central African CFA Franc', flag: '🌍' };
const QAR = { code: 'QAR', symbol: 'QR', rate: 3.64, name: 'Qatari Riyal', flag: '🇶🇦' };
const KWD = { code: 'KWD', symbol: 'KD', rate: 0.31, name: 'Kuwaiti Dinar', flag: '🇰🇼' };
const BHD = { code: 'BHD', symbol: 'BD', rate: 0.38, name: 'Bahraini Dinar', flag: '🇧🇭' };
const OMR = { code: 'OMR', symbol: 'OMR', rate: 0.385, name: 'Omani Rial', flag: '🇴🇲' };
const JOD = { code: 'JOD', symbol: 'JD', rate: 0.71, name: 'Jordanian Dinar', flag: '🇯🇴' };
const ILS = { code: 'ILS', symbol: '₪', rate: 3.68, name: 'Israeli New Shekel', flag: '🇮🇱' };
const ARS = { code: 'ARS', symbol: 'AR$', rate: 890, name: 'Argentine Peso', flag: '🇦🇷' };
const CLP = { code: 'CLP', symbol: 'CLP$', rate: 940, name: 'Chilean Peso', flag: '🇨🇱' };
const COP = { code: 'COP', symbol: 'COL$', rate: 3900, name: 'Colombian Peso', flag: '🇨🇴' };
const PEN = { code: 'PEN', symbol: 'S/', rate: 3.72, name: 'Peruvian Sol', flag: '🇵🇪' };

const COUNTRY_CURRENCY = {
  /* Americas */
  US: USD,
  CA: CAD, MX: MXN, BR: BRL, AR: ARS, CL: CLP, CO: COP, PE: PEN,
  UY: { code: 'UYU', symbol: 'U$S', rate: 39, name: 'Uruguayan Peso', flag: '🇺🇾' },
  PY: { code: 'PYG', symbol: '₲', rate: 7300, name: 'Paraguayan Guaraní', flag: '🇵🇾' },
  BO: { code: 'BOB', symbol: 'Bs', rate: 6.9, name: 'Bolivian Boliviano', flag: '🇧🇴' },
  EC: USD, VE: { code: 'VES', symbol: 'Bs.', rate: 36.5, name: 'Venezuelan Bolívar', flag: '🇻🇪' },
  PA: { code: 'PAB', symbol: 'B/.', rate: 1, name: 'Panamanian Balboa', flag: '🇵🇦' },
  CR: { code: 'CRC', symbol: '₡', rate: 512, name: 'Costa Rican Colón', flag: '🇨🇷' },
  DO: { code: 'DOP', symbol: 'RD$', rate: 59, name: 'Dominican Peso', flag: '🇩🇴' },
  GT: { code: 'GTQ', symbol: 'Q', rate: 7.8, name: 'Guatemalan Quetzal', flag: '🇬🇹' },
  HN: { code: 'HNL', symbol: 'L', rate: 24.7, name: 'Honduran Lempira', flag: '🇭🇳' },
  NI: { code: 'NIO', symbol: 'C$', rate: 36.8, name: 'Nicaraguan Córdoba', flag: '🇳🇮' },
  SV: { code: 'USD', symbol: '$', rate: 1, name: 'US Dollar', flag: '🇸🇻' },
  CU: { code: 'CUP', symbol: '$MN', rate: 24, name: 'Cuban Peso', flag: '🇨🇺' },
  JM: { code: 'JMD', symbol: 'J$', rate: 155, name: 'Jamaican Dollar', flag: '🇯🇲' },
  TT: { code: 'TTD', symbol: 'TT$', rate: 6.79, name: 'Trinidad & Tobago Dollar', flag: '🇹🇹' },
  BB: { code: 'BBD', symbol: 'Bds$', rate: 2, name: 'Barbadian Dollar', flag: '🇧🇧' },
  BS: { code: 'BSD', symbol: 'B$', rate: 1, name: 'Bahamian Dollar', flag: '🇧🇸' },
  HT: { code: 'HTG', symbol: 'G', rate: 132, name: 'Haitian Gourde', flag: '🇭🇹' },

  /* Europe */
  GB: GBP,                                  /* United Kingdom -> GBP */
  DE: EUR, FR: EUR, IT: EUR, ES: EUR, NL: EUR, BE: EUR, AT: EUR, IE: EUR, PT: EUR, GR: EUR,
  FI: EUR, SK: EUR, SI: EUR, LT: EUR, LV: EUR, EE: EUR, LU: EUR, CY: EUR, MT: EUR, HR: EUR,
  BG: BGN, RO: RON, CZ: CZK, HU: HUF, PL: PLN,
  DK: DKK, SE: SEK, NO: NOK,
  IS: { code: 'ISK', symbol: 'kr', rate: 138, name: 'Icelandic Króna', flag: '🇮🇸' },
  CH: CHF, TR: TRY, RU: RUB, UA: UAH, RS: { code: 'RSD', symbol: 'дин', rate: 108, name: 'Serbian Dinar', flag: '🇷🇸' },
  MD: { code: 'MDL', symbol: 'L', rate: 17.7, name: 'Moldovan Leu', flag: '🇲🇩' },
  GE: { code: 'GEL', symbol: '₾', rate: 2.65, name: 'Georgian Lari', flag: '🇬🇪' },
  AM: { code: 'AMD', symbol: '֏', rate: 396, name: 'Armenian Dram', flag: '🇦🇲' },
  AZ: { code: 'AZN', symbol: '₼', rate: 1.70, name: 'Azerbaijani Manat', flag: '🇦🇿' },
  BY: { code: 'BYN', symbol: 'Br', rate: 3.27, name: 'Belarusian Ruble', flag: '🇧🇾' },
  AL: { code: 'ALL', symbol: 'L', rate: 92, name: 'Albanian Lek', flag: '🇦🇱' },
  MK: { code: 'MKD', symbol: 'ден', rate: 57, name: 'Macedonian Denar', flag: '🇲🇰' },
  BA: { code: 'BAM', symbol: 'KM', rate: 1.80, name: 'Bosnia & Herzegovina Convertible Mark', flag: '🇧🇦' },
  ME: EUR,

  /* Africa */
  NG: NGN, ZA: ZAR, KE: KES, GH: GHS, EG: EGP, MA: MAD, TZ: TZS, UG: UGX,
  DZ: { code: 'DZD', symbol: 'DA', rate: 134, name: 'Algerian Dinar', flag: '🇩🇿' },
  SN: XOF, CI: XOF, ML: XOF, BF: XOF, BJ: XOF, TG: XOF, NE: XOF, GN: XOF, GW: XOF, LR: XOF, SL: XOF, GM: XOF,
  CV: { code: 'CVE', symbol: '$', rate: 101, name: 'Cape Verdean Escudo', flag: '🇨🇻' },
  CM: XAF, GA: XAF, CG: XAF, TD: XAF, CF: XAF, GQ: XAF,
  LY: { code: 'LYD', symbol: 'LD', rate: 4.85, name: 'Libyan Dinar', flag: '🇱🇾' },
  TN: { code: 'TND', symbol: 'DT', rate: 3.12, name: 'Tunisian Dinar', flag: '🇹🇳' },
  ET: { code: 'ETB', symbol: 'Br', rate: 57, name: 'Ethiopian Birr', flag: '🇪🇹' },
  ZM: { code: 'ZMW', symbol: 'ZK', rate: 27, name: 'Zambian Kwacha', flag: '🇿🇲' },
  ZW: USD, BW: { code: 'BWP', symbol: 'P', rate: 13.7, name: 'Botswana Pula', flag: '🇧🇼' },
  NA: { code: 'NAD', symbol: 'N$', rate: 18.4, name: 'Namibian Dollar', flag: '🇳🇦' },
  MW: { code: 'MWK', symbol: 'MK', rate: 173, name: 'Malawian Kwacha', flag: '🇲🇼' },
  MZ: { code: 'MZN', symbol: 'MT', rate: 63.9, name: 'Mozambican Metical', flag: '🇲🇿' },
  AO: { code: 'AOA', symbol: 'Kz', rate: 8.3, name: 'Angolan Kwanza', flag: '🇦🇴' },
  RW: { code: 'RWF', symbol: 'FRw', rate: 1300, name: 'Rwandan Franc', flag: '🇷🇼' },
  BI: { code: 'BIF', symbol: 'FBu', rate: 2870, name: 'Burundian Franc', flag: '🇧🇮' },
  MU: { code: 'MUR', symbol: '₨', rate: 46.5, name: 'Mauritian Rupee', flag: '🇲🇺' },
  SC: { code: 'SCR', symbol: '₨', rate: 13.4, name: 'Seychellois Rupee', flag: '🇸🇨' },
  SO: { code: 'SOS', symbol: 'Sh', rate: 571, name: 'Somali Shilling', flag: '🇸🇴' },
  SS: { code: 'SSP', symbol: '£', rate: 1300, name: 'South Sudanese Pound', flag: '🇸🇸' },
  ER: { code: 'ERN', symbol: 'Nfk', rate: 15, name: 'Eritrean Nakfa', flag: '🇪🇷' },
  DJ: { code: 'DJF', symbol: 'Fdj', rate: 178, name: 'Djiboutian Franc', flag: '🇩🇯' },

  /* Middle East */
  AE: AED, SA: SAR, QA: QAR, KW: KWD, BH: BHD, OM: OMR, JO: JOD, IL: ILS,
  LB: { code: 'LBP', symbol: 'ل.ل', rate: 89500, name: 'Lebanese Pound', flag: '🇱🇧' },
  IQ: { code: 'IQD', symbol: 'ع.د', rate: 1310, name: 'Iraqi Dinar', flag: '🇮🇶' },
  YE: { code: 'YER', symbol: '﷼', rate: 250, name: 'Yemeni Rial', flag: '🇾🇪' },
  SY: { code: 'SYP', symbol: '£S', rate: 13000, name: 'Syrian Pound', flag: '🇸🇾' },

  /* Asia */
  IN: INR, CN: CNY, JP: JPY, KR: KRW, TW: TWD, HK: HKD, SG: SGD, MY: MYR, TH: THB,
  ID: IDR, PH: PHP, VN: VND, PK: PKR, BD: BDT, LK: LKR, NP: NPR,
  AF: { code: 'AFN', symbol: '؋', rate: 72, name: 'Afghan Afghani', flag: '🇦🇫' },
  KZ: { code: 'KZT', symbol: '₸', rate: 450, name: 'Kazakhstani Tenge', flag: '🇰🇿' },
  UZ: { code: 'UZS', symbol: "so'm", rate: 12700, name: 'Uzbekistani Som', flag: '🇺🇿' },
  MN: { code: 'MNT', symbol: '₮', rate: 3450, name: 'Mongolian Tögrög', flag: '🇲🇳' },
  MM: { code: 'MMK', symbol: 'K', rate: 2100, name: 'Myanmar Kyat', flag: '🇲🇲' },
  KH: { code: 'KHR', symbol: '៛', rate: 4100, name: 'Cambodian Riel', flag: '🇰🇭' },
  LA: { code: 'LAK', symbol: '₭', rate: 20900, name: 'Lao Kip', flag: '🇱🇦' },
  BN: { code: 'BND', symbol: 'B$', rate: 1.34, name: 'Brunei Dollar', flag: '🇧🇳' },
  KG: { code: 'KGS', symbol: 'с', rate: 89.3, name: 'Kyrgyzstani Som', flag: '🇰🇬' },
  TJ: { code: 'TJS', symbol: 'SM', rate: 10.9, name: 'Tajikistani Somoni', flag: '🇹🇯' },
  TM: { code: 'TMT', symbol: 'T', rate: 3.5, name: 'Turkmenistani Manat', flag: '🇹🇲' },
  BT: { code: 'BTN', symbol: 'Nu.', rate: 83.3, name: 'Bhutanese Ngultrum', flag: '🇧🇹' },
  MV: { code: 'MVR', symbol: 'Rf', rate: 15.4, name: 'Maldivian Rufiyaa', flag: '🇲🇻' },

  /* Oceania */
  AU: AUD, NZ: NZD,
  FJ: { code: 'FJD', symbol: 'FJ$', rate: 2.25, name: 'Fijian Dollar', flag: '🇫🇯' },
  PG: { code: 'PGK', symbol: 'K', rate: 3.85, name: 'Papua New Guinean Kina', flag: '🇵🇬' },
  WS: { code: 'WST', symbol: 'T', rate: 2.72, name: 'Samoan Tala', flag: '🇼🇸' },
  TO: { code: 'TOP', symbol: 'T$', rate: 2.38, name: 'Tongan Paanga', flag: '🇹🇴' },
  VU: { code: 'VUV', symbol: 'VT', rate: 119, name: 'Vanuatu Vatu', flag: '🇻🇺' },
  SB: { code: 'SBD', symbol: 'SI$', rate: 8.44, name: 'Solomon Islands Dollar', flag: '🇸🇧' }
};
export default COUNTRY_CURRENCY;
