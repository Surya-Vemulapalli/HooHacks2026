# HooHacks 2026 — Plant Health Monitor

Real-time plant health monitoring system using a Raspberry Pi, Flask backend, Snowflake database, and Gemini AI.

## Architecture

```
Raspberry Pi  →  Flask backend  →  Snowflake DB
                      ↕
                  Gemini API
                      ↕
                  Frontend (HTML/JS/Chart.js)
```

## Project Structure

```
HooHacks2026/
├── backend/
│   ├── app.py                        # Flask app factory
│   ├── config.py                     # Env-var based config
│   ├── requirements.txt
│   ├── .env.example                  # Copy to .env and fill in
│   ├── routes/
│   │   ├── sensor.py                 # POST /api/sensor/reading
│   │   ├── analytics.py              # GET  /api/analytics/readings/:plant_id
│   │   └── recommendations.py        # GET  /api/recommendations/:plant_id
│   └── services/
│       ├── snowflake_service.py      # Snowflake queries
│       └── gemini_service.py         # Gemini AI analysis
├── frontend/
│   ├── index.html                    # Dashboard
│   ├── css/style.css
│   └── js/app.js                     # Chart.js + API calls
└── raspberry_pi/
    └── sensor_client.py              # Pi polling loop
```

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env          # Fill in Snowflake + Gemini credentials
pip install -r requirements.txt
flask --app app init-db       # Create Snowflake tables
python app.py                 # Runs on http://0.0.0.0:5000
```

### 2. Frontend

Open `frontend/index.html` in a browser (or serve with any static file server).

```bash
# Quick static server
python -m http.server 8080 --directory frontend
```

Then visit `http://localhost:8080`.

### 3. Raspberry Pi

```bash
cd raspberry_pi
pip install requests adafruit-circuitpython-dht adafruit-circuitpython-tsl2591

# Set env vars or edit the constants at the top of sensor_client.py
export BACKEND_URL=http://<your-server-ip>:5000
export PLANT_ID=plant-01
export DEVICE_ID=rpi-kitchen-01
export POLL_INTERVAL=60

python sensor_client.py
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sensor/reading` | Raspberry Pi ingests a sensor reading |
| `GET`  | `/api/sensor/plants` | List all registered plants |
| `GET`  | `/api/analytics/readings/:plant_id` | Time-series readings (query: `?limit=100`) |
| `GET`  | `/api/analytics/summary/:plant_id` | 24-h aggregate stats (query: `?hours=24`) |
| `GET`  | `/api/recommendations/:plant_id` | Gemini AI analysis & recommendations |
| `GET`  | `/api/health` | Backend health check |

### POST /api/sensor/reading — body

```json
{
  "plant_id":        "plant-01",
  "device_id":       "rpi-kitchen-01",
  "temperature":     23.4,
  "light_level":     4500,
  "deformity_score": 0.12,
  "deformity_type":  "leaf_curl",
  "image_url":       "https://..."
}
```

`deformity_score` must be between 0 (healthy) and 1 (severe).
`deformity_type` and `image_url` are optional.

## Snowflake Table

```sql
CREATE TABLE plant_readings (
    id              INTEGER AUTOINCREMENT PRIMARY KEY,
    plant_id        VARCHAR(64)   NOT NULL,
    device_id       VARCHAR(64)   NOT NULL,
    recorded_at     TIMESTAMP_NTZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    temperature     FLOAT,
    light_level     FLOAT,
    deformity_score FLOAT,
    deformity_type  VARCHAR(128),
    image_url       VARCHAR(1024)
);
```

Run `flask --app app init-db` to create this automatically.

## Deployment

The stack runs as two Docker containers managed by Docker Compose:
- **web** — Flask/Gunicorn on port 8000 (internal)
- **nginx** — serves the static frontend and reverse-proxies `/api/` to the backend, exposed on port 8080

### Prerequisites

- Docker & Docker Compose v2
- A domain pointed at your server (the nginx config expects `hoosleaf.fit`)
- Auth0 application, Snowflake account, and Gemini API key

### 1. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in all values:

```ini
# Flask
SECRET_KEY=<long-random-string>
FLASK_DEBUG=false

# Snowflake
SNOWFLAKE_ACCOUNT=<account-identifier>   # e.g. abc12345.us-east-1
SNOWFLAKE_USER=<username>
SNOWFLAKE_PASSWORD=<password>
SNOWFLAKE_DATABASE=PLANT_MONITOR_DB
SNOWFLAKE_SCHEMA=PUBLIC
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_ROLE=SYSADMIN

# Google Gemini
GEMINI_API_KEY=<your-gemini-api-key>

# Auth0
AUTH0_DOMAIN=<your-tenant>.auth0.com
AUTH0_CLIENT_ID=<client-id>
AUTH0_CLIENT_SECRET=<client-secret>
AUTH0_SECRET=<random-256-bit-hex>
AUTH0_REDIRECT_URI=https://<your-domain>/callback
AUTH0_AUDIENCE=https://<your-domain>/api
```

### 2. Initialise the database

```bash
cd backend
pip install -r requirements.txt
flask --app app init-db
```

### 3. Build and start the containers

```bash
# From the repo root
docker compose up --build -d
```

- Frontend: `http://localhost:8080`
- API: `http://localhost:8080/api/`

### 4. Domain & HTTPS (production)

The bundled [nginx.conf](backend/nginx.conf) listens on port 80 for `hoosleaf.fit`. To add HTTPS with Let's Encrypt:

```bash
# Install certbot on the host
sudo apt install certbot python3-certbot-nginx

# Obtain a certificate (nginx must be reachable on port 80)
sudo certbot --nginx -d hoosleaf.fit -d www.hoosleaf.fit
```

Certbot will patch nginx with an HTTPS block and auto-renewal via systemd timer.

If you are deploying to a different domain, update `server_name` in `backend/nginx.conf` and the `AUTH0_REDIRECT_URI` / `AUTH0_AUDIENCE` values in `.env` before rebuilding.

### 5. Update the Raspberry Pi

Point the sensor client at the deployed server:

```bash
export BACKEND_URL=https://hoosleaf.fit
export PLANT_ID=plant-01
export DEVICE_ID=rpi-kitchen-01
export POLL_INTERVAL=60

python raspberry_pi/sensor_client.py
```

### Useful commands

```bash
docker compose logs -f          # tail all logs
docker compose logs -f web      # backend only
docker compose restart web      # restart after config change
docker compose down             # stop & remove containers
docker compose down -v          # also wipe volumes
```