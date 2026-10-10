# BMA — Hospital Coordination

| Folder | What it is | Port |
|---|---|---|
| `client/` | React + Vite portal for hospital admins, staff, doctors and drivers | 3000 |
| `user-app/` | The public ambulance app citizens use to book and track | 3001 |
| `server/` | Express API, auth, Socket.IO, **owns the database schema** | 5000 |
| `hospital-orchestrator/` | Emergency dispatch: reads hospitals/ambulances, calls the AI service, logs the incident via the server | 5001 |
| `ai-service/` | Flask scoring service: picks the best hospital and nearest ambulance | 8000 |

## Quick start with Docker (recommended)

Needs only [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone <repository-url> HospitalCoordination
cd HospitalCoordination
cp .env.docker.example .env        # set MYSQL_ROOT_PASSWORD and JWT_SECRET
docker compose up --build
```

Then open http://localhost:3000 and register a hospital. The first start takes a few minutes, mostly downloading images and installing packages. The database and all tables are created automatically, and data is kept in the `mysql-data` volume between runs.

| Command | What it does |
|---|---|
| `docker compose up -d --build` | Start everything in the background |
| `docker compose logs -f server` | Follow one service's logs |
| `docker compose down` | Stop (keeps the database) |
| `docker compose down -v` | Stop and **delete** the database |

Ports: hospital portal 3000, public app 3001, API 5000, dispatch 5001, AI 8000, MySQL 3307 (on the host). To serve it from another machine or domain, set `CLIENT_URL`, `PUBLIC_API_URL` and `PUBLIC_ORCHESTRATOR_URL` in `.env` and rebuild.

## Running without Docker

### Prerequisites

- Node.js 18+
- Python 3.10+
- MySQL 8 running locally (or a hosted MySQL such as Aiven / TiDB Cloud)

### First-time setup

```bash
# 1. Environment files — copy each example and fill in your MySQL password and a JWT secret
cp server/.env.example server/.env
cp hospital-orchestrator/.env.example hospital-orchestrator/.env   # JWT_SECRET must match server/.env
cp ai-service/.env.example ai-service/.env
cp client/.env.example client/.env
cp user-app/.env.example user-app/.env

# 2. Dependencies
cd server && npm install && cd ..
cd hospital-orchestrator && npm install && cd ..
cd client && npm install && cd ..
cd user-app && npm install && cd ..
cd ai-service && python -m venv venv && venv/Scripts/pip install -r requirements.txt && cd ..
# (macOS/Linux: venv/bin/pip)
```

### Run (one terminal each, in this order)

```bash
cd server && npm run dev                 # creates/updates the database, then serves :5000 (restarts on changes)
cd hospital-orchestrator && npm run dev  # :5001 (restarts on code changes)
cd ai-service && venv/Scripts/python app.py   # :8000
cd client && npm run dev                 # hospital portal, http://localhost:3000
cd user-app && npm run dev               # public ambulance app, http://localhost:3001
cd simulator && npm start                # demo only: moves the demo ambulances (needs TELEMETRY_TOKEN)
```

## Database

You don't need to create the database or any tables by hand. When the server starts it:

1. Creates the `DB_NAME` database if it doesn't exist.
2. Applies every new file in `server/db/migrations/` in order, and records it in the `schema_migrations` table.

To run migrations without starting the server: `cd server && npm run db:migrate`.

| Migration | Purpose |
|---|---|
| `000_archive_conflicting_tables.js` | Renames tables from the old design to `legacy_*` (does nothing on a new database) |
| `001_initial_schema.sql` | `hospitals`, `users`, `departments`, `doctors`, `resource_types`, `hospital_resources`, `ambulances`, `incidents` |
| `002_seed_lookups.sql` | Department list and default resource types (Beds, ICU, Ventilators) |
| `003_seed_ambulances.sql` | Demo ambulance fleet (imported from `ai-service/model/BMA_Training_Data.xlsx`) |
| `004_import_legacy_data.js` | One-time copy from the old `admins` / `staff_directory` / `legacy_*` tables |
| `005_staff_roster_activity.sql` | Doctor logins, temporary passwords, four-state doctor status, `doctor_shifts`, `activity_log`, and who requested each incident |
| `006_incident_triage.sql` | Severity and "needs ICU" recorded on each incident |
| `007_dispatch_workflow.sql` | Accept/divert workflow (`incident_requests`), bed holds (`bed_holds`), patient details and lifecycle timestamps on `incidents` |
| `008_driver_fleet.sql` | Hospital-owned ambulances (vehicle number, type), `driver` role, shifts and live GPS fields |
| `009_public_requests.sql` | Public (citizen) bookings: `public_users`, bystander / unidentified-patient and payer fields on `incidents`, hospital type, `hospital_schemes`, `hospital_tariffs` |
| `010_device_sessions.sql` | Device-bound sessions in place of the OTP; the caller's number becomes a booking field, not a credential |
| `011_parallel_dispatch.sql` | Claim columns on `incident_requests` so several hospitals can be asked at once and a tie resolved by rank |
| `012_ambulance_offers.sql` | `ambulance_offers` (job offers to drivers, with a claim window) and `incidents.ambulance_search` |

**Changing the schema:** add the next numbered file (e.g. `006_add_x.sql`). Never edit a migration that has already run. Other people pick the change up the next time they start the server.

### Tables

- `hospitals`: one row per hospital. Holds the name, address, city and GPS location.
- `users`: everyone who logs in, each belonging to one hospital. `role` is `admin`, `staff` (who also have a `department_id`) or `doctor` (linked to their roster entry through `doctor_id`). `must_change_password` is set for accounts created with a temporary password.
- `doctors`: the roster. `status` is `on_duty`, `on_call`, `in_surgery` or `off_duty`. Dispatch counts Emergency and Trauma doctors who are on duty or on call.
- `doctor_shifts`: planned shifts. The server checks every 30 seconds: when a shift starts, an off-duty doctor goes on duty, and when it ends they go off duty. Status changes made by hand in between always win.
- `hospital_resources`: belongs to a hospital and a department. A hospital has at most one row for each resource type in each department.
- `activity_log`: who changed what and when, shown on the admin's Activity tab.
- `ambulances`: the dispatch fleet. `status` changes from `available` to `dispatched` and back to `available` when the ambulance arrives.
- `incidents`: one row per dispatch, linked to the hospital and the ambulance that was sent.

## Roles

| | Admin | Staff | Doctor | Driver |
|---|---|---|---|---|
| Dashboard | All departments | Own department | Own department (view only, except their own status) | Driver app only |
| Update beds / ICU / ventilators | ✓ | Own department | – | – |
| Change doctor status | ✓ | Own department | Themselves | – |
| Plan shifts | ✓ | Own department | – | – |
| Emergency dispatch | ✓ | ✓ | – | – |
| Accept / divert incoming patients | ✓ | ✓ | – | – |
| Staff & roster (staff, doctors, ambulances, drivers) | ✓ | – | – | – |
| Activity log | ✓ | – | – | – |
| Start/end shift, share location, see current job | – | – | – | ✓ |

New staff and doctor accounts get a one-time password, which the admin passes on in person. They must set their own password at first sign-in. Deactivating an account signs that person out immediately.

## Client UI

All screens are built from the shared components in `client/src/ui/index.jsx`: Button (sm / md / lg), Input, PasswordInput, Select, Field, Card, Badge, Switch, Tabs, Segmented (toggle group), dropdown Menu, Dialog, Sheet (side panel), Tooltip, RadioCards, Stepper, Table, Skeleton and EmptyState. The interactive ones wrap [Radix UI](https://www.radix-ui.com/) for keyboard and screen-reader support. Design tokens (font, colours) live in `client/src/index.css`. Use these instead of writing one-off Tailwind classes, so sizes stay consistent.

## Emergency dispatch workflow

1. **Find hospitals.** The dispatcher picks the complaint, severity, ICU need and the patient's pin. The orchestrator searches outward from the pin (25, 50, 100, then 200 km) and the AI service ranks them. It weighs distance, free beds, ICU, and whether a specialist for that complaint (`server/config/complaints.js`) or an Emergency/Trauma doctor is on duty.
2. **Send.** All the ranked hospitals (`DISPATCH_FANOUT`, default 5) are asked **at the same moment**, not one after another. The nearest free ambulance is reserved and leaves for the patient immediately, driving towards the best-ranked hospital until someone accepts.
3. **Accept.** Admins and staff at every hospital asked get a full-screen alert with the same countdown (`DISPATCH_DEADLINE_SECONDS`, default 45). The first to accept takes the patient; the rest are told it's gone.

   Asking in turn used to mean a patient could wait five timeouts — five minutes — before the fifth hospital had even seen the request. One shared deadline caps the wait at 45 seconds.

   **When two accept at once,** rank decides, not reflexes. The best-ranked hospital accepts instantly. Anyone else registers a claim and pauses for `DISPATCH_CLAIM_WINDOW_MS` (default 2000) so a hospital the ranking preferred can still get its answer in; the best rank among the claimants then wins. Whoever loses is told another hospital took the patient. The final guard is a single conditional UPDATE on the incident, so even a logic slip cannot hand one patient to two hospitals.
4. **Divert or no answer.** There is no next hospital to fall back to — they were all asked already. A hospital that ran out of time (but didn't divert) keeps a "Missed request" banner and can still accept, as long as no other hospital has. Only when every hospital has diverted or let the deadline pass does the incident become "No hospital accepted", and the dispatcher can search again (which asks the next batch, again all at once).
5. **On accept**, one bed (and one ICU bed if needed) is held and the best on-duty doctor is assigned as the receiving doctor.
6. **Journey.** Status moves from Accepted to Patient on board (ambulance reaches the patient) to At hospital, and then to Handed over (recorded by the receiving hospital). Either hospital can then close it. Cancelling at any point frees the ambulance and releases held beds.

**The server never moves an ambulance.** Something reports where it is, and the server works out what that means: a new ETA, or arrival at the patient or the hospital. Drivers report from their phone (`POST /api/driver/location`). Ambulances without a driver phone, such as a vehicle tracker or the demo fleet, report through `/api/telemetry`, which is switched off unless `TELEMETRY_TOKEN` is set. All job state lives in the database, so a restart loses nothing.

### Routes and ETAs (`server/services/routing.js`)

ETAs come from real road routes, not straight lines (which are wrong by 30–60% on Indian roads). The provider is picked by configuration:

| Setting | Routes | Traffic |
|---|---|---|
| `MAPBOX_TOKEN` set | Mapbox `driving-traffic` | Live |
| Neither (default) | OSRM (`OSRM_URL`, defaults to the public demo server — development only) | No |
| `ROUTING_PROVIDER=none`, or the provider is down | Straight line × 1.4 at 28 km/h | No, and labelled as an estimate |

Both apps say which one an ETA came from ("with live traffic", "by road", "rough estimate").

A position report doesn't call the provider. Each incident's route is cached per leg. A position is projected onto the cached route, and the remaining time is scaled from the route's own duration. A new route is fetched only when the destination changes, the ambulance strays more than 300 m off it, or (with live traffic) it is three minutes old. Never more than once every 20 seconds per trip. Arrival counts as reaching the end of the road route as well as being within 150 m (patient) or 250 m (hospital) of the pin, because a route ends where the road does.

The route itself goes out as an `ambulance_route` socket event when it changes, and from `GET /api/incidents/:id/route` and `GET /api/public/requests/:id/route`. Location updates carry only the ETA, the remaining distance and the route version.

Routing sends the ambulance's position and destination (which can be the patient's location) to the routing provider.

### Demo simulator (`simulator/`)

The 448 demo ambulances have no drivers, so for a demo something has to pretend to be their trackers. `simulator/simulate.js` is a plain API client with no dependencies and no database access. Every second it asks the server which ambulances have somewhere to be, moves each one along its road route at the speed the route expects, and reports the new positions. Stop it and the demo ambulances stop moving. Nothing else changes.

```bash
# server/.env and simulator/.env need the same TELEMETRY_TOKEN
cd simulator && npm start
```

`SIM_SPEED_KMH` (default 50) and `SIM_SPEEDUP` (default 4) set the speed. Ambulances with a driver on shift are never touched by it.

## Ambulances & drivers

- **Fleet:** admins add their ambulances (vehicle number, type: Basic / Advanced / ICU) and drivers under **Staff & roster → Ambulances**. Drivers get a temporary password, like staff.
- **Driver app:** a driver signs in on their phone and lands on a phone-friendly screen. **Start shift** shares their location every 5 seconds and keeps the screen awake.
- **Who gets offered for jobs:** an ambulance is only suggested when a driver is on shift and their location is fresh (`GPS_STALE_MINUTES`). The imported demo fleet is also used unless `USE_DEMO_AMBULANCES=false`.
- **Drivers accept jobs; they aren't assigned them.** When a request is made, the nearest drivers on shift (`AMBULANCE_OFFER_FANOUT`, default 3) are offered the job at the same moment, with a sound, vibration and a countdown (`AMBULANCE_OFFER_SECONDS`, default 20). The offer shows the distance, the complaint, the pickup address and a map. The first to accept gets the job. If two accept together, the nearer one wins, using the same claim window as hospitals. If everyone declines or the time runs out, the next nearest drivers are asked. After `AMBULANCE_OFFER_ROUNDS` rounds (default 3) the caller is told no driver accepted and to call 108. Finding a driver runs alongside finding a hospital, and neither waits for the other. Each driver gets one offer at a time.
- **Jobs:** once accepted, the job shows the patient, address, a caller button, a **Navigate** button that opens Google Maps directions, and a map with all three points: the driver, the patient and the hospital. It draws the road to the patient and, dashed, the road from the patient to the hospital. The receiving hospital and doctor appear once a hospital accepts.
- **Demo ambulances** have no drivers, so the simulator answers their offers too, accepting after 3–8 seconds (`SIM_ACCEPT_MIN_MS` / `SIM_ACCEPT_MAX_MS`). It uses `/api/telemetry/offers`. Without the simulator running, demo ambulances never accept.
- **Progress:** pick-up and arrival are recorded automatically when the driver's location reaches the patient (150 m) or the hospital (250 m). The driver can also tap **Patient picked up** / **Arrived at hospital**. GPS ambulances are never moved by the simulation.

Browsers only share location on secure pages: `http://localhost` works for development, and the deployed client must be served over HTTPS (Vercel and Render already do this).

## Contributing

- Never commit `.env` files or database dumps. Use `.env.example` / `.env.docker.example` for new settings.
- Schema changes go in a new numbered file in `server/db/migrations/`.
- Before pushing: `cd client && npm run lint && npm run build`.

## Public ambulance app

`user-app/` is a **separate front-end** from the hospital portal: its own project, its own
dependencies, its own small UI kit sized for a thumb, and its own port (3001). It talks only
to `/api/public/*` and shares nothing with `client/` but the API, so the two can change
independently.

A member of the public books an ambulance there — no hospital account, no sign-up beyond a
phone number.

- **No sign-in.** Nothing stands between a caller and an ambulance: no password, no code, no
  waiting. The app generates a random device id on first open and that id is the account.
  Identity is deliberately *not* the phone number — if typing a number granted a session,
  anyone could type a stranger's number and read their booking history and their patient's
  live location. The number is contact detail stored on the booking, never a credential.
  Public users live in `public_users`, never in `users`, and their tokens are signed with a
  secret derived from `JWT_SECRET`, so a citizen token can never verify as a hospital token.
- **Booking needs only a location.** Complaint, severity, who the patient is and the caller's
  number are all optional; an ambulance sent with partial information beats one not sent.
  Anything left blank can be added with `PATCH /api/public/requests/:id` while it drives, and
  the hospital sees the update immediately. The server ranks hospitals itself through the
  dispatch service and asks the best three in order, exactly like a hospital-made dispatch.
- **Tracking:** the app polls every 5 seconds. It shows the ambulance, the hospital once one
  accepts, the receiving doctor and a timeline, and it can cancel.
- **Abuse controls:** OTP before the first booking, one active request at a time,
  `PUBLIC_REQUESTS_PER_DAY` per number, and `is_blocked` on `public_users`.

### Bystanders and unidentified patients

Choosing **"a stranger"** switches on the Good Samaritan path:

- The app states plainly that the caller will not be charged, need not give their name, and
  may leave once the ambulance arrives (MV Act s.134A and the Good Samaritan guidelines).
- The incident is flagged `requester_relationship = 'bystander'`, and optionally
  `patient_identified = false`.
- Trauma, burns and poisoning, or any road accident, set `is_mlc` so the hospital knows to
  inform the police. `POST /api/incidents/:id/police-informed` records that, and
  `POST /api/incidents/:id/identify` names a patient who arrived unknown.
- A bystander's payer answer is ignored: they cannot commit a stranger to a private bill, so
  the request is always routed as an unknown payer.

### Who pays, and how it steers routing

`server/config/payers.js` resolves a payment route from the cause and the payer answer: a road
accident goes to the central cashless scheme, otherwise Ayushman Bharat / insurance / self-pay
/ unknown. Hospitals record their type and scheme empanelment and publish arrival costs in
**Settings → Rates & schemes**.

The preference **nudges the ranking and never filters**, and severity decides how much it counts:

| Severity | Effect of the payer preference |
|---|---|
| Critical | **None.** Nearest capable hospital, whatever it costs. Private hospitals must stabilise an emergency case under the Clinical Establishments Act s.12(2). |
| Serious | Half weight — a scheme match is worth roughly 4 km of extra travel |
| Stable | Full weight — worth roughly 12 km, since a card that works can be the difference between a free stay and a six-figure bill |

"Cannot pay" is deliberately **not** a divert reason. Admins can watch public requests in the
**Control room** tab, which lists active public bookings near their hospital.

> The legal points above reflect publicly documented Indian law and policy and are not legal
> advice. Confirm the current rules, scheme amounts and your state's empanelled hospitals
> before using this with real patients. The app always offers a one-tap call to 108 and never
> presents itself as a replacement for it.
