# BTA Ops Board

Crew ops board for Blue Tide Aviation (N282BT): crew schedule, training status and maintenance.

The site is published with GitHub Pages and refreshed automatically from Matt Mattison's private Ops Board. The board's data is encrypted in the page; each crew member signs in with their own username and password from Matt. Don't edit `index.html` by hand; changes are overwritten on the next refresh.

Report schedule conflicts and squawks with the buttons on the board (Microsoft Forms, no sign-in needed).

Install it like an app: on iPhone/iPad open the site in Safari, tap Share › Add to Home Screen. On Android or a computer, open it in Chrome and choose Install app (or Add to Home screen). The app icon, `manifest.webmanifest` and `sw.js` live in this repository.

## Airport analysis (testing)

`apg/` holds the APG airport analysis reports for N282BT, encrypted (AES-256-GCM; each file is a 12-byte IV followed by the ciphertext). File names are random and reveal nothing. Only logins that are given the airports key in their own encrypted sign-in entry see the Airports tile and can open the reports; while testing that is Matt only. `build/` holds the page code the crew site build adds for it, and `vendor/` holds the PDF viewer (PDF.js, Apache-2.0) so reports open offline. The app downloads every report after sign-in so they open without signal.

## Quick Quote (Matt only)

`quote/quote.bin` is the Quick Quote estimator, encrypted with its own key (same format as `apg/`). Only logins given that key see the Quick Quote tile; it opens full screen and works offline. Saved leads and added airports stay on the device.

## Check Ride (Matt only)

`checkride/` holds the check airman tool for 135.293/297/299 checks in N282BT (briefings, scenario oral, grading, document photos and the Jet Logistics TR-2/TR-6/TR-7 forms), encrypted with its own key (same format as `apg/`): `app.bin` is the app and `tr2.bin`, `tr6.bin`, `tr7.bin` are the blank JLI forms. Only logins given that key see the Check Ride tile; it opens full screen and works offline. Checks and photos stay on the device. `vendor/pdf-lib.min.js` (MIT) fills the forms in the browser.

## Feature switches (testing)

`build/feat_module.js` and `build/feat_module.css.html` add a Tools hub and the features being tested for the BTA App (trip status, flight log, trip request, close-out, load planning, destination guide, cockpit cards, training grid, hazmat, expirations, upgrade readiness, emphasis items, slide library, manuals, maintenance forecast, recurring tasks, expenses, and two Home layout changes). Who sees each feature is set per person or group in Matt's "BTA Ops Board – Feature access" Google Sheet; the build gives each login a key only for the features switched on for it. `features/` holds feature content encrypted with each feature's own key (same file format as `apg/`). Entries made in the flight log, tasks, expenses and similar tools stay on the device until the BTA App has a shared database.
