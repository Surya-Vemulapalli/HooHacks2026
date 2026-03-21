"""
Raspberry Pi sensor client for Plant Health Monitor.

Reads temperature, light level, and deformity score from sensors,
then POSTs the data to the Flask backend every POLL_INTERVAL seconds.

Hardware assumptions:
  - DHT22 temperature/humidity sensor on GPIO pin 4
  - TSL2591 or BH1750 I2C light sensor (or ADC-based analog equivalent)
  - Deformity score: result of an on-device image classification model
    (e.g. TensorFlow Lite), or a fixed placeholder if no camera is attached.

Install dependencies on the Pi:
  pip install requests adafruit-circuitpython-dht board
"""

import time
import logging
import requests
import os

# ── Configuration ──────────────────────────────────────────────────────────
BACKEND_URL   = os.getenv("BACKEND_URL",  "http://<your-server-ip>:5000")
PLANT_ID      = os.getenv("PLANT_ID",     "plant-01")
DEVICE_ID     = os.getenv("DEVICE_ID",    "rpi-01")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "60"))  # seconds

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Sensor helpers ─────────────────────────────────────────────────────────

def read_temperature() -> float:
    """Read temperature from DHT22 sensor. Returns °C."""
    try:
        import adafruit_dht
        import board
        sensor = adafruit_dht.DHT22(board.D4)
        return sensor.temperature
    except Exception as e:
        log.warning("Temperature read failed: %s — using placeholder", e)
        return 22.0  # placeholder


def read_light_level() -> float:
    """Read ambient light in lux from a light sensor."""
    try:
        import board
        import busio
        import adafruit_tsl2591
        i2c = busio.I2C(board.SCL, board.SDA)
        sensor = adafruit_tsl2591.TSL2591(i2c)
        return sensor.lux or 0.0
    except Exception as e:
        log.warning("Light read failed: %s — using placeholder", e)
        return 5000.0  # placeholder


def read_deformity() -> tuple[float, str | None]:
    """
    Run on-device inference to detect plant deformities from camera.

    Returns (score 0-1, deformity_type or None).
    Replace with your TFLite model inference code.
    """
    # Placeholder — replace with actual model inference
    score = 0.05
    deformity_type = None
    return score, deformity_type


# ── Main loop ──────────────────────────────────────────────────────────────

def main():
    endpoint = f"{BACKEND_URL}/api/sensor/reading"
    log.info("Starting sensor client. Plant=%s Device=%s Interval=%ds",
             PLANT_ID, DEVICE_ID, POLL_INTERVAL)

    while True:
        try:
            temperature   = read_temperature()
            light_level   = read_light_level()
            deformity_score, deformity_type = read_deformity()

            payload = {
                "plant_id":        PLANT_ID,
                "device_id":       DEVICE_ID,
                "temperature":     temperature,
                "light_level":     light_level,
                "deformity_score": deformity_score,
            }
            if deformity_type:
                payload["deformity_type"] = deformity_type

            log.info("Sending: temp=%.1f°C light=%.0f lux deformity=%.2f",
                     temperature, light_level, deformity_score)

            resp = requests.post(endpoint, json=payload, timeout=10)
            resp.raise_for_status()
            log.info("Backend accepted reading: %s", resp.json())

        except requests.RequestException as e:
            log.error("Failed to send reading: %s", e)
        except Exception as e:
            log.error("Unexpected error: %s", e)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
