import { Link } from 'react-router-dom'

const CURRENT_TERM_LABEL = 'ממשלת ישראל ה37 | הכנסת ה25'

const CIVIL_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const HEBREW_DATE_FORMATTER = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
  timeZone: 'Asia/Jerusalem',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const HEBREW_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const HEBREW_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
const HEBREW_HUNDREDS = ['', 'ק', 'ר', 'ש']

function addHebrewNumeralPunctuation(value: string) {
  if (value.length <= 1) {
    return `${value}׳`
  }

  return `${value.slice(0, -1)}״${value.slice(-1)}`
}

function formatHebrewNumeral(value: number) {
  let remaining = value
  const letters: string[] = []

  while (remaining >= 400) {
    letters.push('ת')
    remaining -= 400
  }

  const hundreds = Math.floor(remaining / 100)
  if (hundreds > 0) {
    letters.push(HEBREW_HUNDREDS[hundreds])
    remaining %= 100
  }

  if (remaining === 15) {
    letters.push('ט', 'ו')
  } else if (remaining === 16) {
    letters.push('ט', 'ז')
  } else {
    const tens = Math.floor(remaining / 10)
    const ones = remaining % 10

    if (tens > 0) {
      letters.push(HEBREW_TENS[tens])
    }

    if (ones > 0) {
      letters.push(HEBREW_ONES[ones])
    }
  }

  return addHebrewNumeralPunctuation(letters.join(''))
}

function numericPartValue(value: string) {
  return Number(value.replace(/\D/g, ''))
}

function formatHebrewDate(date: Date) {
  const parts = HEBREW_DATE_FORMATTER.formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const day = numericPartValue(value('day'))
  const year = numericPartValue(value('year'))
  const month = value('month')

  return `${formatHebrewNumeral(day)} ב${month} ${formatHebrewNumeral(year % 1000)}`
}

function getHeaderDateLabels(date = new Date()) {
  const parts = CIVIL_DATE_FORMATTER.formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''

  return {
    civilDate: `${value('day')}.${value('month')}.${value('year')}`,
    hebrewDate: formatHebrewDate(date),
    isoDate: `${value('year')}-${value('month')}-${value('day')}`,
  }
}

export function SiteHeader() {
  const { civilDate, hebrewDate, isoDate } = getHeaderDateLabels()

  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <Link to="/" className="site-header__logo-link">
          <img
            src="/header-logo%203.svg"
            alt="מצב האומה"
            className="site-logo"
            width={122}
            height={40}
          />
        </Link>
        <div className="site-header__meta">
          <time dateTime={isoDate} className="site-header__date" aria-label="התאריך היום">
            <span>{hebrewDate}</span>
            <span aria-hidden="true">|</span>
            <span dir="ltr">{civilDate}</span>
          </time>
          <p className="site-header__term">{CURRENT_TERM_LABEL}</p>
        </div>
      </div>
    </header>
  )
}
