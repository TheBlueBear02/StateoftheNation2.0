import type { PipelineDoc } from './types'

export const elections2026PollsPipeline: PipelineDoc = {
  id: 'elections-2026-polls',
  title: 'סקרי מנדטים — בחירות 2026',
  subtitle:
    'צינור אוטומטי שמושך סקרי מנדטים מויקיפדיה, מנרמל אותם למסד הנתונים, מחשב ממוצע משוקלל, ומזין את עמוד /elections/polls.',
  status: 'live',
  docsPath: '/piplines/docs/elections-2026-polls',
  editPath: '/elections/polls/edit',
  schedule: {
    label: 'כל יום בחצות · 00:00 שעון ישראל',
    cron: '0 21 * * *',
    timezone: 'Asia/Jerusalem',
  },
  sections: [
    {
      id: 'overview',
      title: 'סקירה',
      paragraphs: [
        'מקור הנתונים היחיד בגרסה 1 הוא ויקיפדיה באנגלית — דף Opinion polling for the 2026 Israeli legislative election (וב־backfill גם ארכיוני 2022–2025). בריצה רגילה מפורסרת רק טבלת המנדטים העדכנית ביותר. הטבלאות נמשכות דרך MediaWiki API ומפורשות מה-HTML המרונדר.',
        'הצינור רץ כל יום בחצות שעון ישראל ב-GitHub Actions (21:00 UTC בקיץ), בודק revid לשינוי, ומעדכן את מסד הנתונים באופן idempotent (שורות קיימות לא נכנסות מחדש לתור).',
      ],
    },
    {
      id: 'stages',
      title: 'שלבי הצינור',
      list: [
        '1. fetch_wikipedia — MediaWiki parse + revid cache',
        '2. parse_poll_tables — ברירת מחדל: טבלת Seat projections העדכנית בלבד; --backfill לכל הטבלאות/דפים',
        '3. resolve_poll_parties — מיפוי תוויות אנגלית דרך poll_party_aliases',
        '4. normalize_polls — polls + poll_results, supersede logic',
        '5. compute_aggregates — last3 + weighted (30 יום אחרונים)',
        '6. validate_polls — שערים על סקרים אחרונים (או היסטוריה מלאה ב-backfill)',
      ],
      code: `python run_polls_pipeline.py                # incremental: latest seat table only
python run_polls_pipeline.py --dry-run      # no DB writes
python run_polls_pipeline.py --stage 4      # single stage
python run_polls_pipeline.py --backfill     # all tables + all four wiki pages
python run_polls_pipeline.py --force        # re-fetch unchanged revid`,
    },
    {
      id: 'aggregation',
      title: 'מגבלת ממוצע מנדטים',
      paragraphs: [
        'ויקיפדיה מפרסמת בעיקר תחזיות מנדטים — לא אחוזי הצבעה גולמיים. כל סקרן כבר החיל סף 3.25% והקצאת מנדטים. ממוצע של פלטי מודלים שונים רועש יותר מממוצע של אחוזים, ולכן הסכום אינו מכוון ל-120.',
        'הממוצע המשוקלל (ברירת מחדל): חלון 14 יום, decay עם half-life של 6 ימים בקמפיין / 14 מחוץ לו, cap של 25% לכל סקרן. last3 — ממוצע 3 הסקרים האחרונים, לבדיקת sanity.',
        'אפקט בית (house effects) — Filber / ערוץ 14 — מתועד בטבלה נפרדת לתצוגה בלבד, לא מחוסר מהממוצע.',
      ],
    },
    {
      id: 'licensing',
      title: 'רישוי ו-attribution',
      paragraphs: [
        'תוכן ויקיפדיה מוגן CC BY-SA 4.0. האתר מציין את המקור בעמוד /elections/polls ובמסמך זה. ממוצעים מחושבים הם עבודה נגזרת; נקודות הנתונים עצמן אינן זכות יוצרים.',
        'User-Agent תיאורי עם כתובת קשר, לפי מדיניות Wikimedia API. ריצה אחת לדף לכל run.',
      ],
    },
    {
      id: 'seeds',
      title: 'Seeds חד-פעמיים',
      code: `# הרחבת election_parties + bloc/status
python seed_parties.py

# aliases אנגליים + lineage
python seed_party_aliases.py`,
      paragraphs: [
        'לפני seed: ודאו ש-party_status=confirmed מסונן בכל שאילתות election_parties הקיימות. review_queue.json מתריע על תוויות לא ממופות — יש לטפל לפני שהסדרה מתפצלת.',
      ],
    },
  ],
}
