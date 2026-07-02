import { SiteHeader } from '../components/SiteHeader'
import { KnessetHemicycle } from '../components/knesset/KnessetHemicycle'
import { FactionList } from '../components/knesset/FactionList'
import { useKnessetMembers } from '../hooks/useKnessetMembers'
import './KnessetPage.css'

export function KnessetPage() {
  const {
    placedMembers,
    factionGroups,
    coalitionCount,
    oppositionCount,
    loading,
    error,
  } = useKnessetMembers()

  return (
    <div className="site knesset-page" dir="rtl">
      <SiteHeader />

      <main className="knesset-page__main">
        <section className="knesset-page__section" aria-labelledby="knesset-title">
          <div className="knesset-page__inner container">
            <header className="knesset-page__header">
              <h1 id="knesset-title" className="knesset-page__title">
                הכנסת
              </h1>
              <p className="knesset-page__subtitle">
              </p>
            </header>

            <KnessetHemicycle
              placedMembers={placedMembers}
              coalitionCount={coalitionCount}
              oppositionCount={oppositionCount}
              loading={loading}
            />

            <div className="knesset-page__below container">
              {error ? (
                <p className="knesset-page__error" role="alert">
                  לא ניתן לטעון את נתוני הכנסת
                </p>
              ) : null}

              {!error ? (
                <section
                  className="knesset-page__factions"
                  aria-label="רשימת הסיעות בכנסת"
                >
                  <h2 className="knesset-page__factions-title">הסיעות בכנסת</h2>
                  <FactionList factionGroups={factionGroups} loading={loading} />
                </section>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
