import type { PipelineDoc } from './types'

export const knessetPipeline: PipelineDoc = {
  id: 'knesset',
  title: 'נתוני הכנסת',
  subtitle:
    'צינור זה מזין את כל נתוני הכנסת: כנסות, סיעות, חברי כנסת, ממשלות, משרדים ומינויים.',
  status: 'live',
  sections: [
    {
      id: 'overview',
      title: 'סקירה',
      paragraphs: [
        'תהליך הסנכרון שולף נתונים מ-Knesset OData API, ממפה שדות לטבלאות היעד, ומעדכן רשומות לפי מפתח ייחודי לכל טבלה.',
        'התיעוד כאן מתמקד במקור הנתונים, בזרימת העיבוד ובמבנה המידע שמגיע לאתר.',
      ],
    },
    {
      id: 'flow',
      title: 'זרימת הנתונים',
      paragraphs: [
        'הסנכרון המלא רץ לפי סדר תלויות — כל שלב בונה מפות מזהים לשלבים הבאים:',
      ],
      list: [
        'knessets — מספרי כנסת (מ-KNS_KnessetDates או נגזר מ-KNS_Faction)',
        'people — חברי כנסת ואנשי ציבור (מ-KNS_Person)',
        'knesset_factions — סיעות לפי כנסת (מ-KNS_Faction)',
        'offices — משרדי ממשלה (מ-KNS_GovMinistry)',
        'governments — ממשלות (מישות OData או נגזר מ-KNS_PersonToPosition)',
        'knesset_memberships + minister_appointments — שני יעדים משליפה אחת של KNS_PersonToPosition',
      ],
    },
    {
      id: 'source',
      title: 'מקור הנתונים',
      paragraphs: [
        'ה-API הרשמי של הכנסת מחזיר Atom/XML בפורמט OData v2. הסקריפט עוקב אחרי קישורי next לדפדוף, ומטפל בחסימות Reblaze עם ניסיונות חוזרים.',
      ],
      code: 'http://knesset.gov.il/Odata/ParliamentInfo.svc',
      table: {
        headers: ['ישות OData', 'טבלת יעד', 'הערות'],
        rows: [
          ['KNS_Person', 'people', 'PersonID, שם, מגדר, אימייל'],
          ['KNS_Faction', 'knesset_factions', 'FactionID, שם, תאריכים — צבע וקואליציה ידניים'],
          ['KNS_GovMinistry', 'offices', 'GovMinistryID, שם משרד'],
          ['KNS_PersonToPosition', 'knesset_memberships', 'PositionID ∈ {1, 61} = חבר כנסת'],
          ['KNS_PersonToPosition', 'minister_appointments', 'שורות עם GovernmentNum + GovMinistryID'],
        ],
      },
    },
    {
      id: 'tables',
      title: 'טבלאות במסד הנתונים',
      paragraphs: [
        'הטבלאות הבאות מתעדכנות בכל סנכרון מלא. שדות שלא קיימים ב-OData (למשל is_coalition, color בסיעות) נשארים לעדכון ידני או לסקריפטים נלווים.',
      ],
      table: {
        headers: ['טבלה', 'מפתח upsert', 'שימוש באתר'],
        rows: [
          ['knessets', 'knesset_number', 'בורר כנסת ב-/knesset'],
          ['people', 'knesset_person_id', 'שמות ותמונות ח"כ'],
          ['knesset_factions', 'knesset_faction_id', 'סיעות, צבעים, קואליציה'],
          ['knesset_memberships', 'knesset_position_id', 'מפת הימין + רשימת סיעות'],
          ['offices', 'knesset_category_id', 'שמות משרדים בטולטיפ'],
          ['governments', 'government_number', 'עתידי — דשבורד ממשלה'],
          ['minister_appointments', 'knesset_position_id', 'תפקידים ממשלתיים בטולטיפ'],
        ],
      },
    },
    {
      id: 'run',
      title: 'הרצה',
      paragraphs: [
        'הסקריפט נמצא ב-Layer 1 - Gathering Data/knesset/. אפשר להריץ סנכרון מלא, סנכרון לטבלה בודדת, או מצב בדיקה לשדות שמגיעים מה-API.',
      ],
      code: `# סנכרון מלא
python sync_knesset_data.py

# טבלה בודדת
python sync_knesset_data.py --table people

# בדיקת שדות מה-API
python sync_knesset_data.py --discover

# איתור שמות ישויות חסרות (כנסות / ממשלות)
python sync_knesset_data.py --probe`,
    },
    {
      id: 'related',
      title: 'סקריפטים נלווים',
      paragraphs: [
        'לאחר הסנכרון, סקריפטים נוספים משלימים נתונים שלא מגיעים מה-OData:',
      ],
      list: [
        'km_images.py — מקשר קבצי JPEG מקומיים לשדה image_url ב-people',
        'fix_faction_links.py / fix_faction_links_all.py — ממלא faction_id בחברויות חסרות',
        'check.py — בדיקות תקינות אד-הוק',
      ],
    },
  ],
}
