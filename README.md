# StaffGrid Support (Demo)

**Fictional company. Not a real product.** Portfolio demo by Fabian Schenk.

StaffGrid is an invented enterprise software company. Its product, the StaffGrid Workforce Cloud, covers time tracking, shift scheduling, absences and payroll integration for companies with up to 50,000 employees. This repository contains its customer support portal for admins:

- **Knowledge base** with search and 12 articles in 7 topics (SSO, terminals, scheduling, absences, payroll interfaces, API, licences), in English, French and German
- **Open a case**: service desk form with priorities P1 to P4 and response times
- **Case status**: look up a case with its case number only (random, hard to guess, for example `SG-7K4M-92QX`). No names or email addresses are shown.
- **Service desk hours** as a weekly schedule with a live "now" marker and 24/7 P1 on-call
- **Product overview** with a schedule view built in HTML, and **system status**

Live: https://fabianschenk94.github.io/StaffGrid-Support-DEMO/

Example case: `SG-4X7Q-9MKD`

## How it works today

Plain HTML, CSS and JavaScript, no build step. Fonts are self-hosted (Schibsted Grotesk, SIL Open Font License). Photos are AI-generated and show fictional customer companies; they are stored as WebP in two sizes (`img/`).
Cases are stored in Jira Service Management (Free plan). The website talks to a Cloudflare Worker (`worker/worker.js`), which keeps the Jira API token secret. Contact details are saved as internal notes and never appear in the case status view. If `apiUrl` in `app.js` is empty, cases fall back to the visitor's browser (`localStorage`).

## Planned next steps

1. **AI support agent** (ElevenLabs) for chat and voice: answers from the knowledge base, opens cases and reports case status. English first, French and German supported.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Design |
| `content.js` | All texts and knowledge base articles (EN/FR/DE) |
| `app.js` | Search, routing, case form, case view, case numbers, data layer |
| `fonts/` | Self-hosted web fonts |
