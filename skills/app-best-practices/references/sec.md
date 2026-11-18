# Security and access

Who can open what, and what can leak.

118 rules: P0 41, P1 56, P2 20, P3 1.

## Contents

- P0
- P1
- P2
- P3

## P0

- Client id and secret encrypted in the IdP config, never inline.
- Never hold a password, card number or CVV in a page variable, event payload or navigation parameter.
- Remove hidden developer shortcuts such as a long-press or tap sequence that signs in or opens a test screen before release.
- Lockout, rate limit and code checks run on the server; a client counter or page variable is not a security control.
- Do not store passwords, hashes or card tokens in an app object or write them to logs; sign in through the IdP.
- Grant the app's roles VIEW on every standard entity type its sources read; entityTypeEnablement ALL does not cover standard types. (web only)
- Never ship a fixed or demo verification code or a mock 200 standing in for the real check.
- Never pass a user id from the page to an automation or source that reads or writes user-owned records; take the user from the session.
- No API keys, tokens or secrets in head code, footer code or custom HTML attributes.
- Renew certificate-pinning public-key hashes before their expiry date; an expired pin breaks every request. (mobile only)
- Never take who the user is from a page input (userId, employeeId) and pass it on; any page or agent can open it as anyone.
- No key, token or password-shaped value in a page variable, constant, function or custom code.
- No object the app reads has skipPermissionsFilter: true or external: true unless the request asked for it.
- Never bind data into an on* attribute, href, src or style in htmlAttributes; only data-* attributes take data.
- No eval, innerHTML or document.write with data in page or app header and footer code.
- Never bind user-typed text or an AI agent's answer unstripped into a Table HTML column, rich text or HTML Typography.
- Never bind a whole form or input object as a write parameter; send named fields only, never owner, status, amount or role.
- Never build an update or delete filter from page input alone; whoever sets the filter sets how many rows it hits.
- Never rely on a page data source filter to hide other users' records; use the permission filter or an owner-checked callable.
- Never send a price, total, fee, discount or eligibility date from the page as a fact; the server works it out.
- No page, source or agent input names who a message goes to; the automation reads the recipient from the record.
- Grant the users, teams or roles record types only to an admin role; a holder could widen their own access.
- Make every CSP row a host-shaped URL, 'self' or a bare scheme like data:; a pasted sentence there 500s every request of the app. (web only)
- Put block.permissions at the block root beside component; written under component or content it gates nothing.
- Restrict a file with fileVisibility, not allowDownload false; hiding the button leaves the URL working.
- Verify the storage provider supports ONLY_ME or PUBLIC fileVisibility; otherwise files silently fall back to restricted.
- Set fileVisibility explicitly on every FileUpload and upload action; the app default visibility seeds only the builder panel.
- Don't wire controlUser checkAuth or signInWithSSO on web; both are stubs that authenticate nobody and report success. (web only)
- Never put private values in setUrlParameters pageInputs; they land in the address bar, shared links and history.
- Give a POPOVER share an anchorBlockId, or use MODAL with GENERAL_ACCESS; otherwise role restrictions are silently dropped. (web only)
- Declare a public page's variables, functions and constants on that page; it can't read the global page's app variables.
- Restrict a block's data with the data source's advancedOptions.permissions too; block permissions only hide the view.
- Check every permission group id and name resolves; an unknown one locks everyone out silently.
- Set page permissions through the app record (page settings), never the page's own permissions key, which gates nothing.
- Make a page private by removing it from both app-record public lists; clearing one flag leaves it public.
- Never key data or permissions on deviceInfo.deviceId or isRooted; they identify a handset, not a person, and protect nothing. (mobile only)
- Never let a page input decide access; it is part of the URL a visitor can retype.
- Never gate what a user may see or do on userContext roles in a binding; use interface and data source permissions.
- Don't embed a private module in a public page or public app; make the module public or move the content.
- On a PUBLIC app with public uploads allowed, treat every upload as public; don't collect sensitive files there.
- Never put utils.getAuthToken output into displayed text, a link or a query string; it leaks the credential.

## P1

