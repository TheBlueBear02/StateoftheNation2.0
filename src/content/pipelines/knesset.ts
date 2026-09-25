import type { PipelineDoc } from './types'

export const knessetPipeline: PipelineDoc = {
  id: 'knesset',
  title: 'נתוני הכנסת',
  subtitle:
    'צינור זה מזין את כל נתוני הכנסת: כנסות, סיעות, חברי כנסת, ממשלות, משרדים ומינויים.',
  status: 'live',
  docsPath: '/piplines/docs/knesset',
  editPath: '/knesset/edit',
  schedule: {
    label: 'כל יום שבת בחצות · 00:00 שעון ישראל',
    cron: '0 21 * * 5',
    timezone: 'Asia/Jerusalem',
  },
  sections: [
    {
      id: 'overview',
      title: 'סקירה',
      paragraphs: [
        'תהליך הסנכרון שולף נתונים מ-Knesset OData API, ממפה שדות לטבלאות היעד, ומעדכן רשומות לפי מפתח ייחודי לכל טבלה.',
        'הכתיבה היא insert לשורות חדשות ועדכון רק כששדות ה-OData השתנו — אין מחיקות ואין כתיבה מחדש לשורות זהות. שדות ידניים (צבע סיעה, קואליציה וכו׳) לא נדרסים.',
        'הצינור רץ כל יום שבת בחצות שעון ישראל ב-GitHub Actions (21:00 UTC ביום שישי בקיץ).',
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
        'הטבלאות הבאות מתעדכנות בכל סנכרון מלא. שדות שלא קיימים ב-OData (למשל is_coalition, color בסיעות) נשארים לעדכון ידני או לסקריפטים נלווים. סטטוס קואליציה נשמר רק ב־knesset_factions — לא ב־knesset_memberships.',
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
        'הסקריפט נמצא ב-Layer 1 - Gathering Data/knesset/. סנכרון מלא רץ אוטומטית פעם בשבוע, ואפשר גם להריץ ידנית סנכרון מלא, טבלה בודדת, או מצב בדיקה לשדות שמגיעים מה-API.',
      ],
      code: `# סנכרון מלא (גם מה ש-GitHub Actions מריץ)
python load_all_knesset_data.py

# טבלה בודדת
python load_all_knesset_data.py --table people

# בדיקת שדות מה-API
python load_all_knesset_data.py --discover`,
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
    {
      id: 'site-updates',
      title: 'עדכון לפס החדשות בדף הבית',
      paragraphs: [
        'שלב 7 בצינור העריכה (יצירת עדכון) קורא לכלי המשותף לעדכוני האתר. שלב 6 משווה חברויות ומינויים לפני ואחרי ושומר שינויים ממתינים; שלב 7 מייצר מהם כותרת עברית לפס החדשות עם קישור לעמוד הכנסת.',
        'בממשק העריכה אפשר לראות את הכותרת שנוצרה, לערוך אותה ולשמור מחדש. ריצות CLI ו-GitHub Actions פולטות את העדכון אוטומטית בסיום סנכרון החברויות והמינויים — רק כשיש diff אמיתי בשדות האלה (לא על הוספת אדם/סיעה בלבד).',
        'בלי שינוי אמיתי או בכשל ביצירת הכותרת — אין כתיבה לפס; הסנכרון עצמו לא נפגע.',
      ],
    },
  ],
}
