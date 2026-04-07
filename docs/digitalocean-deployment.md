# Deploy Dream12 on a DigitalOcean Droplet

This guide walks through running the production Docker stack on an Ubuntu droplet: **Next.js** (`web`), **cron** (same schedules as `vercel.json`), **nginx** (reverse proxy + TLS), and **certbot** (Let’s Encrypt issuance + renewals).

**Compose file:** `[docker-compose.production.yml](../docker-compose.production.yml)` (repo root).

**Related:** Local Docker + ngrok is documented in `[docker/README.md](../docker/README.md)`.

---

## What you get


| Piece             | Role                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **web**           | Next.js production image (`output: "standalone"`). Listens on **3000** inside the Docker network only — **not** published to the host.               |
| **nginx**         | Listens on **80** and **443** on the droplet; terminates TLS; proxies to `http://web:3000`.                                                          |
| **cron**          | Hits `/api/cron/*` on `web` with `Authorization: Bearer $CRON_SECRET` per `[vercel.json](../vercel.json)`. Starts only after **web** is **healthy**. |
| **certbot**       | Long-running loop: `certbot renew` every 12h (shared volumes with nginx).                                                                            |
| **certbot-issue** | One-off profiled service for the **first** certificate (not started by `docker compose up`).                                                         |


Volumes `**certbot-etc`** and `**certbot-www**` hold certificates and ACME webroot data.

---

## Prerequisites

- **DigitalOcean** droplet (Ubuntu **22.04** or **24.04** LTS recommended).
- **RAM:** at least **2 GB**; **4 GB** is safer for `docker compose build` (Next.js can OOM on small boxes).
- **DNS** control for your domain (apex + `www` if you use both).
- **Supabase** project and keys; optional **SportMonks** keys if you rely on cron sync jobs.

---

## 1. Create and secure the droplet

1. Create a droplet in a region close to your users (e.g. **BLR1** for India).
2. Choose **SSH key** authentication.
3. Note the droplet’s **public IPv4** address.

### Firewall (DigitalOcean)

In **Networking → Firewalls** (or the droplet’s firewall):

- **Inbound:** **SSH (22)**, **HTTP (80)**, **HTTPS (443)** to this droplet.
- Do **not** expose **3000** publicly; the app stays behind nginx.

### Optional: UFW on the VM

If you use **ufw**:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## 2. Install Docker and Compose v2

### Docker Engine

Ubuntu images often ship **Docker** (`docker.io`). Verify:

```bash
docker version
```

You should see **Client** and **Server**. If the daemon is stopped:

```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### Docker Compose v2 (`docker compose` with a space)

Check:

```bash
docker compose version
```

If you see `**docker: unknown command: docker compose**`:

**Ubuntu `docker.io` (typical on DigitalOcean):** install the **v2** package from Universe:

```bash
sudo apt-get update
sudo apt-get install -y docker-compose-v2
docker compose version
```

If the package is missing, enable **universe**:

```bash
sudo apt-get install -y software-properties-common
sudo add-apt-repository universe
sudo apt-get update
sudo apt-get install -y docker-compose-v2
```

**Docker installed from Docker’s own apt repo:** use:

```bash
sudo apt-get install -y docker-compose-plugin
docker compose version
```

### Old `docker-compose` (hyphen) v1

You may still have `**docker-compose` 1.29.x**. Prefer `**docker compose` (v2)** for this project — v1 can hit `**KeyError: 'ContainerConfig'`** on newer Docker when recreating containers.

If only v1 is available, use `**docker-compose**` everywhere this guide uses `**docker compose**`.

### Manual Compose plugin (fallback)

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
```

On **ARM** droplets, use `**docker-compose-linux-aarch64`**.

---

## 3. DNS

For every hostname in `**DOMAINS**` (see below), create an **A** record pointing to the droplet’s public IP.

Example:


| Hostname                     | Type | Value            |
| ---------------------------- | ---- | ---------------- |
| `dream12.botnetworks.in`     | A    | `<droplet IPv4>` |
| `www.dream12.botnetworks.in` | A    | `<droplet IPv4>` |


Wait until DNS resolves before running Let’s Encrypt (propagation can take minutes).

---

## 4. Clone the app and configure `.env`

```bash
cd ~
git clone <your-repo-url> dream12
cd dream12
cp .env.docker.example .env
nano .env   # or vim
```

### Required for production TLS + nginx

```env
DOMAINS=dream12.botnetworks.in,www.dream12.botnetworks.in
CERTBOT_EMAIL=you@example.com
```

Rules:

