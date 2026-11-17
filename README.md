# BTA Ops Board

Crew ops board for Blue Tide Aviation (N282BT): crew schedule, training status and maintenance.

The site is published with GitHub Pages and refreshed automatically from Matt Mattison's private Ops Board. The board's data is encrypted in the page; each crew member signs in with their own username and password from Matt. Don't edit `index.html` by hand; changes are overwritten on the next refresh.

Report schedule conflicts and squawks with the buttons on the board (Microsoft Forms, no sign-in needed).

Install it like an app: on iPhone/iPad open the site in Safari, tap Share › Add to Home Screen. On Android or a computer, open it in Chrome and choose Install app (or Add to Home screen). The app icon, `manifest.webmanifest` and `sw.js` live in this repository.

## Airport analysis (testing)

`apg/` holds the APG airport analysis reports for N282BT, encrypted (AES-256-GCM; each file is a 12-byte IV followed by the ciphertext). File names are random and reveal nothing. Only logins that are given the airports key in their own encrypted sign-in entry see the Airports tile and can open the reports; while testing that is Matt only. `build/` holds the page code the crew site build adds for it, and `vendor/` holds the PDF viewer (PDF.js, Apache-2.0) so reports open offline. The app downloads every report after sign-in so they open without signal.
