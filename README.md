# Duo: a private space for two

Duo is a real-time chat, media-sharing and video-calling web app for **exactly two people**. There is no sign-up, no user search, no groups and no second conversation. The server enforces all of this; the UI is not trusted to.

It is built mobile-first. It installs as a PWA and is meant to feel like a native app in Safari on iPhone and Chrome on Android, while still working well on tablets and desktops.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Folder structure](#folder-structure)
5. [Quick start (local)](#quick-start-local)
6. [Environment variables](#environment-variables)
7. [MongoDB setup](#mongodb-setup)
8. [Seeding the two users](#seeding-the-two-users)
9. [Cloudinary setup](#cloudinary-setup)
10. [Web Push setup](#web-push-setup)
11. [WebRTC / TURN setup](#webrtc--turn-setup)
12. [Testing](#testing)
13. [Production deployment](#production-deployment)
14. [Security model](#security-model)
15. [Troubleshooting](#troubleshooting)
16. [Known limitations](#known-limitations)

---

## Features

**Private access**
- Two accounts, provisioned only by `npm run seed` from environment variables. No signup route exists.
- Runtime allow-list (`AUTHORIZED_USER_1_EMAIL`, `AUTHORIZED_USER_2_EMAIL`), plus a membership check against the one conversation, on every API request and every socket handshake.
- A unique database constraint means a second conversation cannot exist.

**Chat**
- Real-time messages over Socket.IO, with optimistic sending, an offline outbox, idempotent retries (`clientId`) and gap-filling after a reconnect.
- Message states: sending (clock) → sent (✓) → delivered (✓✓) → read (highlighted ✓✓).
- Typing indicator (throttled, self-healing), online/offline presence and "last seen".
- Replies (swipe a bubble right, or use long-press → Reply), emoji reactions, copy, and delete for both people.
- Emoji picker with recents. Messages made only of emoji render large.
- Cursor pagination: the latest 40 messages load first, and older ones load as you scroll up, with the scroll position preserved.
- Search across text, photos and videos, filterable by date. Tapping a result jumps to the message.
- Media gallery of photos and videos, grouped by month.

**Media**
- Camera, gallery and file picker on mobile, plus paste on desktop.
- Photos are resized and re-encoded on the device (WebP/JPEG) before upload. HEIC is converted where the browser can decode it.
- Videos get duration and size validation, a client-generated poster frame, upload progress with cancel, and retry on failure.
- Full-screen photo viewer with pinch, wheel and double-tap zoom, panning, and swipe-down to close. Videos open in a full-screen player.
- Binaries go to object storage (Cloudinary). MongoDB stores only keys and metadata.

**Voice notes**
- Tap the mic (shown when the message box is empty) to record. Then send straight away, or tap stop to review and play it back first, or discard it.
- Live level meter while recording, and a waveform you can tap to seek during playback. Playback speed 1×/1.5×/2×, and only one note plays at a time.
- Recorded with MediaRecorder: Opus/WebM on Chrome, Edge and Firefox, AAC/MP4 on Safari. The server checks the actual bytes against an audio allow-list and enforces size and length limits. Cloudinary delivers MP3 so every browser can play every note.

**Voice calls**
- 📞 next to 🎥 in the chat header (and in the sidebar and call history). Uses the microphone only, never the camera.
- Tuned for clarity: Opus at 64 kbps, in-band FEC to repair packet loss, no DTX, high network priority, echo cancellation and noise suppression.
- Large-avatar call screen that glows while the other person speaks; mute and hang up; "voice" or "video" shown in history and notifications.
- **Settings → Calls → Allow voice calls / Allow video calls**: separate switches. When one is off, that kind of call never rings; the caller is told right away ("… isn't taking video calls right now") and the attempt is logged as missed. Saved per person, enforced by the server.
- **Answer** on the incoming-call notification: opens the app and connects the call right after signing in. Calls ring for 60 s; an unanswered call replaces its notification with "Missed voice/video call".
- **Speaker / earpiece** button in voice calls on devices whose browser exposes both outputs (setSinkId); elsewhere the browser chooses the output.

**Video calls**
- 1:1 WebRTC, with Socket.IO for signaling and STUN/TURN supplied by the server.
- Incoming-call screen, accept/decline, mute, camera on/off, front/back camera switch, call timer, draggable picture-in-picture, auto-hiding controls.
- ICE restart when the connection fails, and a 20-second grace period for socket reconnects. Unanswered calls are marked missed after 45 seconds.
- Ringing is dismissed on your other devices once you answer on one. Call history is recorded.

**Profile**
- Change your profile photo from **⋮ → Your profile** or Settings. Take a photo or choose one from your gallery, then drag and zoom to crop it in a circle. You can also remove it.
- Name and photo changes show up for the other person instantly.

**Sign-in alerts (email)**
- Optional email to a chosen address when a chosen account signs in, opens the app after being away, or both. The email includes the time, device and IP address.
- Sent over your own SMTP account (e.g. Gmail with an App Password). It never blocks or breaks sign-in if email fails.

**Notifications and PWA**
- Web Push (VAPID) through the service worker, so notifications arrive even when the app is closed (on iOS this requires the app to be installed to the Home Screen).
- Permission is requested only after an explanatory prompt, never on page load.
- Per-person privacy setting for what a notification reveals: nothing, sender name only (the default), or the full message.
- Installable app with a manifest, icons, maskable icon, standalone display and an offline app shell.

**User experience**
- Light, dark and auto themes, persisted on the device.
- Keyboard-safe layout pinned to the visual viewport, so the composer stays above the iOS/Android keyboard.
- Skeleton, empty, uploading, failed, reconnecting, offline and call-connecting states. No blank screens.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, React Router, Tailwind CSS v4, Zustand + Context, Axios, Socket.IO client, Lucide icons, vite-plugin-pwa (Workbox) |
| Backend | Node.js (≥ 20.11), Express 5, Socket.IO 4, Mongoose 9, JWT (HTTP-only cookie), bcryptjs, Multer, Zod, Helmet, express-rate-limit, web-push |
| Database | MongoDB (Atlas, Docker, or the bundled local runner) |
| Media | Cloudinary (`authenticated` delivery + signed URLs). A local-disk driver exists for development only. |
| Realtime/video | Socket.IO, WebRTC, STUN, optional TURN (static or time-limited credentials) |
| Tests | Vitest, Supertest, mongodb-memory-server (real `mongod`), socket.io-client |

Everything is plain JavaScript. There is no TypeScript.

---

## Architecture

```
 Browser (React PWA)                         Node.js API (Express + Socket.IO)            Storage
┌───────────────────────────┐   HTTPS/REST  ┌───────────────────────────────────┐
│ pages / components        │ ────────────▶ │ routes → middleware → controllers │──▶ MongoDB
│ Zustand stores            │  cookie auth  │   auth · validate(zod) · csrf     │    (users, conversation,
│ services/api, chatActions │               │ services (business logic)         │     messages, calls,
│ services/socket           │ ◀──────────▶  │ sockets/ (auth handshake,         │     push subscriptions)
│ services/webrtc (Peer)    │   WebSocket   │   messages, presence, calls)      │
│ services/callController   │               │ storage driver ───────────────────│──▶ Cloudinary
│ sw.js (push, app shell)   │ ◀── Web Push ─│ pushService (VAPID) ──────────────│──▶ Push service (FCM/APNs/Mozilla)
└────────────┬──────────────┘               └───────────────────────────────────┘
             │  WebRTC media (peer-to-peer; relayed via TURN when needed)
             ▼
        the other person
```

**Media upload flow:** client compresses → `POST /api/media/upload` → auth → magic-byte type check, size and duration limits → Cloudinary → MongoDB message (key + metadata only) → Socket.IO `message:new` → recipient. Clients can never attach arbitrary URLs to a message.

**Call flow:** `call:initiate` → server creates a `Call` (ringing) → `call:incoming` to the other person (plus a push if they aren't looking) → `call:accept` → caller sends `webrtc:offer` → `webrtc:answer` and `webrtc:ice-candidate` relayed **only between the two sockets bound to that call** → peer-to-peer media → `call:end`.

### REST API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Sign in (sets an HTTP-only cookie) |
| POST | `/api/auth/logout` | Sign out on this device |
| POST | `/api/auth/logout-all` | Revoke every session (token version bump) |
| GET | `/api/auth/me` | Current user |
| GET | `/api/conversation` | The conversation, you, and the other person (live presence) |
| GET | `/api/messages?before=&after=&limit=` | Cursor-paginated history |
| POST | `/api/messages` | Send a text message (REST fallback to the socket) |
| GET | `/api/messages/search?q=&type=&from=&to=&before=` | Search |
| GET | `/api/messages/media?type=&before=` | Gallery |
| PATCH | `/api/messages/:id/read` | Mark everything up to `:id` as read |
| PUT | `/api/messages/:id/reaction` | `{ emoji }` sets your reaction; `null` removes it |
| DELETE | `/api/messages/:id` | Delete your own message for both people |
| POST | `/api/media/upload` | Multipart: `file`, optional `thumbnail`, `text`, `clientId`, `replyTo`, `width`, `height`, `duration` |
| GET | `/api/media/file/:key` | Authenticated delivery (local driver only) |
| PATCH | `/api/users/me` | Name and notification-preview setting |
| POST | `/api/users/me/avatar` | Profile photo |
| GET | `/api/notifications/public-key` | VAPID public key, and whether push is enabled |
| POST / DELETE | `/api/notifications/subscribe` | Save / remove this device's push subscription |
| POST | `/api/notifications/test` | Send a test notification to yourself |
| GET | `/api/calls?before=` | Call history |
| GET | `/api/calls/ice-servers` | STUN/TURN for this user (TURN credentials never ship in the bundle) |
| GET | `/api/health` | Health check |

Call setup and teardown happen over Socket.IO because they are realtime and bound to specific sockets. REST serves call history and ICE configuration.

### Socket.IO events

| Client → server | Server → client |
| --- | --- |
| `message:send` (ack), `message:delivered`, `message:read`, `message:react`, `message:delete` | `message:new`, `message:status`, `message:updated` |
| `typing:start`, `typing:stop` | `typing:start`, `typing:stop` |
| `presence:visibility` | `user:online`, `user:offline`, `presence:state`, `user:updated` |
| `call:initiate`, `call:accept`, `call:reject`, `call:end`, `call:rejoin` (all acked) | `call:incoming`, `call:accepted`, `call:ended`, `call:peer-reconnecting`, `call:peer-rejoined` |
| `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`, `webrtc:restart` | same events, relayed to the peer's call socket |
| | `session:revoked`, `session:expired` |

The handshake is authenticated with the same cookie as the REST API. Rooms are assigned by the server; there is no client-side "join" event. Every payload is validated with Zod and rate-limited per socket.

---

## Folder structure

```
.
├── package.json            # npm workspaces + root scripts
├── .env.example            # every variable, documented
├── docker-compose.yml      # MongoDB (and an optional full stack)
├── Dockerfile              # production image (client served by the API)
├── render.yaml             # Render blueprint
├── server/
│   ├── src/
│   │   ├── config/         # env parsing (zod), MongoDB connection
│   │   ├── controllers/    # thin HTTP handlers
│   │   ├── middleware/     # auth, csrf/sanitize/rate limits, upload, validation, errors
│   │   ├── models/         # User, Conversation, Message, Call, PushSubscription
│   │   ├── routes/         # REST route table
│   │   ├── services/       # auth, messages, media, calls, push, ICE, storage drivers
│   │   ├── sockets/        # handshake auth, presence, messages, call signaling
│   │   ├── utils/          # errors, logger, ids
│   │   ├── validators/     # zod schemas (HTTP + socket)
│   │   ├── app.js          # Express app factory
│   │   └── server.js       # entry point
│   ├── scripts/            # seed, local MongoDB runner, VAPID generator
│   └── tests/              # API, authorization, media, socket and call tests
└── client/
    ├── public/             # icons, theme bootstrap
    ├── scripts/            # icon generator
    └── src/
        ├── components/     # chat/, calls/, media/, notifications/, common/
        ├── context/        # AuthContext, ThemeContext, ChatContext
        ├── hooks/          # realtime, WebRTC binding, viewport/keyboard, typing, notifications…
        ├── pages/          # Login, Chat, Media, Search, Calls, Settings
        ├── services/       # api, socket, webrtc (PeerSession), callController, chatActions, push
        ├── store/          # Zustand: chat, call, toasts
        ├── utils/          # formatting, media processing, emoji, message-list logic
        ├── sw.js           # service worker (precache shell, push, notification click)
        ├── App.jsx
        └── main.jsx
```

---

## Quick start (local)

Requirements: **Node.js 20.11+** (developed on 24) and npm 10+.

```bash
# 1. Install everything (both workspaces)
npm install

# 2. Configure
cp .env.example .env
#    then edit .env: set JWT_SECRET, the two AUTHORIZED_USER_* blocks,
#    and (optionally) Cloudinary + VAPID keys. Generate a JWT secret with:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Start MongoDB (pick one; see "MongoDB setup")
npm run db:local            # real mongod, no install needed; leave it running

# 4. Create the two people and their conversation (in another terminal)
npm run seed

# 5. Run API (port 5000) + client (port 5173)
npm run dev
```

Open **http://localhost:5173** and sign in as either person. To test realtime behavior, sign in as the second person in a private window or another browser.

**Testing from a phone on the same Wi-Fi:** Vite prints a `Network:` URL such as `http://192.168.1.4:5173`. Chat works over plain HTTP, but **camera, microphone, service workers and push need HTTPS** (except on `localhost`). Use a tunnel (for example `npx cloudflared tunnel --url http://localhost:5173` or ngrok) to get an HTTPS URL for phone testing of calls and notifications.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API with file watching + Vite dev server (proxies `/api` and `/socket.io`) |
| `npm run server` / `npm run client` | Run one side only |
| `npm run build` | Production build of the client into `client/dist` |
| `npm start` | Start the API; in production it also serves `client/dist` |
| `npm run seed` | Provision the two users and the conversation (idempotent) |
| `npm run seed -- --reset-passwords` | Re-hash both passwords from `.env` and sign out all sessions |
| `npm run db:local` | Persistent local MongoDB in `server/.data/db` |
| `npm run vapid` | Generate a Web Push key pair |
| `npm run email:test` | Send a test email using the SMTP settings (for sign-in alerts) |
| `npm test` | Server and client test suites |

---

## Environment variables

All variables live in one `.env` at the repo root (see [.env.example](.env.example)). The server reads all of them. Vite exposes only `VITE_*` variables to the browser, and none of those are secrets.

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | | Set `production` **on your host/container, not in `.env`** (Vite also reads `.env`, and a `NODE_ENV` there would ship React's dev build). Defaults to development. |
| `PORT` | | API port (default `5000`) |
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | ≥ 32 random characters |
| `JWT_EXPIRES_IN` | | Session length (default `7d`) |
| `CLIENT_URL` | | Comma-separated client origin(s) when the client is on another origin. Leave empty for a single-origin deploy. |
| `COOKIE_SAME_SITE` | | `lax` / `strict` / `none`. Auto: `none` for cross-site production, otherwise `lax`. |
| `TRUST_PROXY` | | Number of proxies in front of the app (`1` on Render, Railway or behind Nginx) |
| `SERVE_CLIENT` | | Serve `client/dist` from Express (default: on in production when the build exists) |
| `AUTHORIZED_USER_1_EMAIL`, `AUTHORIZED_USER_2_EMAIL` | ✅ | The runtime allow-list |
| `AUTHORIZED_USER_{1,2}_NAME`, `AUTHORIZED_USER_{1,2}_PASSWORD` | seed only | Display names and initial passwords (≥ 8 characters). Not needed by the running server; remove the passwords from production env after seeding. |
| `STORAGE_DRIVER` | | `cloudinary` or `local` (auto: Cloudinary if credentials are set) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | prod | Media storage |
| `CLOUDINARY_FOLDER` | | Folder prefix (default `duo`) |
| `MEDIA_MAX_IMAGE_MB`, `MEDIA_MAX_VIDEO_MB`, `MEDIA_MAX_VIDEO_SECONDS` | | Upload limits (15 MB, 100 MB, 300 s) |
| `MEDIA_MAX_VOICE_MB`, `MEDIA_MAX_VOICE_SECONDS` | | Voice-note limits (15 MB, 300 s) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | Web Push keys and a `mailto:` contact |
| `STUN_URLS` | | Comma-separated STUN URLs |
| `TURN_SERVER_URL` | | Comma-separated TURN URLs (`turn:` / `turns:`) |
| `TURN_SERVER_USERNAME`, `TURN_SERVER_CREDENTIAL` | | Static TURN credentials, **or** … |
| `TURN_SHARED_SECRET` | | … coturn `use-auth-secret`, which issues 6-hour credentials per user |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | for alerts | Outgoing mail server. Gmail: `smtp.gmail.com`, `587`, your address and an App Password. |
| `BREVO_API_KEY` | | Send email via Brevo's HTTPS API instead of SMTP (for hosts that block SMTP). `EMAIL_FROM` must be a verified Brevo sender. |
| `LOGIN_ALERT_ACCOUNTS` | | Comma-separated account emails that trigger alerts |
| `LOGIN_ALERT_TO` | | Comma-separated addresses that receive alerts |
| `LOGIN_ALERT_MODE` | | `signin` (password sign-in), `online` (opens the app after being away), or `both` |
| `LOGIN_ALERT_ONLINE_GAP_MINUTES` | | How long someone must be away before an "opened the app" alert (default 30) |
| `ALERT_TIME_ZONE` | | Time zone for times in alert emails, e.g. `Asia/Kolkata` |
| `VITE_API_URL` | | Build-time API origin, only for split deployments |
| `VITE_APP_NAME` | | App name shown in the UI and manifest (default `Duo`) |

---

## MongoDB setup

Pick one:

- **Already have MongoDB installed** (e.g. the Windows service on `127.0.0.1:27017`)? Just use `MONGODB_URI=mongodb://127.0.0.1:27017/duo`. `npm run db:local` detects this and exits instead of starting a second instance.
- **Bundled local runner (no install):** `npm run db:local`. Downloads the official `mongod` once (it's large, around 800 MB on Windows) and keeps data in `server/.data/db`. Use `MONGODB_URI=mongodb://127.0.0.1:27017/duo`.
- **Docker:** `docker compose up -d mongo`, with the same URI.
- **MongoDB Atlas (production):**
  1. Create a cluster, then a database user with read/write access on one database.
  2. Under *Network Access*, allow your host's egress IPs (or `0.0.0.0/0` together with a strong password).
  3. Set `MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/duo?retryWrites=true&w=majority`.

Indexes are declared on the models and built automatically.

---

## Seeding the two users

```bash
npm run seed
```

The seed script:
1. connects to MongoDB;
2. **refuses to run** if any user other than the two configured emails exists;
3. creates missing users with bcrypt-hashed passwords (cost 12), or updates display names of existing ones;
4. creates the single conversation. A unique index makes a second one impossible, and the script refuses to change an existing conversation's participants.

It is safe to run repeatedly. To change passwords, edit `.env` and run `npm run seed -- --reset-passwords`. This also signs both people out everywhere.

---

## Cloudinary setup

1. Create a Cloudinary account. From the dashboard copy the **Cloud name**, **API key** and **API secret** into `.env`.
2. That's all the configuration needed. Assets are uploaded as **`type: authenticated`**, so their original URLs are not publicly reachable. The API returns **signed** delivery URLs only to the two authenticated people.
3. Photos are delivered resized with `q_auto,f_auto`. iPhone `.mov` videos get an MP4 rendition so they play on Android and desktop.
4. Optional: in *Settings → Security*, restrict "Allowed fetch domains" and enable "Strict transformations".

Without Cloudinary credentials the server uses the **local driver**. Files go to `server/uploads` and are streamed through the authenticated `/api/media/file/:key` route. This is for development only; the server logs a warning if it is used in production.

---

## Web Push setup

1. Generate keys and paste them into `.env`:
   ```bash
   npm run vapid
   ```
   Set `VAPID_SUBJECT=mailto:you@yourdomain.com`.
2. Restart the server. It logs `push: on`.
3. In the app, the **Turn on** prompt appears after your first message (or after 20 seconds in the chat). You can also go to **Settings → Notifications**. Use **Send a test notification** to verify.

Notes:
- The server pushes only when none of the recipient's open tabs is visible, and it prunes expired subscriptions automatically.
- Payloads are encrypted end-to-end to the browser by the Web Push protocol. What a notification shows is controlled per person in **Settings → Show in notifications**. The default is the sender's name only, never the message text.
- **iPhone/iPad:** Web Push works only after **Share → Add to Home Screen** (iOS 16.4+), when the app is opened from the Home Screen icon.
- Signing out unsubscribes that device.
- **Private / incognito windows can't receive notifications.** Browsers block notification permission and push there, and no website can override that. The app detects it and explains, and while the tab is open in the background it still plays a soft chime and shows an unread count in the tab title. To test two people on one computer, use two different browsers (e.g. Chrome and Edge) instead of an incognito window.

---

## Sign-in alert emails

1. Use a Gmail account to send from. Turn on **2-Step Verification**, then create an **App Password** (Google Account → Security → 2-Step Verification → App passwords).
2. In `.env` set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<that Gmail address>`, `SMTP_PASS=<the 16-character app password>`.
3. Set `LOGIN_ALERT_ACCOUNTS` (whose activity triggers alerts), `LOGIN_ALERT_TO` (who receives them), `LOGIN_ALERT_MODE` and `ALERT_TIME_ZONE`.
4. Run `npm run email:test` to send a test email, then restart the server.

## WebRTC / TURN setup

STUN alone connects most home Wi-Fi networks. Cellular networks and corporate or carrier-grade NATs often need a **TURN relay**. Configure one for reliable calls in production:

- **Managed:** Cloudflare Calls TURN, Twilio Network Traversal, Metered, Xirsys, etc. Put the URLs and credentials in `TURN_SERVER_URL`, `TURN_SERVER_USERNAME` and `TURN_SERVER_CREDENTIAL`.
- **Self-hosted coturn:** run it with `use-auth-secret` and `static-auth-secret=<secret>`, then set
  ```env
  TURN_SERVER_URL=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp
  TURN_SHARED_SECRET=<secret>
  ```
  The API then issues HMAC credentials per person, valid for 6 hours.

ICE servers are fetched from `GET /api/calls/ice-servers` at call time, so TURN credentials never appear in the frontend bundle.

---

## Testing

```bash
npm test                     # everything
npm test -w server           # 62 tests: auth, authorization, messages, media, sockets, calls, push, ICE
npm test -w client           # message-list, formatting and emoji logic
```

Server tests run against a **real `mongod`** (mongodb-memory-server), a real HTTP server, real Socket.IO and the real upload pipeline. Coverage includes login, invalid credentials, expired and forged tokens, CSRF, lockout, a **third user** blocked on REST and sockets, seed refusal, the single-conversation constraint, send/receive/delivered/read, idempotency, pagination, injection attempts, disguised files and size limits, typing and presence, and the full call lifecycle (accept, reject, busy, missed, signaling relay isolation, reconnect grace).

### Manual checks

**Realtime chat:** open the app in two browsers (or a normal window and a private window), sign in as each person, and check that:
- typing in one shows "typing…" in the other;
- a sent message appears instantly, the sender's tick goes ✓ → ✓✓ → highlighted ✓✓ when the other window is open;
- after turning Wi-Fi off and on, the banner shows "Reconnecting…" and queued messages send.

**Video calling:** use two devices or two browsers on HTTPS (or `localhost`). Tap the camera icon, accept on the other side, and test mute, camera off, flip camera (phones) and hang up. Decline a call, and let one ring out to see "Missed call" in history.

**Push:** enable notifications on device A, close or background the app, then send a message from device B.

---

## Production deployment

### Free hosting: Oracle Cloud Always Free (₹0/month)

Everything runs on one always-on Oracle VM: the app, MongoDB, Caddy (automatic HTTPS) and coturn (TURN for calls). Files: [deploy/](deploy/).

1. **Create the VM:** Oracle Cloud → Compute → Instances → Create. Pick an Always Free shape (Ampere A1, e.g. 2 OCPU / 12 GB, or VM.Standard.E2.1.Micro) with Ubuntu 24.04, and add your SSH key.
2. **Open ports** in the VM's VCN → Security List → Add Ingress Rules (source `0.0.0.0/0`): TCP 80, 443, 3478 and UDP 443, 3478, 49160-49200.
3. **Free domain:** at duckdns.org, create e.g. `duo-yourname` and point it at the VM's public IP.
4. **On the server:**
   ```bash
   git clone <your repo URL> duo && cd duo
   chmod +x deploy/*.sh
   sudo bash deploy/setup-server.sh      # Docker, firewall, swap, daily backups
   exit                                  # log in again so Docker works without sudo
   cd duo && cp deploy/env.production.example .env && nano .env
   ./deploy/duo.sh up                    # build + start; HTTPS is automatic
   ./deploy/duo.sh seed                  # create the two accounts
   ```
5. Open `https://<your-name>.duckdns.org`.

Day to day: `./deploy/duo.sh update | logs | status | backup | restore <file>`. Backups run nightly into `~/duo-backups`; copy them off the server now and then.

**Keep the VM from being reclaimed:** Oracle can reclaim *idle* Always Free instances, and a two-person chat is mostly idle. Upgrading the account to **Pay As You Go** stops that, and you are still not charged while you stay within Always Free limits. Set a small budget alert in Billing to be safe.

### Recommended: one origin (Render, Railway, Fly, a VPS)

Serve the built client from the API. Cookies stay first-party, which **iOS Safari requires**, because it blocks cross-site cookies. WebSockets also share the host.

**Render (blueprint included):**
1. Push the repo to GitHub, then in Render choose *New → Blueprint* and select the repo (`render.yaml`).
2. Fill in the `sync: false` variables: `MONGODB_URI`, the two emails, Cloudinary, VAPID and TURN.
3. After the first deploy, open the service's **Shell** and seed. Passwords are passed only for this command and are not stored:
   ```bash
   AUTHORIZED_USER_1_NAME="Alex" AUTHORIZED_USER_1_PASSWORD='…' \
   AUTHORIZED_USER_2_NAME="Sam"  AUTHORIZED_USER_2_PASSWORD='…' npm run seed
   ```
4. Use a paid instance. Free instances sleep, which drops sockets, presence and calls.

**Docker / VPS:**
```bash
docker build -t duo .
docker run -d --name duo -p 5000:5000 --env-file .env -e NODE_ENV=production -e TRUST_PROXY=1 duo
docker exec -it duo node server/scripts/seed.js
```
Put Nginx or Caddy in front for HTTPS, and forward WebSocket upgrades:
```nginx
location / {
  proxy_pass http://127.0.0.1:5000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 120s;
  client_max_body_size 110m;
}
```

### Split deployment (for example, client on Vercel and API on Render)

Supported, with caveats:
- Build the client with `VITE_API_URL=https://api.example.com`. Add a `vercel.json` SPA rewrite (`{"rewrites":[{"source":"/(.*)","destination":"/"}]}`).
- On the API, set `CLIENT_URL=https://your-app.vercel.app` (CORS + origin checks). The cookie automatically becomes `SameSite=None; Secure`.
- **Safari/iOS blocks third-party cookies**, so sessions will not stick unless both live under the same site. Use `app.example.com` + `api.example.com`, or proxy `/api` and `/socket.io` through the client's host.

### Production checklist

- [ ] HTTPS everywhere (required for camera, microphone, service worker and push)
- [ ] `NODE_ENV=production`, `TRUST_PROXY` set, strong `JWT_SECRET`
- [ ] Cloudinary configured (the local driver logs a warning in production)
- [ ] VAPID keys set, `VAPID_SUBJECT` is a real contact
- [ ] TURN configured for calls on cellular networks
- [ ] Seed run once; seed passwords removed from the environment
- [ ] Atlas network access restricted, backups enabled

---

## Security model

- **Sign-in lasts only while the app is open.** Closing the tab, the installed app or the browser means signing in again; refreshing does not. A per-window session marker plus a browser-session cookie handle this; `JWT_EXPIRES_IN` is the upper bound.
- **Authentication:** bcrypt (cost 12). JWT (HS256, issuer and audience pinned) in an **HTTP-only** cookie (`Secure` in production, `SameSite` Lax or None). Timing-safe responses for unknown emails. Lockout after 5 failures for 15 minutes. Login rate limit. Token versioning powers "sign out everywhere".
- **Authorization (server-side only):** every request and socket resolves a session that must be valid, unrevoked, on the email allow-list, and a participant of the single conversation. Sender, receiver and conversation are always taken from the session, never from input, and message lookups are scoped to the conversation (no IDOR).
- **CSRF:** state-changing requests require `X-Requested-With: XMLHttpRequest` (which forces a CORS preflight) and an allowed `Origin`.
- **Injection and XSS:** Zod parses every input into primitives, `$`-prefixed and dotted keys are stripped, search terms are regex-escaped, React escapes output (no `dangerouslySetInnerHTML`), links are restricted to `http(s)` with `rel="noopener noreferrer"`, and there is a strict CSP with no inline scripts.
- **Uploads:** type detection from magic bytes against an allow-list, size and duration limits, files streamed to a temp directory (never buffered in memory or stored in MongoDB), random storage keys, and authenticated or signed delivery.
- **Transport and headers:** Helmet (CSP, HSTS, `no-referrer`, frame-ancestors none, CORP/COOP), compression, a JSON body limit of 32 KB.
- **Sockets:** cookie-authenticated handshake with origin check, server-assigned rooms, per-socket token-bucket rate limit, payload validation, and signaling relayed only between the two sockets bound to a call.
- **Privacy:** logs record method, path, status and latency only. They never include bodies, query strings, message text or tokens. The service worker never caches messages or media. Notification content is opt-in.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot start server: JWT_SECRET must be at least 32 characters` | Generate one with the command in Quick start |
| `Seed failed: Found N user(s) not listed…` | The database holds users that aren't in `.env`. Point to a fresh database or remove them. |
| Login works but you are bounced back to login (deployed) | Cross-site cookie blocked. Deploy single-origin, or put the API on a subdomain of the client's site. |
| "Reconnecting…" forever in production | Your proxy isn't forwarding WebSocket upgrades (see the Nginx snippet), or the instance is sleeping |
| Calls ring but video never connects | Usually NAT: configure TURN. Also confirm both sides use HTTPS. |
| "Camera and microphone access is blocked" | Allow camera and mic for the site in browser settings (iOS: Settings → Safari → Camera/Microphone) |
| No push notifications on iPhone | Install to the Home Screen first and open from the icon. iOS 16.4+ required. |
| Push works on desktop but not Android | Check that the site isn't battery-restricted, and Chrome notifications are allowed for the site |
| `npm run db:local` is slow the first time | It downloads `mongod` once (~800 MB on Windows). Later starts are instant. |
| Uploads fail with 413 | Raise `MEDIA_MAX_*_MB` and your proxy's `client_max_body_size` |
| `.mov` videos don't play on Android (local driver) | Use Cloudinary, which transcodes to MP4 |
| Voice notes recorded in Chrome won't play on an older iPhone (local driver) | Use Cloudinary, which delivers MP3 |
| No notifications in an incognito/private window | Expected: browsers disable them there. Use a normal window or install the app. |

---

## Known limitations

- **Single API instance.** Presence uses Socket.IO room queries (adapter-ready), but call coordination (ring timers, call-to-socket bindings) is in process memory. To scale horizontally, add the Socket.IO Redis adapter and move `callService`'s maps to Redis.
- **Not end-to-end encrypted.** Messages are protected in transit (TLS) and by strict access control, but they are stored readable in MongoDB. Calls are peer-to-peer and DTLS-SRTP encrypted.
- **Cloudinary signed URLs don't expire** without Cloudinary's token-auth add-on. They are unguessable and only ever returned to the two signed-in people.
- **Local media driver trusts client-reported video duration.** Cloudinary reports the real duration and the server enforces it. The local driver is for development.
- **Push on iOS** requires the installed PWA. In-tab notifications work while the app is open in the background.
- **Camera switching** depends on the device exposing multiple cameras, and is hidden otherwise.
- No message editing, voice notes or read-receipt opt-out yet. The schema and event design leave room for them.
