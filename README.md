# TSI Marketing Workboard

A shared workload and task dashboard for the TSI Marketing Team. Everyone sees the same team overview. Capacity is self-reported, and the product deliberately excludes rankings, activity tracking, and productivity scores.

## Current MVP

- Responsive TSI-branded team overview
- Peer-visible focus, workload context, and capacity signals
- My Tasks and Team Tasks views
- Status and priority filters
- Project grouping
- Add and edit task flows
- Microsoft sign-in through Firebase Authentication
- Client and Firestore enforcement for verified `@tsico.com` accounts
- Local demo mode for design review before Firebase is connected

## Firebase setup

1. Create a Firebase project and web app.
2. Enable Microsoft as a Firebase Authentication provider and add the Microsoft application credentials.
3. Add the GitHub Pages domain to Firebase Authentication's authorized domains.
4. Replace the placeholder values in `firebase-config.js`.
5. Deploy `firestore.rules` to the project.
6. Change `demoMode` to `false` in `firebase-config.js` before production use.

The UI checks the signed-in email domain, while `firestore.rules` independently enforces verified `@tsico.com` access to team data. For stricter tenant-only access, configure the Microsoft provider with the TSI tenant ID instead of `common` in `app.js`.

## GitHub Pages

Publish from the repository's `main` branch and `/root` folder. No build command is required.

## Local preview

Serve the repository folder through any static HTTP server. Opening `index.html` directly may block JavaScript modules in some browsers.
