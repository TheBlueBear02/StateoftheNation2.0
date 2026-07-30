# Legal / Info Pages — אודות ותנאי שימוש

> See [ProjectOverview.md](./ProjectOverview.md) for stack and shared conventions.
> SEO checklist: [SeoAndWebStandards.md](./SeoAndWebStandards.md).

Public static Hebrew content pages linked **only from the site footer** (not header or homepage CTAs).

## Routes

| URL | Title | App file | View |
|-----|-------|----------|------|
| `/about` | אודות | `src/app/about/page.tsx` | `src/views/AboutPage.tsx` |
| `/terms` | תנאי שימוש | `src/app/terms/page.tsx` | `src/views/TermsPage.tsx` |

Shared styles: `src/views/StaticInfoPage.css` (`.static-info-page*`, `.about-author*`).

## Footer links

`src/components/SiteFooter.tsx` exposes `FOOTER_LINKS`:

- אודות → `/about`
- תנאי שימוש → `/terms`

Rendered in `.site-footer__end` above the copyright line. Styles live in `src/App.css`.

## Page structure

### תנאי שימוש (`/terms`)

```
SiteLayout
└─ main.static-info-page__main
   └─ section (container, max readable width ~720px)
      ├─ PageBreadcrumb (`תנאי שימוש`)
      ├─ h1
      └─ legal body (sections 1–7 + contact mailto)
```

### אודות (`/about`)

```
SiteLayout.about-page
└─ main
   └─ section (container, max width ~860px)
      ├─ PageBreadcrumb (`אודות`)
      ├─ h1
      ├─ intro paragraphs (why the site exists)
      └─ aside.about-author — founder card
         ├─ circular photo (`/images/my_image.png`) + social icons
         └─ bio paragraph
```

Author card socials (open in new tab):

| Network | URL |
|---------|-----|
| X | https://x.com/GabbaiAmir |
| LinkedIn | https://www.linkedin.com/in/amir-gabbai-2ab485219 |

Icons: `x-icon` and `linkedin-icon` in `public/icons.svg`. Card uses rounded corners + soft shadow to match the designed author block (exception to the usual square-card rule for this one-off).

## SEO

- Hebrew `title` + `description` + `alternates.canonical` on each `page.tsx`.
- Both paths are listed in `src/app/sitemap.ts` (yearly change frequency, low priority).

## Content notes

- **תנאי שימוש:** full legal copy in `TermsPage.tsx` (last updated January 2025); contact `stateofthenation2025@gmail.com`.
- **אודות:** mission intro + Amir Gabbai founder card in `AboutPage.tsx`.
