# aexomir.github.io

Source for [aexomir.me](https://aexomir.me).

## Editing content

All the copy (profile, projects, experience, certificates and links) lives in [`content.json`](content.json). Edit it in [Pages CMS](https://app.pagescms.org) (forms defined in [`.pages.yml`](.pages.yml)), or change the file and push to `main`. GitHub Actions validates it, builds the page and deploys it in about a minute. If the content is invalid, the build fails and the live site keeps its last good version.

The same file is published at `https://aexomir.me/content.json` for the iPhone app ([aexomir/portfolio-app](https://github.com/aexomir/portfolio-app)).

## App status

The `app` section of `content.json` is read only by the iPhone app. In Pages CMS it's under **App status**:

- **Maintenance banner:** shows your message at the top of every screen.
- **Latest app version:** people on an older version see the update notice, with an optional link (App Store or TestFlight).
- **Feature switches:** name wave animation, Status opening the Get in touch sheet, and the live clock.

## Pipeline buttons

Pages CMS shows three buttons in its sidebar, defined under `actions` in `.pages.yml`:

| Button | Workflow | What it does |
|---|---|---|
| Deploy site | `pages.yml` | Rebuilds and redeploys aexomir.me (saves already do this). |
| Publish app update | `app-update.yml` | Ships the latest app code from aexomir/portfolio-app to installed apps with EAS Update. |
| Build for TestFlight | `app-testflight.yml` | Builds the app on EAS and submits it to App Store Connect. |

The two app buttons need a one-time setup (Expo project, `EXPO_TOKEN` secret and Apple credentials), described in the [app README](https://github.com/aexomir/portfolio-app#pipeline-setup-one-time).

## How it builds

- `layout.html` is the page shell (head, header, footer). `scripts/build.mjs` validates `content.json`, HTML-escapes it and renders every page into it: home, `/projects/`, one `/projects/<slug>/` per project with a case study, `/experience/`, `/contact/` and `404.html`. No dependencies.
- The pages read as a journey: each one ends with a single "Next" link (home → projects → case studies in list order → experience → contact).
- `site.css` and `site.js` are shared by every page. Geist is self-hosted in `fonts/` (SIL Open Font License, `fonts/OFL.txt`).
- Page changes use cross-document view transitions: a quick crossfade, the header stays still, and a project's title glides between the list and its case study. Browsers without support navigate normally, and reduced-motion settings turn all of it off.
- Images get `width`/`height` from the files at build time, so nothing shifts while they load.
- `.github/workflows/pages.yml` runs the tests and the build on every push, and deploys `main`.

```bash
node --test scripts/build.test.mjs
node scripts/build.mjs
python3 -m http.server 4173 -d _site   # then open http://localhost:4173
```

The pages use root paths (`/site.css`), so open them through a server, not as files.
