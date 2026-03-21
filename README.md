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
