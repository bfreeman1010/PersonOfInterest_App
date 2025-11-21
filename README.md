# Surveillance Application

A lightweight surveillance-tyle dashboard that renders animated dossiers, a Leaflet map, and REST endpoints so you can monitor fictional "people of interest" from the web. The demo has around 6,7 mock people of interest that you can view and edit to your discretion. Images may be out of date due to the fact they are not hosted in the githhub and instead image linked.

## Stack

- **Node.js + Express** – serves the API endpoints (`/api/people`) and static assets.
- **Supabase Postgres** – `db.js` talks to the hosted `people` table for persistence.
- **Leaflet.js** – powers the interactive map that tracks the "last seen" coordinates.
- **Vanilla JS + CSS** – drives the cinematic UI, chip lists, search, and form behaviour.

## App Flow

1. **Server boot** – `server.js` wires Express routes to the helpers in `db.js`. The server also serves `public/` so the browser loads `index.html`.

2. **Dashboard Load** – `public/app.js` fetches `/api/people`, sorts the roster, and renders the sidebar cards plus the Leaflet map. Selecting a card updates the dossier/profile panel and pings the map marker.

3. **Profile Updates** – Editing the "Update Profile" form fires a `PUT /api/people/:id/profile`, which persists through `db.updatePersonProfile` and refreshes the UI state.

4. **Last Seen Updates** – The map form calls `PUT /api/people/:id/last-seen`. Successful responses update the card, map marker, and timestamp typing effect.

5. **Adding Individuals** – `public/add.html` hosts a simple form (`add.js`). Submitting sends a `POST /api/people`, then redirects back to the console so the new dossier appears in the roster.

## Setup

- Install dependencies: `npm install`
- Create a `.env` file in the project root with your Supabase credentials:
  ```
  SUPABASE_URL=<your-project-url>
  SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
  ```
  The service role key is required because the server performs inserts and updates.

## Running

- Start the app: `npm start`
- The server listens on port 4000 by default; set `PORT` to override.
- Leaflet assets are served from `/vendor/leaflet` (backed by `node_modules/leaflet/dist`).

## API

- `GET /api/health` – heartbeat
- `GET /api/people` – list all people
- `POST /api/people` – create a person
- `GET /api/people/:id` – fetch a single dossier
- `PUT /api/people/:id/profile` – update profile fields
- `PUT /api/people/:id/last-seen` – update coordinates and notes
