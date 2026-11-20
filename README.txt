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
- The app opens directly to a full-screen English menu for teams/playing XI, player statistics and rankings, team statistics, new and live matches, resume, history, tournaments, reports/backup and settings/help. Swipe right from the left edge on touch screens, or press Escape on desktop, to return to the menu. It automatically saves to IndexedDB with a previous-state recovery copy and localStorage fallback. Data is local to this browser profile and computer.
- No login is required. App data is stored locally in this browser without encryption; protect your device and keep backups private.
- Export JSON backups from Reports & Backup for a separate copy or to move data to another computer. Browsers do not permit silent writes to arbitrary backup files.
- CSV export opens in Excel. Print / Save as PDF creates a complete match report with every innings' batting and bowling scorecards, extras, fall of wickets and ball-by-ball history; save the PDF, then share it from your device.
- No cloud sync, online live-score feed, or automatic WhatsApp sending is included. WhatsApp sharing requires internet and is not part of the offline core.
- For true PWA install/offline caching, run from localhost or HTTPS; browsers do not allow service workers from file:// URLs.
- On Android, install from the app's Install app button when the browser offers it, or use the browser menu. On iPhone/iPad, use Safari Share > Add to Home Screen.

CURRENT RELEASE SCOPE
This is a working starter application with local teams/players, standard and single/double/triple wicket
matches, selectable playing lineups of 1–15 players per side and custom overs, ball-by-ball scoring, undo, match summaries and sharing,
match history, team-selected series/tournaments and results, JSON backup/restore, CSV export, print/PDF, demo data,
English interface, and responsive layout. Extras support selectable runs and optional dismissals; limited-overs innings
end automatically after the last legal ball or wicket limit, then wait for the scorer to start the next innings. Wides do not offer a dismissal selector. The Wicket button opens the dismissal details before recording. Targets and run rates update during a chase, completed matches
are saved to history automatically, and history cards can share the summary.
The app also includes a web app manifest, standalone display mode, and offline service-worker cache for phone installation. The home menu uses a full-screen background image, and its square icon is also used for browser and installed-app icons.
- Player career records include batting, bowling and recorded fielding figures, including appearances, averages, strike/economy rates, best score/figures, 50s/100s, maidens, boundaries, dots, catches, stumpings, run outs and Player of the Match awards. Select a fielder for catches, stumpings and run outs so those fielding figures are credited.
- Player names open individual career profiles with match-by-match figures; team names open team profiles with rosters, match history and records. Player rankings show run scorers, wicket takers and fielders. Team standings award 2 points for a win and 1 for a tie.
- Team creation supports a Club team type; choose it when adding a club, and the type appears in team management, team rankings and the team profile. Older teams remain available as Other team.
- Series and tournaments can include any selected teams or clubs. Use Start match on a series card to open match setup with those teams available.
- Select each team's playing XI before a match and add missing names from the match setup. During a live match, replace an unused XI player with a squad player or a newly entered name; the XI size and wicket limit stay unchanged.
- Player statistics can be filtered to one team/club or one player. Team/Club Statistics lets you select a team to see its record and only its players' career stats. Player profiles can be edited, including name, team, role and optional photo.

Planned/partial modules requiring further development:
- Full Test match multi-innings and follow-on enforcement
- Super Over workflow and tie-break rules
- Automatic fixture scheduling and NRR-based tournament tables
- Wagon wheel, charts, sound effects and celebration animations
- Full Urdu translation, PDF templates, certificates and logo upload
- Maidens, bowling strike/economy edge cases, run-out crossing and full laws-based dismissal validation
- Secure authentication and role-based permissions (not included)
- Native desktop installer and multi-device LAN sync

CRICKET SCORING UPDATE
- Wide and no-ball add a one-run penalty plus the selected completed/batter runs and do not count as legal balls.
- For any extra, tap the extra and then tap 0, 1, 2, 3, 4 or 6 in the main Runs row to record it immediately; no delivery prompt, Cancel button or extra run selector is needed.
- Wides and no-balls add a one-run penalty and are not legal balls. Byes and leg-byes add only the selected extra runs and count as legal balls. A chase ends automatically when the target is reached.
- Use the Wicket button to record a dismissal. During a match, choose an innings in the scorecard selector to review that innings' batters, dismissals and bowling figures.
- The live scorer shows over-by-over results without the commentary panel, and the in-match scorecard does not display the profile picture.
- On phone screens, the live score, current run rate, chase required run rate, target, recent balls and current batting/bowling figures sit above a fixed scoring tray. Run rates use the match's legal-ball count; wides and no-balls do not consume balls, and wides do not add batter runs or balls faced.
- Match bowling figures show that innings' average, economy and strike rate. Undo, Swap, End innings and Finish match sit below the scoring buttons.
- After a wicket, the scorer must confirm the incoming batter; after six legal balls, the scorer selects the next bowler (a different one when available). The next delivery stays paused until the required choices are confirmed.
- Player roles include Wicketkeeper (WK), shown in team rosters and playing-player selection.
- The live score includes a clearly labeled estimated win prediction based on score, overs and wickets; Test Match prediction is unavailable.
- In-match player controls are in a collapsed Manage players section. It supports replacing an unused lineup player and editing a player's name or role without losing match statistics.
- Player of the Match is suggested automatically by batting runs plus 20 points per credited bowling wicket (runs break ties). Choose another match participant if desired; the selected player's batting, bowling and fielding performance appears in the summary and PDF.
- This starter is not a certified laws engine; review scorecards, especially run-outs and edge-case dismissals, before using it for official tournament records.

PROFILE FEATURE UPDATE
- Admin display name and profile photo can be set from Settings & Help > Admin Profile & Display Picture.
- Default admin display name is RAZI SHAH; a previously saved default "Admin" name is updated automatically.
- The profile photo is resized and stored in local app data, then shown in the header. The match scorecard does not display it.
- The CRICDAIRY cricket-ball brand mark remains fixed and cannot be changed, as requested.
- Profile data is included in the JSON backup/restore.


PROFILE & DISPLAY PICTURES
- Your supplied admin profile picture is saved in assets/admin-profile.jpg and is used by default.
- Your supplied CRICDAIRY display picture is saved in assets/app-display.jpg and appears in the app header.
- Settings lets you upload a replacement profile picture or display picture. Both are stored locally in this browser; the two supplied defaults are included in the offline app cache.
