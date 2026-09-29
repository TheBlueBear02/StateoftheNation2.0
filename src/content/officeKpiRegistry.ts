/** Auto-derived from Layer 1 kpi_sources.yaml — re-run extract when registry changes. */
export type OfficeKpiRegistryRelease = {
  window?: string
  year_offset?: number
  min_lag_days?: number
  max_lag_days?: number
  check_every_days?: number
}

export type OfficeKpiRegistryEntry = {
  key: number
  name: string
  office: string
  kind: string
  frequency: 'yearly' | 'monthly'
  adapterFamily: string
  /** True when an adapter is registered in ADAPTERS today. */
  automated: boolean
  release: OfficeKpiRegistryRelease
  labelRule: string
  tier: string
}

export const OFFICE_KPI_IMPLEMENTED_FAMILIES = ["boi_sdmx", "cbs_price", "cbs_series", "curated", "datagov", "obudget", "worldbank"] as const

export const OFFICE_KPI_REGISTRY: OfficeKpiRegistryEntry[] = [
  {
    "key": 1,
    "name": "פיגועים",
    "office": "המשרד לביטחון לאומי",
    "kind": "kpi",
    "frequency": "monthly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "min_lag_days": 3,
      "max_lag_days": 30,
      "check_every_days": 2
    },
    "labelRule": "month_end",
    "tier": "C"
  },
  {
    "key": 2,
    "name": "רצח בחברה הערבית",
    "office": "המשרד לביטחון לאומי",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "manual_watch",
    "automated": false,
    "release": {
      "window": "01-01..06-30",
      "check_every_days": 14
    },
    "labelRule": "yearly_jan1",
    "tier": "D"
  },
  {
    "key": 14,
    "name": "נרצחים בפיגועים",
    "office": "המשרד לביטחון לאומי",
    "kind": "kpi",
    "frequency": "monthly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "min_lag_days": 3,
      "max_lag_days": 30,
      "check_every_days": 2
    },
    "labelRule": "month_end",
    "tier": "C"
  },
  {
    "key": 18,
    "name": "רצח נשים",
    "office": "המשרד לביטחון לאומי",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "manual_watch",
    "automated": false,
    "release": {
      "window": "01-01..06-30",
      "check_every_days": 14
    },
    "labelRule": "yearly_jan1",
    "tier": "D"
  },
  {
    "key": 19,
    "name": "תיקים במשטרה",
    "office": "המשרד לביטחון לאומי",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "05-01..10-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 20,
    "name": "גניבות רכב",
    "office": "המשרד לביטחון לאומי",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "05-01..10-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 38,
    "name": "אמון במשטרה",
    "office": "המשרד לביטחון לאומי",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "manual_watch",
    "automated": false,
    "release": {
      "window": "01-01..06-30",
      "check_every_days": 14
    },
    "labelRule": "yearly_jan1",
    "tier": "D"
  },
  {
    "key": 3,
    "name": "חלוקת כלי נשק",
    "office": "המשרד לביטחון לאומי",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "manual_watch",
    "automated": false,
    "release": {
      "window": "01-01..06-30",
      "check_every_days": 14
    },
    "labelRule": "yearly_jan1",
    "tier": "D"
  },
  {
    "key": 21,
    "name": "כוח אדם במשטרה",
    "office": "המשרד לביטחון לאומי",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "05-01..10-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 22,
    "name": "תקציב",
    "office": "המשרד לביטחון לאומי",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "obudget",
    "automated": true,
    "release": {
      "window": "03-01..07-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 39,
    "name": "מעצרים פליליים",
    "office": "המשרד לביטחון לאומי",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "05-01..10-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 40,
    "name": "מתנדבי המשטרה",
    "office": "המשרד לביטחון לאומי",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "05-01..10-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 26,
    "name": "תאונות דרכים",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "05-01..10-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 28,
    "name": "מספר כלי רכב",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "curated",
    "automated": true,
    "release": {
      "window": "03-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 29,
    "name": "כלי רכב חשמליים",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "datagov",
    "automated": true,
    "release": {
      "window": "01-05..01-31",
      "check_every_days": 1
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 30,
    "name": "נוסעים בנתב\"ג",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "kpi",
    "frequency": "monthly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "min_lag_days": 3,
      "max_lag_days": 35,
      "check_every_days": 2
    },
    "labelRule": "month_start",
    "tier": "B"
  },
  {
    "key": 31,
    "name": "נסיעות באוטובסים",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "03-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 34,
    "name": "נוסעים ברכבת",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "cbs_series",
    "automated": true,
    "release": {
      "window": "03-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 36,
    "name": "הרוגים בתאונות דרכים",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "curated",
    "automated": true,
    "release": {
      "window": "01-01..03-31",
      "check_every_days": 3
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 24,
    "name": "תקציב",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "obudget",
    "automated": true,
    "release": {
      "window": "03-01..07-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 27,
    "name": "תקציב התחבורה הציבורית",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "obudget",
    "automated": true,
    "release": {
      "window": "03-01..07-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 32,
    "name": "מחיר הדלק",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "curated",
    "automated": true,
    "release": {
      "window": "01-01..02-15",
      "year_offset": 0,
      "check_every_days": 3
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 33,
    "name": "תקציב בטיחות בדרכים",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "obudget",
    "automated": true,
    "release": {
      "window": "03-01..07-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 37,
    "name": "תקציב תשתיות כבישים",
    "office": "משרד התחבורה והבטיחות בדרכים",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "obudget",
    "automated": true,
    "release": {
      "window": "03-01..07-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 35,
    "name": "זכאים לתעודת בגרות",
    "office": "משרד החינוך",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "03-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "B"
  },
  {
    "key": 41,
    "name": "מספר תלמידים בכיתה",
    "office": "משרד החינוך",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "shkifut",
    "automated": false,
    "release": {
      "window": "09-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A'"
  },
  {
    "key": 43,
    "name": "מספר תלמידים בישראל",
    "office": "משרד החינוך",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "shkifut",
    "automated": false,
    "release": {
      "window": "09-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A'"
  },
  {
    "key": 44,
    "name": "בוגרי תואר ראשון",
    "office": "משרד החינוך",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "03-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "B"
  },
  {
    "key": 45,
    "name": "בוגרי תואר שלישי",
    "office": "משרד החינוך",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "03-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "B"
  },
  {
    "key": 46,
    "name": "תלמידים בחינוך החרדי",
    "office": "משרד החינוך",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "shkifut",
    "automated": false,
    "release": {
      "window": "09-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A'"
  },
  {
    "key": 62,
    "name": "נושרים ממערכת החינוך",
    "office": "משרד החינוך",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "03-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 25,
    "name": "תקציב",
    "office": "משרד החינוך",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "obudget",
    "automated": true,
    "release": {
      "window": "03-01..07-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 42,
    "name": "עלות לתלמיד",
    "office": "משרד החינוך",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "shkifut",
    "automated": false,
    "release": {
      "window": "09-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A'"
  },
  {
    "key": 47,
    "name": "שכר מורים",
    "office": "משרד החינוך",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "manual_watch",
    "automated": false,
    "release": {
      "window": "01-01..06-30",
      "check_every_days": 14
    },
    "labelRule": "yearly_jan1",
    "tier": "D"
  },
  {
    "key": 48,
    "name": "חמש יחידות מתמטיקה",
    "office": "משרד החינוך",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "shkifut",
    "automated": false,
    "release": {
      "window": "09-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A'"
  },
  {
    "key": 49,
    "name": "סגל בכיר באוניברסיטאות",
    "office": "משרד החינוך",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "03-01..12-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 53,
    "name": "אינפלציה",
    "office": "משרד האוצר",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "cbs_price",
    "automated": true,
    "release": {
      "window": "01-08..01-20",
      "check_every_days": 1
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 54,
    "name": "צמיחה",
    "office": "משרד האוצר",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "cbs_series",
    "automated": true,
    "release": {
      "window": "01-15..04-30",
      "check_every_days": 3
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 56,
    "name": "מחירי הדירות",
    "office": "משרד האוצר",
    "kind": "kpi",
    "frequency": "monthly",
    "adapterFamily": "cbs_price",
    "automated": true,
    "release": {
      "min_lag_days": 35,
      "max_lag_days": 60,
      "check_every_days": 1
    },
    "labelRule": "month_start",
    "tier": "A"
  },
  {
    "key": 57,
    "name": "שוויון",
    "office": "משרד האוצר",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "document",
    "automated": false,
    "release": {
      "window": "11-15..02-28",
      "check_every_days": 3
    },
    "labelRule": "yearly_jan1",
    "tier": "C"
  },
  {
    "key": 58,
    "name": "שכר ממוצע",
    "office": "משרד האוצר",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "cbs_series",
    "automated": true,
    "release": {
      "window": "01-15..04-30",
      "check_every_days": 3
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 60,
    "name": "אחוז אבטלה",
    "office": "משרד האוצר",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "cbs_series",
    "automated": true,
    "release": {
      "window": "01-15..04-30",
      "check_every_days": 3
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 61,
    "name": "תמ\"ג לנפש",
    "office": "משרד האוצר",
    "kind": "kpi",
    "frequency": "yearly",
    "adapterFamily": "worldbank",
    "automated": true,
    "release": {
      "window": "06-01..10-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 50,
    "name": "תקציב",
    "office": "משרד האוצר",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "obudget",
    "automated": true,
    "release": {
      "window": "03-01..07-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 51,
    "name": "עודף/גירעון",
    "office": "משרד האוצר",
    "kind": "policy",
    "frequency": "monthly",
    "adapterFamily": "boi_sdmx",
    "automated": true,
    "release": {
      "min_lag_days": 5,
      "max_lag_days": 35,
      "check_every_days": 1
    },
    "labelRule": "month_start",
    "tier": "A"
  },
  {
    "key": 52,
    "name": "יחס חוב תוצר",
    "office": "משרד האוצר",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "curated",
    "automated": true,
    "release": {
      "window": "02-01..06-30",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 55,
    "name": "החוב הממשלתי",
    "office": "משרד האוצר",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "curated",
    "automated": true,
    "release": {
      "window": "02-01..06-30",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  },
  {
    "key": 59,
    "name": "תקציב המדינה",
    "office": "משרד האוצר",
    "kind": "policy",
    "frequency": "yearly",
    "adapterFamily": "obudget",
    "automated": true,
    "release": {
      "window": "03-01..07-31",
      "check_every_days": 7
    },
    "labelRule": "yearly_jan1",
    "tier": "A"
  }
]