- **Comma-separated**, **no `https://`**.
- **Apex first** — the first name is the Let’s Encrypt “lineage” directory: `/etc/letsencrypt/live/<first-name>/`.
- `**CERTBOT_EMAIL`** is used for the **first** `certbot certonly` (account registration).

### Required for the app (see `[.env.docker.example](../.env.docker.example)`)

- `**CRON_SECRET`** — long random string; must match what cron sends.
- `**NEXT_PUBLIC_SUPABASE_URL**`, `**NEXT_PUBLIC_SUPABASE_ANON_KEY**` — required at `**docker compose build**` time (baked into the browser bundle).
- `**SUPABASE_SERVICE_ROLE_KEY**` — server only; keep secret.
- Optional: **SportMonks**, UPI, `**TZ**`, etc.
- **`MAINTENANCE_MODE`** — when set to `true`, `1`, or `yes`, the Next.js middleware sends normal page requests to **`/maintenance`** (API routes under `/api/*` are **not** affected, so Docker/Vercel cron jobs keep working). Restart the **`web`** container (or redeploy) after changing this. Optional **`MAINTENANCE_BYPASS_SECRET`**: if set, requests with cookie `maintenance_bypass` equal to that secret skip the gate (use HTTPS only; rotate after use).

**All production services load the same `.env**` via `env_file: .env` in `[docker-compose.production.yml](../docker-compose.production.yml)`.

### Profile photos (DigitalOcean Spaces)

User profile pictures upload via **presigned `PUT**` to **Spaces**; the app stores the resulting **HTTPS public URL** in Supabase (`profiles.avatar_url`). Without these variables, uploads are disabled but the rest of the app still runs (fallback avatars use generated placeholders).

**Upload behavior (app):** The browser may pick **JPEG, PNG, or WebP** up to **10 MB**; the client **re-encodes to JPEG** and shrinks the image until the file is **≤ 2 MB** before `PUT`. Each upload is stored under a **new object key** (`avatars/{userId}/{timestamp}-{shortId}.jpg`) so the URL in the database always changes when the user replaces a photo—**no manual CDN purge**. Objects are written with **`Cache-Control: public, max-age=31536000, immutable`** so browsers (and any CDN in front of Spaces) can cache each URL aggressively; old URLs are simply unused after a new upload.

**CORS:** If your Spaces CORS rule lists specific **Allowed headers** (instead of `*`), include **`Cache-Control`** alongside **`Content-Type`** so the browser may send both on the presigned `PUT`.

