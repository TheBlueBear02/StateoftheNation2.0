import type { PipelineDoc } from './types'

export const officeKpisPipeline: PipelineDoc = {
  id: 'office-kpis',
  title: 'מדדי משרדים — דשבורד הממשלה',
  subtitle:
    'צינור לילי שמרענן את 48 המדדים והמדיניות בעמוד /government/dashboard ממקורות רשמיים, עם תור אישור לערכים שדורשים בדיקה.',
  status: 'live',
  docsPath: '/piplines/docs/office-kpis',
  editPath: '/government/dashboard/edit',
  statusPath: '/piplines/government-dashboard',
  schedule: {
    label: 'כל לילה ב־02:00 שעון ישראל',
    cron: '0 23 * * *',
    timezone: 'Asia/Jerusalem',
  },
  sections: [
    {
      id: 'overview',
      title: 'סקירה',
      paragraphs: [
        'הצינור בודק כל לילה אילו מדדים צפויים להתעדכן (לפי חלונות פרסום ברישום המקורות), שולף נתונים מממשקים רשמיים או מקבצים, מאמת אותם מול ההיסטוריה, ומכניס כל ערך חדש לטבלת מועמדים עם מקור וראיות.',
        'ערכים מממשק רשמי שעוברים אימות מתפרסמים אוטומטית לטבלת הנתונים של הדשבורד. ערכים מקבצים, ממודל שפה, או עם דגל אימות — ממתינים לאישור ידני במסך העריכה.',
      ],
    },
    {
      id: 'flow',
      title: 'זרימת הנתונים',
      list: [
        '1. תכנון — אילו מדדים לבדוק הלילה (חלון פרסום / איחור / סריקת תיקונים)',
        '2. שליפה לפי משפחת מקור (תקציב פתוח, הלמ״ס, קבצים, ועוד)',
        '3. נרמול תאריך ותווית לפי כללי האתר',
        '4. אימות — טווח, קפיצות, תיקונים להיסטוריה',
        '5. מועמדים — כל ערך נשמר עם סטטוס (ממתין / פורסם / נדחה)',
        '6. פרסום אוטומטי לערכים מהימנים, או המתנה לאישור',
        '7. רישום הרצה + עדכון לפס החדשות בדף הבית כשיש פרסומים',
      ],
    },
    {
      id: 'review',
      title: 'תור אישור',
      paragraphs: [
        'במסך /government/dashboard/edit מוצגות תוצאות ההרצות האחרונות, סיכום סטטוסים, ורשימת כל הערכים שנמצאו — כולל כאלה שממתינים לאישור.',
        'לכל מועמד: מדד, תקופה, ערך חדש, ערך קודם (בתיקון), שיטת שליפה, דגלי אימות, ופעולות אישור / דחייה.',
        'לוח סטטוס בכל המדדים לפי משרד: /piplines/government-dashboard — מסגרת ירוקה/אדומה לפי עדכניות מול חלון הפרסום, ותג ירוק/אדום אם המדד כבר בצינור האוטומטי.',
      ],
    },
    {
      id: 'run',
      title: 'הרצה',
      code: `python run_office_kpi_pipeline.py                  # nightly
python run_office_kpi_pipeline.py --plan-only      # what's due
python run_office_kpi_pipeline.py --dry-run        # fetch + validate, no writes
python run_office_kpi_pipeline.py --index 56       # one registry key
python run_office_kpi_pipeline.py --force          # ignore release windows`,
      paragraphs: [
        'עד שמגדירים OFFICE_KPI_LIVE=true במשתני הריפו, הרצות מתוזמנות ב-GitHub Actions רצות במצב dry-run בלבד.',
      ],
    },
    {
      id: 'site-updates',
      title: 'עדכון לפס החדשות בדף הבית',
      paragraphs: [
        'בסוף ריצה מוצלחת עם ערכים שפורסמו, הצינור כותב כותרת קצרה לפס החדשות בדף הבית עם קישור לדשבורד הממשלה. ריצה בלי פרסומים חדשים לא כותבת עדכון.',
      ],
    },
  ],
}
