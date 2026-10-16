# StaffGrid knowledge base for the AI assistant Adrian

StaffGrid is a FICTIONAL company. This is a portfolio demo by Fabian Schenk. Never present StaffGrid as a real company.

## Company and product
StaffGrid is a cloud platform for workforce management in mid-sized and large companies. It brings time tracking, scheduling, absences and payroll data together for up to 50,000 employees across many sites. Hosted in EU data centres in Frankfurt and Amsterdam.
Customers are mid-sized and large companies (500 to 50,000 employees) in manufacturing, food production, logistics, retail and care. Typical callers are IT and HR administrators of these customers, not their employees.

Modules:
- Time tracking: Clock in at terminals, in the app or in the browser. Breaks, overtime and rule checks are calculated automatically.
- Scheduling: Plan shifts across sites and teams, with rest periods, qualifications and staffing targets checked as you plan.
- Absences: Leave, sickness and training with approval workflows that follow your organisation chart.
- Payroll integration: Approved hours and wage types go to your payroll system as a monthly or daily export.
- Integrations and API: Single sign-on via SAML or OpenID Connect, user provisioning via SCIM and a REST API for HR data.

## Service desk hours (time zone Europe/Berlin)
- Monday to Friday 07:00 to 20:00
- Saturday 08:00 to 14:00
- Sunday closed
- P1 incidents: on-call engineer 24/7, every day

## Priorities and first response times
- P1 Critical: Nobody can log in or clock in. First response within 30 minutes, 24/7.
- P2 High: A key function fails for many users. First response within 2 business hours.
- P3 Normal: One function is impaired, a workaround exists. First response within 1 business day.
- P4 Low: Question or change request. First response within 2 business days.

Business hours = the service desk hours above. The service desk confirms or adjusts the priority after review.

## Case numbers and case status
- Every case gets a random case number in the format SG-XXXX-XXXX (letters and digits, no 0, O, 1, I or L). Example of a demo case: SG-4X7Q-9MKD.
- Case status can be checked on the website under "Case status" with the case number only, or with Adrian. For privacy, the status view shows no names or email addresses.
- Status values: Received (open, waiting for the service desk), In progress, Waiting for your reply, Resolved.

## System status
All services operational: web app, mobile app, clock-in terminals, scheduling, payroll exports, API. Data centres EU-Central (Frankfurt) and EU-West (Amsterdam). No current incidents.

## Contact
Service desk email support@staffgrid.example is a placeholder and not reachable in this demo. The ways to reach support are: Adrian (chat or voice on the website) and the form "Open a case" on the website.

## Topics
- Login and SSO (sso): SAML, OpenID Connect and user provisioning
- Time tracking and terminals (time): Terminals, corrections and time rules
- Scheduling (plan): Shift plans, sites and planning rules
- Absences (absence): Leave, sickness and approvals
- Payroll interfaces (payroll): Exports, wage types and pay periods
- API and integrations (api): Credentials, limits and HR data sync
- Licences and contract (account): Licences, invoices and contacts

## Knowledge base articles

### SSO login fails with “invalid audience”  [topic: Login and SSO]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/sso-audience
Also known as: Connexion SSO refusée avec « invalid audience » / SSO-Anmeldung schlägt mit „invalid audience“ fehl
The identity provider sends a different audience (Entity ID) than StaffGrid expects.
1. In StaffGrid, open Settings › Login › SAML and copy the Service Provider Entity ID.
2. In your identity provider, open the StaffGrid app and paste it as Audience URI (or Identifier).
3. Check that the Reply URL ends with /saml/acs and that the signing certificate has not expired.
4. Test with a private browser window. Existing sessions keep the old settings for up to 10 minutes.

### Provision users automatically with SCIM  [topic: Login and SSO]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/scim
Also known as: Provisionner les utilisateurs avec SCIM / Benutzer automatisch per SCIM anlegen
SCIM creates, updates and deactivates StaffGrid users from your directory.
1. Open Settings › Login › User provisioning and select Create SCIM token. The token is shown only once.
2. In your identity provider, enable provisioning for the StaffGrid app with the SCIM base URL and the token.
3. Map the attributes for employee number, site and cost centre. Without an employee number, users are not created.
4. Start with one test group. Check the provisioning log in StaffGrid before you enable all groups.

### Time terminals show “offline”  [topic: Time tracking and terminals]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/terminal-offline
Also known as: Les bornes de pointage sont « hors ligne » / Zeiterfassungsterminals zeigen „offline“
Terminals keep up to 10,000 bookings offline and send them once the connection is back.
1. Check that the terminal network allows outbound HTTPS to *.staffgrid.example on port 443.
2. If your company uses a proxy, enter it on the terminal under Admin › Network › Proxy.
3. Under Time tracking › Terminals, check the last contact time. Terminals offline for over 7 days must be paired again.
4. Still offline? Open a case with the terminal serial number and site.

