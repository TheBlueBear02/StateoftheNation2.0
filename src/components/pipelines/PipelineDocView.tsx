import type { PipelineDoc } from '../../content/pipelines'

type PipelineDocViewProps = {
  pipeline: PipelineDoc
}

export function PipelineDocView({ pipeline }: PipelineDocViewProps) {
  return (
    <article className="pipeline-doc">
      <header className="pipeline-doc__header">
        <div className="pipeline-doc__meta">
          <span
            className={`pipeline-doc__status pipeline-doc__status--${pipeline.status}`}
          >
            {pipeline.status === 'live' ? 'פעיל' : 'מתוכנן'}
          </span>
        </div>
        <h1 className="pipeline-doc__title">{pipeline.title}</h1>
        <p className="pipeline-doc__subtitle">{pipeline.subtitle}</p>
      </header>

      <div className="pipeline-doc__body">
        {pipeline.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="pipeline-doc__section"
            aria-labelledby={`section-${section.id}`}
          >
            <h2 id={`section-${section.id}`} className="pipeline-doc__section-title">
              {section.title}
            </h2>

            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="pipeline-doc__paragraph">
                {paragraph}
              </p>
            ))}

            {section.list && (
              <ul className="pipeline-doc__list">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}

            {section.code && (
              <pre className="pipeline-doc__code">
                <code>{section.code}</code>
              </pre>
            )}

            {section.table && (
              <div className="pipeline-doc__table-wrap">
                <table className="pipeline-doc__table">
                  <thead>
                    <tr>
                      {section.table.headers.map((header) => (
                        <th key={header} scope="col">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row) => (
                      <tr key={row.join('|')}>
                        {row.map((cell) => (
                          <td key={cell}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}
