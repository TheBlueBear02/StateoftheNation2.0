import type { PipelineDoc } from './types'

export const electionsCandidatesPipeline: PipelineDoc = {
  id: 'elections-candidates',
  title: 'מועמדי בחירות 2026',
  subtitle:
    'מדריך עבודה להוספת רשימת מועמדים שפורסמה, הכנסת הקלט הגולמי, והרצת הצינור שמעשיר את הנתונים לאתר הבחירות.',
  status: 'live',
  sections: [
    {
      id: 'overview',
      title: 'סקירה',
      paragraphs: [
        'הצינור מתחיל בכל פעם שמפלגה מפרסמת או מעדכנת רשימת מועמדים. מכינים קובץ פשוט לפי סדר הרשימה, מכניסים אותו לטבלת הקלט, ואז מריצים את ששת שלבי העיבוד.',
        'בסוף התהליך האתר מקבל רשימת מועמדים נקייה עם שיוך לאנשים, פרטים חסרים ממקורות מובנים, תקצירי פרופיל, עיר וקואורדינטות כאשר המקורות מאפשרים זאת.',
      ],
    },
    {
      id: 'workflow',
      title: 'Workflow — כשמפלגה מפרסמת רשימה',
      paragraphs: [
        'זה המחזור שחוזרים עליו לכל מפלגה חדשה או לכל עדכון רשימה. מומלץ להתחיל תמיד בתצוגה מקדימה, במיוחד כשמעתיקים שמות ממאמר או הודעה לעיתונות.',
      ],
      list: [
        '1. מכינים קובץ txt עם שם אחד בכל שורה, לפי סדר הרשימה. אפשר גם רשימה ממוספרת (1. שם / 3.שם) כמו שמפרסמים באתרי מפלגות. שורות שמתחילות ב-# מתעלמות.',
        '2. אם פורסמו גם ערים, אפשר להשתמש בקובץ csv עם כותרות שם,עיר.',
        '3. מריצים insert_raw_list.py --dry-run כדי לראות את הרשימה והעמדות בלי כתיבה.',
        '4. מריצים insert_raw_list.py כדי להכניס את השורות ל-raw_candidate_lists עם processed=false.',
        '5. מריצים run_pipeline.py כדי לעבד את כל השורות הלא מעובדות.',
        '6. אם נוצר review_queue.json, מאשרים או מסמנים אנשים חדשים ואז מריצים resolve_candidates.py --approve.',
        '7. בודקים את election_candidates ומוודאים שתיאור, עיר וקואורדינטות מולאו כאשר יש מקור זמין.',
      ],
      code: `# 1. קובץ txt — שמות פשוטים
# likud.txt
בנימין נתניהו
יריב לוין
דוד אמסלם
מירי רגב

# או רשימה ממוספרת (כמו שמעתיקים מאתר מפלגה)
# likud-numbered.txt
1. בנימין נתניהו
2. יריב לוין
3.אלי כהן

# או CSV אם יש עיר
# beyachad.csv
שם,עיר
נפתלי בנט,רעננה
יאיר לפיד,תל אביב`,
    },
    {
      id: 'insert',
      title: 'הכנסת רשימה גולמית',
      paragraphs: [
        'insert_raw_list.py הוא שער הכניסה היחיד לרשימות מועמדים. הוא מחפש מפלגה לפי election_parties.short_name, מפרק שמות מרשימות ממוספרות (1. / 1)), וכותב אותן ל-raw_candidate_lists עם list_position מהמספר בקובץ או לפי סדר השורות.',
        'בהכנסה חוזרת של רשימה מעודכנת לאותה מפלגה, שורות ישנות שעדיין לא עובדו נמחקות ומוחלפות אוטומטית. אם לא בטוחים בשם הקצר המדויק של המפלגה, מריצים את רשימת המפלגות לפני ההכנסה.',
      ],
      code: `# לראות אילו מפלגות זמינות
python insert_raw_list.py --list-parties

# תצוגה מקדימה, בלי כתיבה
python insert_raw_list.py --party "הליכוד" --file likud.txt --dry-run

# הכנסת הרשימה ל-raw_candidate_lists
python insert_raw_list.py --party "הליכוד" --file likud.txt`,
      table: {
        headers: ['דגל', 'שימוש'],
        rows: [
          ['--party "שם"', 'שם קצר של מפלגה — חייב להתאים בדיוק ל-election_parties.short_name'],
          ['--file path', 'קובץ txt או csv שמכיל את הרשימה'],
          ['--dry-run', 'פענוח והצגת הרשימה בלי כתיבה למסד הנתונים'],
          ['--list-parties', 'הדפסת שמות המפלגות הזמינים ויציאה'],
        ],
      },
    },
    {
      id: 'run',
      title: 'הרצת הצינור',
      paragraphs: [
        'run_pipeline.py אוסף את כל השורות שבהן processed=false מכל המפלגות ומריץ את ששת השלבים. אם הכנסתם שלוש רשימות לפני ההרצה, כולן יעובדו באותה ריצה.',
        'ברירת המחדל היא ריצה מלאה. במצב תחזוקה אפשר להריץ בדיקה, dry-run, שלב בודד, או לדלג על העשרת Wikidata כאשר המידע כבר קיים.',
      ],
      code: `# ריצה מלאה על כל השורות הלא מעובדות
python run_pipeline.py

# בדיקה עם חמישה ח"כים ידועים
python run_pipeline.py --test

# הצגת פעולות בלי כתיבה למסד הנתונים
python run_pipeline.py --dry-run

# שלב בודד בלבד
python run_pipeline.py --stage 1

# דילוג על העשרת Wikidata
python run_pipeline.py --skip-enrich`,
      table: {
        headers: ['דגל', 'שימוש'],
        rows: [
          ['ללא דגלים', 'ריצה מלאה על כל raw_candidate_lists שבהן processed=false'],
          ['--test', 'יצירת fixtures של חמישה ח"כים ידועים ואז ריצת כל השלבים'],
          ['--dry-run', 'הצגת הפעולות המתוכננות בלי כתיבה'],
          ['--stage 1-6', 'הרצת שלב אחד בלבד'],
          ['--skip-enrich', 'דילוג על שלב Wikidata'],
        ],
      },
    },
    {
      id: 'stages',
      title: 'מה קורה בכל שלב',
      paragraphs: [
        'כל שלב אחראי לשכבת מידע אחרת. שדות עובדתיים נמשכים ממקורות מובנים או נשארים null; הם לא מנוחשים.',
      ],
      list: [
        'Stage 1 — resolve_candidates.py: קורא raw_candidate_lists, מנרמל שמות, מתאים ל-people, יוצר אנשים חדשים כשאין התאמה, כותב ל-election_candidates ומסמן processed=true.',
        'Stage 2 — enrich_wikidata.py: משלים רק שדות NULL של תאריך לידה, מגדר, תמונה ועיר מגורים. לא דורס מידע קיים.',
        'Stage 3 — generate_descriptions.py: מביא תקציר ויקיפדיה עברי ושולח אותו ליצירת משפט עברי ניטרלי בפורמט «[שם] כיהן כ[תפקידים בולטים]».',
        'Stage 4 — geocode_cities.py: ממיר עיר לקואורדינטות בישראל דרך Nominatim, עם cache בזיכרון כדי שכל עיר תישלח פעם אחת.',
        'Stage 5 — fetch_candidate_birthdates.py: משלים people.birth_date חסר למועמדים בבחירות 2026 דרך Wikidata, בלי לשנות שדות אחרים.',
        'Stage 6 — fetch_candidate_wiki_urls.py: משלים people.wikipedia_url חסר למועמדים בבחירות 2026 דרך Wikidata, בלי לשנות שדות אחרים.',
      ],
      code: `raw_candidate_lists (processed=false)
        │
        ▼
Stage 1 — resolve_candidates.py
        │
        ▼
Stage 2 — enrich_wikidata.py
        │
        ▼
Stage 3 — generate_descriptions.py
        │
        ▼
Stage 4 — geocode_cities.py
        │
        ▼
Stage 5 — fetch_candidate_birthdates.py
        │
        ▼
Stage 6 — fetch_candidate_wiki_urls.py`,
    },
    {
      id: 'review',
      title: 'טיפול בתור בדיקה',
      paragraphs: [
        'כאשר התאמת שם אינה מספיק ודאית, נוצר review_queue.json. כל פריט מציג את השם המקורי, ההתאמה הטובה ביותר וציון הביטחון. משנים את action ל-approve כדי להשתמש בהתאמה, או ל-new כדי ליצור אדם חדש.',
        'בפועל התור אמור להיות קטן, כי רוב המועמדים הריאליים הם ח"כים קיימים או לשעבר שמזוהים בהתאמה מדויקת.',
      ],
      code: `{
  "raw_name": "דוד ביטן",
  "best_match": "דוד ביטן",
  "score": 0.78,
  "action": "pending"
}

# אחרי שינוי action ל-approve או new
python resolve_candidates.py --approve`,
      table: {
        headers: ['רמת התאמה', 'תנאי', 'פעולה'],
        rows: [
          ['Exact', 'שם מנורמל זהה', 'כתיבה אוטומטית'],
          ['Fuzzy high', 'ציון 0.85 ומעלה', 'כתיבה אוטומטית'],
          ['Fuzzy mid', 'ציון 0.65 עד 0.84', 'review_queue.json'],
          ['No match', 'מתחת ל-0.65', 'יצירת אדם חדש'],
        ],
      },
    },
    {
      id: 'updates',
      title: 'כשרשימה משתנה',
      paragraphs: [
        'רשימות מפלגתיות יכולות להשתנות עד אישור ועדת הבחירות. במקרה כזה חוזרים על אותו workflow עם הקובץ המעודכן: מכינים רשימה, מריצים dry-run, מכניסים ל-raw_candidate_lists ומריצים את הצינור.',
        'insert_raw_list.py מחליף שורות לא מעובדות לאותה מפלגה. אחרי הריצה צריך לנקות ידנית מועמדים שכבר עובדו בעבר אבל ירדו מהרשימה הסופית.',
      ],
      code: `DELETE FROM election_candidates
WHERE party_id = <party_id>
  AND person_id NOT IN (
    SELECT p.id FROM people p
    INNER JOIN raw_candidate_lists r ON r.raw_name = p.full_name
    WHERE r.party_id = <party_id>
  );`,
    },
    {
      id: 'scripts',
      title: 'סקריפטים ותלויות',
      paragraphs: [
        'כל הסקריפטים נמצאים תחת Layer 1 - Gathering Data/Elections/. סנכרון נתוני הכנסת הוא תהליך נפרד שמעדכן את בסיס ה-people, הסיעות והחברויות בכנסת.',
      ],
      list: [
        'insert_raw_list.py — הכנסת קובץ רשימת מועמדים ל-raw_candidate_lists',
        'run_pipeline.py — אורקסטרטור שמריץ את כל ששת השלבים',
        'resolve_candidates.py — זיהוי מועמדים מול people ועדכון election_candidates',
        'enrich_wikidata.py — השלמת תאריך לידה, מגדר, תמונה ועיר',
        'generate_descriptions.py — יצירת תיאור עברי קצר',
        'geocode_cities.py — המרת עיר לקואורדינטות',
        'fetch_candidate_birthdates.py — השלמת people.birth_date חסר',
        'fetch_candidate_wiki_urls.py — השלמת people.wikipedia_url חסר',
      ],
      code: `pip install supabase python-dotenv requests geopy openai

SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
OPENAI_API_KEY=...`,
    },
    {
      id: 'sources',
      title: 'מקורות נתונים',
      paragraphs: [
        'הצינור נשען על מקורות מובנים ככל האפשר. OpenAI משמש רק לניסוח תיאור קצר מתוך תקציר ויקיפדיה, לא ליצירת עובדות.',
      ],
      table: {
        headers: ['מקור', 'מספק', 'עלות / מפתח'],
        rows: [
          ['Knesset OData API', 'היסטוריית חברי כנסת, סיעות וחברויות', 'חינמי'],
          ['Wikidata SPARQL', 'תאריך לידה, מגדר, תמונה, עיר מגורים וכתובת ויקיפדיה', 'חינמי, ללא מפתח'],
          ['Nominatim / OpenStreetMap', 'עיר עברית לקו רוחב וקו אורך', 'חינמי, ללא מפתח'],
          ['Wikipedia Hebrew API', 'תקצירי ערכים לביוגרפיות', 'חינמי, ללא מפתח'],
          ['OpenAI GPT-4o-mini', 'ניסוח ביו עברי בן שני משפטים', 'בתשלום'],
        ],
      },
    },
    {
      id: 'site',
      title: 'מה האתר עושה עם הנתונים',
      paragraphs: [
        'עמוד הבחירות מחשב את הסטטיסטיקות בזמן קריאה מתוך election_candidates: גיל ממוצע, אחוז נשים ואחוז מועמדים חדשים לכנסת. אין job נפרד לאגרגציה.',
        'ח"כ חדש מוגדר כמועמד שאין עבורו אף שורת knesset_memberships. נתונים חסרים נשארים גלויים כחסרים, והכיסוי מוצג ביושר במקום להשלים או לנחש.',
      ],
    },
  ],
}
