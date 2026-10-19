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

- `template.html` is the page. `{{profile.name}}`-style placeholders and `<!-- @projects -->`-style block markers are filled from `content.json`.
- `scripts/build.mjs` validates the content, HTML-escapes it and writes `_site/` (no dependencies).
- `.github/workflows/pages.yml` runs the tests and the build on every push, and deploys `main`.

```bash
node --test scripts/build.test.mjs
node scripts/build.mjs   # then open _site/index.html
```
