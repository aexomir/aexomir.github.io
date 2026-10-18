# aexomir.github.io

Source for [aexomir.me](https://aexomir.me).

## Editing content

All the copy (profile, projects, experience, certificates and links) lives in [`content.json`](content.json). Change it and push to `main`. GitHub Actions validates it, builds the page and deploys it in about a minute. If the content is invalid, the build fails and the live site keeps its last good version.

The same file is published at `https://aexomir.me/content.json` for the iPhone app ([aexomir/portfolio-app](https://github.com/aexomir/portfolio-app)).

## How it builds

- `template.html` is the page. `{{profile.name}}`-style placeholders and `<!-- @projects -->`-style block markers are filled from `content.json`.
- `scripts/build.mjs` validates the content, HTML-escapes it and writes `_site/` (no dependencies).
- `.github/workflows/pages.yml` runs the tests and the build on every push, and deploys `main`.

```bash
node --test scripts/build.test.mjs
node scripts/build.mjs   # then open _site/index.html
```
