# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub instead:
**Security** tab → **Report a vulnerability**
(https://github.com/kikyung/obsidian-kanji-zoom/security/advisories/new)

You'll get a reply as soon as possible. Fixes ship in a new release.

## Scope

Kanji Zoom runs entirely inside Obsidian:

- no network requests (the kanji dictionary is bundled in `main.js`)
- no access outside the note being viewed
- note content is rendered with Obsidian's own Markdown renderer, never `innerHTML`

## Supported versions

Only the latest release receives fixes.