1. **Create a Space** in the same region you prefer (e.g. **BLR1**).
2. **Public read so images load:** By default, new objects are **private**—the presigned **PUT** can succeed while **GET** (browser / `next/image`) returns **403**, so the UI falls back to initials. The app sets the `**public-read**` ACL on each avatar upload when the Space allows ACLs. **Already-uploaded** files stay private until you fix permissions or re-upload. Quick check: open the stored image URL in a **private/incognito** window—if you see **AccessDenied**, use a bucket policy (next item) or per-object public read.
3. **Public read bucket policy — `avatars/` only (recommended):** Dream12 stores profile images under the `**avatars/**` prefix. To allow anonymous `**GetObject**` **only** for that folder (everything else in the Space stays non-public by default), use a policy whose `Resource` ends with `**/avatars/***`.
  Copy `[docs/examples/spaces-avatars-public-read-policy.json](examples/spaces-avatars-public-read-policy.json)`, replace `**YOUR_SPACE_NAME**` with your bucket name (e.g. `optimus`), save as e.g. `avatars-public-policy.json`, then apply with **s3cmd** (configure it for Spaces per DigitalOcean’s [bucket policies + s3cmd](https://docs.digitalocean.com/products/spaces/how-to/configure-bucket-policies/#configure-bucket-policies-using-s3cmd)):
   Equivalent JSON:
   Background: DigitalOcean’s [public read policy example](https://docs.digitalocean.com/products/spaces/how-to/configure-bucket-policies/#set-a-public-read-policy) uses `/*` on the whole Space; narrowing to `**avatars/***` matches how this app uploads (`avatars/{userId}/…`) and avoids exposing other keys.
   **If you truly need every object in the Space publicly readable**, use `Resource` `arn:aws:s3:::your-space-name/*` instead (same DO doc).
   Note: **Spaces Cold Storage** buckets do not support bucket policies (see [Spaces limits](https://docs.digitalocean.com/products/spaces/details/limits/)); use a standard Space for public avatars.
4. **CORS (required):** the browser `**PUT`**s directly to Spaces using the presigned URL. If CORS is missing or the **origin does not match exactly** (scheme + host + port), the upload fails in DevTools with a CORS error.
  In the [DigitalOcean control panel](https://cloud.digitalocean.com/spaces): open your **Space** → **Settings** → **CORS Configurations** → add a rule (or use the Spaces API). Include **every origin** you use:

  | Environment           | Example `AllowedOrigins` entry                                |
  | --------------------- | ------------------------------------------------------------- |
  | Local Next.js         | `http://localhost:3000`                                       |
  | Local (alternate)     | `http://127.0.0.1:3000`                                       |
  | Docker mapped to 3000 | Same as above (browser origin, not `host.docker.internal`)    |
  | Production            | `https://your-domain.com` (no trailing slash)                 |
  | ngrok / tunnel        | Exact tunnel URL origin, e.g. `https://abc123.ngrok-free.dev` |

   Example JSON (adjust origins; duplicate rules or list multiple origins in one rule as allowed by DO):
   After saving, wait a minute and hard-refresh the app. If it still fails, confirm the failing request’s `**Origin`** header in DevTools → Network matches one of the listed origins exactly.
5. **Environment variables** (add to `.env` next to Compose):


| Variable                 | Purpose                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `**DO_SPACES_KEY`**      | Spaces access key (S3 access key id).                                                |
| `**DO_SPACES_SECRET**`   | Spaces secret.                                                                       |
| `**DO_SPACES_ENDPOINT**` | S3 API endpoint, e.g. `https://blr1.digitaloceanspaces.com` (no bucket in the path). |
| `**DO_SPACES_BUCKET**`   | Bucket name.                                                                         |


Optional `**DO_SPACES_PUBLIC_ORIGIN**`: if you front the bucket with a **CDN or custom domain**, set this to that HTTPS origin (no trailing slash). Otherwise the app builds the public URL as `https://{bucket}.{endpoint-host}/{key}` (DigitalOcean virtual-hosted style). Stored `avatar_url` values must match that origin (or the override); arbitrary URLs are rejected on save.

### Supabase dashboard

Under **Authentication → URL configuration**, add **both** site URLs you use, for example:

- `https://dream12.botnetworks.in`
- `https://www.dream12.botnetworks.in`

Include redirect / callback URLs your auth flow uses (e.g. `/auth/callback`).

---

## 5. Start the stack

From the **repo root** (where `docker-compose.production.yml` lives):

```bash
docker compose -f docker-compose.production.yml up -d --build
```

Check status:

```bash
docker compose -f docker-compose.production.yml ps
```

- **web** should become **healthy** (healthcheck hits port 3000 inside the container).
- **nginx** should be **Up** (it starts after **web** **starts**, not only after healthy — so port **80** can open while Next.js is still warming up).
- **cron** waits for **web** **healthy** before running jobs.

View logs:

```bash
docker compose -f docker-compose.production.yml logs -f web
docker compose -f docker-compose.production.yml logs -f nginx
```

---

## 6. Verify HTTP (before TLS)

Let’s Encrypt must reach `**http://<your-domain>/.well-known/acme-challenge/**` on port **80**.

On the droplet:

```bash
curl -sS -I http://127.0.0.1/
docker compose -f docker-compose.production.yml port nginx 80
sudo ss -tlnp | grep ':80 '
```

You want:

- A response from **nginx** (e.g. **200**, **404**, or later **301** to HTTPS) — not *Connection refused*.
- Host port mapping like `**0.0.0.0:80`**.

If **nothing** listens on **80**:

- `**docker compose … ps -a`** — is **nginx** *Exited*? `**docker compose … logs nginx`**.
- **DO firewall** — confirm **TCP 80** (and **443**) allowed.
- Confirm `[docker-compose.production.yml](../docker-compose.production.yml)` `**nginx`** has `**ports: "80:80"` and `"443:443"**` (required for public HTTP/S).

---

## 7. Issue the first TLS certificate

```bash
docker compose -f docker-compose.production.yml run --rm certbot-issue
```

**Do not** run `docker compose run certbot sh /certonly.sh` — the long-running **certbot** service uses `**entrypoint: /bin/sh`**, which turns that into `/bin/sh sh /certonly.sh` and fails with `**can't open 'sh'**`. Use `**certbot-issue**` or the manual override documented in `[docker/README.md](../docker/README.md)`.

On success, cert paths look like:

- `/etc/letsencrypt/live/<first-host-in-DOMAINS>/fullchain.pem`
- `privkey.pem`

---

## 8. Switch nginx to HTTPS

Nginx chooses **HTTP-only** vs **HTTPS** config **at container start** (see `[docker/nginx/entrypoint.sh](../docker/nginx/entrypoint.sh)`). After certs exist, **recreate** the **nginx** container (not only `nginx -s reload` for the *first* switch).

**With Docker Compose v2:**

```bash
docker compose -f docker-compose.production.yml up -d --no-deps --force-recreate nginx
```

**If you must use `docker-compose` v1** and hit `**ContainerConfig`** errors when recreating **web**, recreate **only nginx**:

```bash
docker-compose -f docker-compose.production.yml stop nginx
docker-compose -f docker-compose.production.yml rm -f nginx
docker-compose -f docker-compose.production.yml up -d --no-deps nginx
```

After changing **nginx templates** (files under `docker/nginx/`), **rebuild** the image:

```bash
docker compose -f docker-compose.production.yml build nginx
docker compose -f docker-compose.production.yml up -d --no-deps --force-recreate nginx
```

---

## 9. Verify HTTPS

```bash
curl -sS -I http://127.0.0.1/
curl -sS -I https://127.0.0.1/ -k
curl -sS -I https://dream12.botnetworks.in/
curl -sS -I https://www.dream12.botnetworks.in/
```

Expect **HTTP → 301** to **https://$host/...** and **HTTPS → 200** (or your app’s redirects) with `**Server: nginx`** and Next.js headers where applicable.

---

## 10. Certificate renewal

The **certbot** service runs `**certbot renew`** periodically. After a successful renewal, nginx should reload so it picks up renewed files:

```bash
docker compose -f docker-compose.production.yml exec nginx nginx -s reload
```

Optional: host **cron** once daily with that command.

---

## 11. Deploy updates

```bash
cd ~/dream12
git pull
docker compose -f docker-compose.production.yml up -d --build
```

If you change `**NEXT_PUBLIC_***` variables, the **web** image must be rebuilt (the command above does that).

---

## 12. Stop and clean up

Normal stop:

```bash
docker compose -f docker-compose.production.yml down
```

If Compose warns about **orphan** containers (renamed services, old runs):

```bash
docker compose -f docker-compose.production.yml down --remove-orphans
```

---

## Troubleshooting


| Symptom                                                       | Things to check                                                                                                                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connection refused** on **:80** from Let’s Encrypt          | **nginx** not running; **firewall**; `**ports`** on **nginx**; `**docker compose ps -a`** and `**logs nginx**`.                                                                        |
| `**docker port <nginx>**` empty                               | Host ports not published — confirm `**ports**` under **nginx** in compose file, recreate container.                                                                                    |
| `**KeyError: 'ContainerConfig'`** (old **docker-compose** v1) | Use `**docker compose` v2** or `**stop`/`rm`/`up --no-deps nginx`** only.                                                                                                              |
| **Both :80 and :443 refuse** after HTTPS switch               | **nginx** crashed — `**logs nginx`**. Templates use **IPv4-only** `listen` (no `[::]:…`) to avoid IPv6 bind failures on some droplets; **rebuild** `**nginx`** image after `git pull`. |
| `**unknown command: docker compose**`                         | Install `**docker-compose-v2**` (Ubuntu `**docker.io**`) or `**docker-compose-plugin**` (Docker CE repo). See [§2](#2-install-docker-and-compose-v2).                                  |
| OAuth / redirect issues                                       | **Supabase** URL allow list must include exact **https** origins (apex and **www** if both are used).                                                                                  |


---

## File reference


| Path                                                                                | Purpose                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `[docker-compose.production.yml](../docker-compose.production.yml)`                 | Production services, volumes, ports.                        |
| `[docker/nginx/](../docker/nginx/)`                                                 | Custom nginx image, templates, entrypoint (HTTP vs HTTPS).  |
| `[docker/production/certbot-certonly.sh](../docker/production/certbot-certonly.sh)` | First-cert script (multiple `**-d`** from `**DOMAINS**`).   |
| `[.env.docker.example](../.env.docker.example)`                                     | Env template including `**DOMAINS**` / `**CERTBOT_EMAIL**`. |


---

## Command cheat sheet

All commands assume `**cd ~/dream12**` (or your clone path).

```bash
# Start / rebuild
docker compose -f docker-compose.production.yml up -d --build

# Status / logs
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs -f web

# First certificate
docker compose -f docker-compose.production.yml run --rm certbot-issue

# Recreate nginx after certs (v2)
docker compose -f docker-compose.production.yml up -d --no-deps --force-recreate nginx

# Reload nginx after renew
docker compose -f docker-compose.production.yml exec nginx nginx -s reload

# Stop
docker compose -f docker-compose.production.yml down --remove-orphans
```

Replace `**docker compose**` with `**docker-compose**` if you only have the v1 binary (not recommended long term).