### Correct a missing clock-out  [topic: Time tracking and terminals]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/missing-booking
Also known as: Corriger un pointage de sortie manquant / Fehlende Ausbuchung korrigieren
Open bookings block the timesheet approval until a manager corrects them.
1. Open Time tracking › Exceptions and filter by Missing clock-out.
2. Select the entry, enter the actual end time and breaks, and add a reason.
3. The correction is logged in the audit trail with your name and the old value.
4. Approve the timesheet. Only approved timesheets go to payroll.

### Publish a schedule for several sites  [topic: Scheduling]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/publish-multi-site
Also known as: Publier un planning pour plusieurs sites / Dienstplan für mehrere Standorte veröffentlichen
Planners can publish one site at a time or several sites together.
1. Open Scheduling and select the sites in the site filter.
2. Resolve all red rule violations. Yellow warnings can be published with a reason.
3. Select Publish and choose who is notified: everyone, or only people with changes.
4. Employees see the schedule in the app. Later changes are highlighted and need their acknowledgement.

### Rest-period warnings in the schedule  [topic: Scheduling]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/rest-period
Also known as: Alertes de repos dans le planning / Ruhezeit-Hinweise im Dienstplan
StaffGrid checks rest periods, maximum hours and qualifications while you plan.
1. Hover over the red marker on a shift to see which rule is broken.
2. Rules are set per site under Settings › Planning rules, for example 11 hours rest between shifts.
3. Exceptions need a reason and are listed in the compliance report.
4. If a rule fires wrongly, check the site’s rule set and the employee’s contract type.

### Set up approval workflows for leave  [topic: Absences]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/absence-workflow
Also known as: Configurer les circuits de validation des congés / Freigabe-Workflows für Urlaub einrichten
Leave requests follow the approval chain you define per organisational unit.
1. Open Settings › Absences › Workflows and select New workflow.
2. Choose the steps, for example team lead first, then site manager for requests over 10 days.
3. Assign the workflow to organisational units. Units without a workflow use the company default.
4. Set a deputy for each approver so requests are not stuck during holidays.

### Hours are missing in the payroll export  [topic: Payroll interfaces]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/export-missing-hours
Also known as: Des heures manquent dans l’export de paie / Stunden fehlen im Lohnexport
Only approved hours in the selected pay period are exported.
1. Open Payroll › Export and check which pay periods are included.
2. Open the list of unapproved timesheets for the period. They are exported only after approval.
3. Check whether the site uses its own pay period setting, for example after a reorganisation.
4. Run the export again. Earlier exports stay in the export history for audit purposes.

### Map wage types for the payroll export  [topic: Payroll interfaces]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/wage-types
Also known as: Associer les rubriques de paie pour l’export / Lohnarten für den Lohnexport zuordnen
Wage types translate StaffGrid time types into the codes your payroll system expects.
1. Open Payroll › Wage types and select the export profile of your payroll system.
2. Assign a wage type code to each time type, for example night work or Sunday surcharge.
3. Use the test export with one employee to compare the result with your payroll team.
4. Changes apply from the next export. Past exports are not changed.

### Create API credentials  [topic: API and integrations]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/api-credentials
Also known as: Créer des identifiants API / API-Zugangsdaten erstellen
Integrations use OAuth client credentials with scopes you choose.
1. Open Settings › API and select New client. Only company admins see this page.
2. Choose the scopes the integration needs, for example read employees and write absences.
3. Copy the client secret right away. It is shown only once and can be rotated at any time.
4. Requests are limited to 600 per minute per client. Use the bulk endpoints for large data loads.

### HR master data sync fails  [topic: API and integrations]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/hr-sync
Also known as: La synchronisation des données RH échoue / HR-Stammdatenabgleich schlägt fehl
The nightly sync stops for one record but continues with all others.
1. Open Settings › Integrations › HR sync and select the last run.
2. Filter by Errors. Each line names the employee number and the missing or invalid field.
3. Fix the record in your HR system. The next run picks up the change automatically.
4. For urgent changes, select Run now. Manual runs are limited to one per hour.

### Add licences or download invoices  [topic: Licences and contract]
Link (chat only): https://fabianschenk94.github.io/StaffGrid-Support-DEMO/#/article/licences
Also known as: Ajouter des licences ou télécharger les factures / Lizenzen erweitern oder Rechnungen herunterladen
Company admins manage licences and invoices in the admin centre.
1. Open Admin centre › Contract. You see licences in use and the contract term.
2. Select Add licences. New licences are active right away and billed pro rata.
3. Under Invoices, download any invoice as PDF or send it to your accounts payable address.
4. For changes to the contract term, contact your account manager through a P4 case.
