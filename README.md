# Rotawren Support (Demo)

**Fictional company. Not a real product.** Portfolio demo by Fabian Schenk.

Rotawren is an invented shift planning and time tracking app for hospitality teams. This repository contains its customer support portal:

- **Help center** with search and 10 articles, in English, French and German
- **Send a request**: ticket form with topic, priority and validation
- **Track a request**: look up a ticket by number and email, see the history, add replies
- **Support hours** shown as a weekly shift rota with a live "now" marker
- **System status** overview

Live: https://fabianschenk94.github.io/Rotawren-Support-DEMO/

Example request: `RW-204817` with `demo@rotawren.example`

## How it works today

Plain HTML, CSS and JavaScript, no build step. Fonts are self-hosted (Schibsted Grotesk, SIL Open Font License).
Until a backend is connected, requests are stored only in the visitor's browser (`localStorage`).

## Planned next steps

1. Ticket backend (Google Apps Script + Google Sheet): `create_ticket`, `get_ticket`, `reply_ticket`. The frontend already calls these actions once `apiUrl` is set in `app.js`.
2. AI support agent (ElevenLabs) for chat and voice: answers from the help center, creates tickets and reports ticket status. English first, French and German supported.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Design |
| `content.js` | All texts and help articles (EN/FR/DE) |
| `app.js` | Search, routing, form, ticket view, data layer |
| `fonts/` | Self-hosted web fonts |