- Avoid using logged-in user pills in data sources.
- Avoid Using HTML Type in Typography Block.
- Don't make the app public unless it must be.
- Define a Content Security Policy.
- Promptguard on any publicly embedded agent.
- enforce.validate.redirect.url is TRUE, so there is no open redirect.
- No inline <script> in the custom code header or footer.
- A public page's sources read deployed entities; a module's sources need its own publicAccess.
- No permission group that nobody holds; it locks everyone out.
- Rate-limit queries per user on public surfaces.
- Mask PII in uploaded documents; keep chat and email bodies out of observability when the client asks.
- Page permissions gate nothing on their own; check the publicity lists and groups.
- Every module inside a private app has publicAccess off unless a public page uses it.
- Do not set forceCSPHeaders on the app record; it replaces whole directives (img-src, media-src, script-src) and beats Resource Control rows. (web only)
- List every third-party host the app loads (maps, Teams SDK, captcha, CDN fonts) in CSP Resource Control; check the console after publish. (web only)
- Restrict a browser-exposed map API key by HTTP referrer, API list and daily quota in the provider console. (web only)
- Give the default All users role view permission on apps and pages; an empty role leaves members seeing only apps they created. (web only)
- Review pages and apps switched to public in a change set; AI agent tools can make them public with only edit permission.
- Actions that write a user's data check sign-in and role first; guests and co-tenants must not reach them by tapping.
- Serve receipts and private documents through expiring signed links, never permanent public URLs.
- Make Log Out clear every locally stored user key and unregister the push token, then land on sign-in; the next user sees nothing. (mobile only)
- Handle an expired or revoked session app-wide: clear it, open sign-in with a clear message and return the user to the page they were on. (mobile only)
- Never write ID document images or personal data to local storage; keep only a server file id. (mobile only)
- Give an app that has a Login template page a separate home page; login returns to / and reopens the login form otherwise. (web only)
- An embedded app lists the parent origin in its frame-ancestors; a login token in the parent page's URL is never accepted by the child. (web only)
- SSO inside an iframe signs in through a popup, and the identity provider's partitioned-cookie setting matches the deployed build. (web only)
- List only named hosts in the CSP allowed sources; no "*" or bare "https:". (web only)
- Fill "Who can embed this app" only with the client's own domains, and leave it empty when nothing embeds the app. (web only)
- Add every third-party host the app loads (head code, iframes, image and font URLs) to CSP allowed sources, or it breaks once CSP is on. (web only)
- Set initial file visibility to private when users upload personal or business documents.
- Give each upload block or action a visibility that matches what it accepts; its own setting overrides the app default.
- Never upload sensitive images or documents as builder assets; property-panel uploads are always public.
- Read the signed-in user from userContext; never a hard-coded name, id, initials or a persona picker in place of sign-in.
- Never build an in-app persona or role switcher; give each persona a real login with a real role.
- Use PUBLIC file access only for images and files the app displays; private documents get USER or APPLICATION scope.
- Use anonymous user identification in Microsoft Clarity unless the client approved named tracking. (web only)
- Keep impersonation, delegation and hierarchy impersonation off unless the client asked for them.
- Point UAE Pass at env production in a production app, never staging.
- List only the client's own origins in allowedOrigins; never a wildcard.
- Check any URL a page opens, loads or navigates to that comes from a record or user input against an allowlist.
- Set allowed types, size and count on every file upload; allow a named list, never svg or html unless the job needs it.
- Prefix ' to export cells starting with =, +, - or @ so a spreadsheet can't run them as formulas.
- Give every Storage fetch a fields list of what the page shows; without one every field reaches the browser.
- Answer not found and not yours with the same message, so record ids can't be probed.
- Never show a raw source error (stack trace, SQL, connector error, host name) to the user; show one plain sentence.
- Never put typed text, search terms or form values in a usage-tracking event; only event codes and control names.
- Keep properties.flags.allowReadWriteExpressions off; it lets every {{ }} binding reach the real document, cookies and storage. (web only)
- Turn on properties.flags.shouldReEvaluateUsingEntityIds so {{ }} text arriving in page inputs or records is shown, never run.
- Treat a Comments delete add-on as visible on every comment; enforce who may delete on the server.
- Make a PDFViewer customDownloadUrl point at the document shown; it silently replaces what Download saves.
- Omit allowedRoleIds to allow every role; keep defaultRoleId inside the allowed list when restricting.
- Remember permission groups in one map are ANDed; listing two groups to mean either locks out most users.
- Grant a new permission group to a Role and a RoleMapping before gating blocks on it.
- Create login, signup, MFA, forgot and update password pages from the auth templates, not plain pages at those slugs.
- Keep environment variables off the path that decides what a public page shows; they are not loaded there.
- Never upload sensitive files through property panels (Image, PDF, brand); builder assets are stored PUBLIC.

## P2

- Remove console logs and debugger statements before deployment.
- Use SSO instead of username and password sign-in.
- Provide a revoke method when biometric enrolment is on. (mobile only)
- Check `publicAccess` matches the page's intent: public for a login screen, not pages behind it.
- Turn on impersonation and delegation both on the app record, with an active delegation; with either off the menu row is missing. (web only)
- Turn on location, microphone, camera or fullscreen only when a block or action on some page uses it. (web only)
- Leave "Also allow sites embedded in this app" off unless an embedded site needs that device. (web only)
- Keep location tracking off unless a page reads the user's location.
- Decide per-record actions (edit, delete this row) with a record permission check, not a role name.
- Allow an external origin through the app's CSP setting; never work around a blocked request.
- Apply password rules only where a password is set, from the app's password policy; never on sign-in or forgot-password.
- On a public page, render the anonymous state; never read user context fields that need a signed-in user.
- Set the browser permissions policy for camera, microphone and geolocation to deny unless a block on the app uses them. (web only)
- Turn on rooted-device prevention and screen protection on mobile apps that show personal or financial data. (mobile only)
- Set password length limits, history size and expiry when the app allows password sign-in.
- List each CSP allowed origin as one origin with its reason; no keyword, space or semicolon in an entry. (web only)
- Block camera, microphone and geolocation in security.permissionsPolicy unless the app or a site it embeds uses them. (web only)
- Use fileVisibility on CopilotInput upload actions, not the legacy allowPublicAccess.
- Switch password autofill off with autocomplete off; values like none or false are ignored by the browser.
- Keep update-password private; only login, signup, mfa-verification, reset-password and forgot-password are public slugs. (web only)

## P3

- Remove frame-ancestors rows valued 'Test studio preview'; the server now grants the platform origin per request. (web only)
