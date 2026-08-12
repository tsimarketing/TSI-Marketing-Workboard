# TSI Marketing Workboard

A shared workload and task dashboard for the TSI Marketing Team. Everyone sees the same team overview. Capacity is self-reported, and the product deliberately excludes rankings, activity tracking, and productivity scores.

## Current MVP

- Responsive TSI-branded team overview
- Peer-visible focus, workload context, and capacity signals
- My Tasks and Team Tasks views
- Status and priority filters
- Project grouping
- Add and edit task flows
- Email and password sign-in through Firebase Authentication
- Approved-account-only Firestore access
- Password reset support

## Firebase setup

1. Create a Firebase project and web app.
2. Enable Email/Password as a Firebase Authentication provider.
3. Add the GitHub Pages domain to Firebase Authentication's authorized domains.
4. Confirm the web configuration values in `firebase-config.js`.
5. Deploy `firestore.rules` to the project.

Accounts are created and managed by the project owner in Firebase Authentication. The app does not expose public self-registration. Firestore rules require authentication and restrict task updates to each task owner.

## GitHub Pages

Publish from the repository's `main` branch and `/root` folder. No build command is required.

## Local preview

Serve the repository folder through any static HTTP server. Opening `index.html` directly may block JavaScript modules in some browsers.
