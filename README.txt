CRICDAIRY – OFFLINE CRICKET SCORING (Starter Release)
====================================================

RUN LOCALLY
1. Extract CRICDAIRY.zip to a folder.
2. Open the folder in VS Code.
3. Recommended: install the "Live Server" extension, then right-click index.html > Open with Live Server.
   OR open PowerShell in this folder and run:
       python -m http.server 8000
   Then open http://localhost:8000
4. Load the site once while local server is running. The service worker caches app files for offline use.
5. For future use, open the same local address. Do not move/delete the folder while using this local server.

IMPORTANT
- The app automatically saves to IndexedDB with a previous-state recovery copy and localStorage fallback. Data is local to this browser profile and computer; use the dashboard Resume match button after reopening.
- Export JSON backups from Reports & Backup for a separate copy or to move data to another computer. Browsers do not permit silent writes to arbitrary backup files.
- CSV export opens in Excel. Use Print > Save as PDF for scorecards.
- Optional login defaults to username admin and password cricdairy123. Change it in Settings before use.
- Login is a simple local access lock, not encryption. Do not rely on it to protect sensitive data.
- No cloud sync, online live-score feed, or automatic WhatsApp sending is included. WhatsApp sharing requires internet and is not part of the offline core.
- For true PWA install/offline caching, run from localhost or HTTPS; browsers do not allow service workers from file:// URLs.
- On Android, install from the app's Install app button when the browser offers it, or use the browser menu. On iPhone/iPad, use Safari Share > Add to Home Screen.

CURRENT RELEASE SCOPE
This is a working starter application with local teams/players, standard and single/double/triple wicket
matches, selectable playing lineups of 1–15 players per side and custom overs, ball-by-ball scoring, undo, match summaries and sharing,
match history, series grouping/results, JSON backup/restore, CSV export, print/PDF, demo data, language
toggle labels, and responsive layout. Extras support selectable runs and optional dismissals; innings breaks
wait for the scorer to start the next innings. Targets and run rates update during a chase, completed matches
are saved to history automatically, and history cards can share the summary.
The app also includes a web app manifest, home-screen icon, standalone display mode, and offline service-worker cache for phone installation.

Planned/partial modules requiring further development:
- Full Test match multi-innings and follow-on enforcement
- Super Over workflow and tie-break rules
- Automatic fixture scheduling and NRR-based tournament tables
- Player rankings, comparison and head-to-head
- Wagon wheel, charts, sound effects and celebration animations
- Full Urdu translation, PDF templates, certificates and logo upload
- Maidens, bowling strike/economy edge cases, run-out crossing and full laws-based dismissal validation
- Admin/Scorer permission separation and secure authentication
- Native desktop installer and multi-device LAN sync

CRICKET SCORING UPDATE
- Wide and no-ball add a one-run penalty plus the selected completed/batter runs and do not count as legal balls.
- Byes and leg-byes add the selected extras and count as legal balls. A chase ends automatically when the target is reached.
- Player of the Match is selected automatically by batting runs plus 20 points per credited bowling wicket (runs break ties).
- This starter is not a certified laws engine; review scorecards, especially run-outs and edge-case dismissals, before using it for official tournament records.

PROFILE FEATURE UPDATE
- Admin display name and profile photo can be set from Settings & Help > Admin Profile & Display Picture.
- Default admin display name is RAZI SHAH; a previously saved default "Admin" name is updated automatically.
- The profile photo is resized and stored in local app data, then shown in the header, dashboard, login screen, and printed scorecard.
- The CRICDAIRY cricket-ball brand mark remains fixed and cannot be changed, as requested.
- Profile data is included in the JSON backup/restore.


PROFILE & DISPLAY PICTURES
- Your supplied admin profile picture is saved in assets/admin-profile.jpg and is used by default.
- Your supplied CRICDAIRY display picture is saved in assets/app-display.jpg and appears in the app header and login screen.
- Settings lets you upload a replacement profile picture or display picture. Both are stored locally in this browser; the two supplied defaults are included in the offline app cache.
