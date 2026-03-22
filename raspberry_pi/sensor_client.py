"""
Raspberry Pi sensor client for Plant Health Monitor.

Reads temperature, light level, soil moisture, and deformity score from
sensors/camera, then POSTs the data to the Flask backend every POLL_INTERVAL seconds.

Hardware assumptions:
  - DHT22 temperature/humidity sensor on GPIO pin 4  (optional)
  - TSL2591 or BH1750 I2C light sensor               (optional)
  - Grove moisture sensor on Grove HAT analog pin     (optional)
  - Camera + Keras model for plant deformity classification

Install dependencies on the Pi:
  pip install requests adafruit-circuitpython-dht board tensorflow pillow opencv-python numpy grove.py
"""

import os

# Force TensorFlow 2.16+ to use the legacy Keras 2 backend
os.environ["TF_USE_LEGACY_KERAS"] = "1"

import time
import logging
import requests
import subprocess
import numpy as np

# ── Configuration ──────────────────────────────────────────────────────────
BACKEND_URL   = os.getenv("BACKEND_URL",  "http://hoosleaf.fit")
PLANT_ID      = os.getenv("PLANT_ID",     "plant-01")
DEVICE_ID     = os.getenv("DEVICE_ID",    "rpi-01")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "300"))  # seconds (default 5 min)

# Sensor toggles — set to "0" or "false" to disable
ENABLE_TEMP_SENSOR  = os.getenv("ENABLE_TEMP_SENSOR",  "true").lower() in ("1", "true", "yes")
ENABLE_LIGHT_SENSOR = os.getenv("ENABLE_LIGHT_SENSOR", "false").lower() in ("1", "true", "yes")
ENABLE_SOIL_SENSOR  = os.getenv("ENABLE_SOIL_SENSOR",  "true").lower() in ("1", "true", "yes")
ENABLE_CAMERA       = os.getenv("ENABLE_CAMERA",       "true").lower()  in ("1", "true", "yes")

# Grove moisture sensor config (analog pin on Grove HAT)
SOIL_SENSOR_PIN = int(os.getenv("SOIL_SENSOR_PIN", "0"))  # A0 by default

# Camera / model config
MODEL_PATH    = os.getenv("MODEL_PATH", "model.keras")
IMAGE_WIDTH   = int(os.getenv("IMAGE_WIDTH",  "224"))
IMAGE_HEIGHT  = int(os.getenv("IMAGE_HEIGHT", "224"))
USE_LIBCAMERA = os.getenv("USE_LIBCAMERA", "false").lower() in ("1", "true", "yes")

# Class label mapping — index → human-readable name
CLASS_LABELS = {
    0:  "healthy",
    1:  "black_rot",
    2:  "early_blight",
    3:  "target_spot",
    4:  "late_blight",
    5:  "tomato_mosaic_virus",
    6:  "huanglongbing_citrus_greening",
    7:  "leaf_mold",
    8:  "leaf_blight_isariopsis",
    9:  "powdery_mildew",
    10: "cedar_apple_rust",
    11: "bacterial_spot",
    12: "common_rust",
    13: "esca_black_measles",
    14: "tomato_yellow_leaf_curl_virus",
    15: "apple_scab",
    16: "northern_leaf_blight",
    17: "spider_mites_two_spotted",
    18: "septoria_leaf_spot",
    19: "cercospora_leaf_spot_gray_leaf_spot",
    20: "leaf_scorch",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


# ── Camera / Classification helpers ────────────────────────────────────────

def load_keras_model(model_path):
    """Load the Keras classification model. Returns None on failure."""
    log.info("Loading Keras model from %s ...", model_path)
    try:
        import tensorflow as tf
        model = tf.keras.models.load_model(model_path)
        log.info("Model loaded successfully.")
        return model
    except Exception as e:
        log.error("Failed to load model: %s", e)
        return None


def take_picture(filename="snapshot.jpg"):
    """Capture an image from the camera. Returns True on success."""
    log.info("Capturing image...")
    try:
        if USE_LIBCAMERA:
            subprocess.run(
                ["libcamera-still", "-o", filename, "--timeout", "1000", "--nopreview"],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            import cv2
            cap = cv2.VideoCapture(0)
            if not cap.isOpened():
                log.error("Could not open camera.")
                return False
            time.sleep(2)  # warm-up
            ret, frame = cap.read()
            cap.release()
            if ret:
                cv2.imwrite(filename, frame)
            else:
                log.error("Could not capture frame.")
                return False

        log.info("Image saved to %s", filename)
        return True
    except Exception as e:
        log.error("Error capturing image: %s", e)
        return False


def preprocess_image(image_path):
    """Load, resize, and normalize an image for model inference."""
    try:
        from PIL import Image
        image = Image.open(image_path).convert("RGB")
        image = image.resize((IMAGE_WIDTH, IMAGE_HEIGHT))
        img_array = np.array(image, dtype="float32") / 255.0
        img_array = np.expand_dims(img_array, axis=0)  # add batch dim
        return img_array
    except Exception as e:
        log.error("Error preprocessing image: %s", e)
        return None


def classify_image(model, image_array):
    """Run inference and return (deformity_score, deformity_type)."""
    try:
        predictions = model.predict(image_array, verbose=0)
        predicted_class_idx = int(np.argmax(predictions, axis=1)[0])
        confidence = float(np.max(predictions))

        deformity_type = CLASS_LABELS.get(predicted_class_idx, f"class_{predicted_class_idx}")

        # If the model predicts "healthy" (class 0), score is low;
        # otherwise score = confidence of the deformity class.
        if predicted_class_idx == 0:
            deformity_score = round(1.0 - confidence, 4)
            deformity_type = None  # no deformity
        else:
            deformity_score = round(confidence, 4)

        log.info("Classification: class=%s score=%.4f type=%s",
                 predicted_class_idx, deformity_score, deformity_type)
        return deformity_score, deformity_type
    except Exception as e:
        log.error("Error during classification: %s", e)
        return None, None


# ── Sensor helpers (optional) ──────────────────────────────────────────────

TEMP_SENSOR_PIN = int(os.getenv("TEMP_SENSOR_PIN", "4"))  # A4 by default

def read_temperature():
    """Read temperature from Grove Temperature Sensor. Returns °C or None."""
    if not ENABLE_TEMP_SENSOR:
        return None
    try:
        from grove.grove_temperature_sensor import GroveTemperatureSensor
        sensor = GroveTemperatureSensor(TEMP_SENSOR_PIN)
        temp = sensor.temperature
        log.info("Temperature: %.1f°C", temp)
        return temp
    except Exception as e:
        log.warning("Temperature read failed: %s", e)
        return None


def read_light_level():
    """Read ambient light in lux. Returns lux or None."""
    if not ENABLE_LIGHT_SENSOR:
        return None
    try:
        import board
        import busio
        import adafruit_tsl2591
        i2c = busio.I2C(board.SCL, board.SDA)
        sensor = adafruit_tsl2591.TSL2591(i2c)
        lux = sensor.lux or 0.0
        log.info("Light level: %.0f lux", lux)
        return lux
    except Exception as e:
        log.warning("Light read failed: %s", e)
        return None


def read_soil_moisture():
    """Read soil moisture from Grove moisture sensor via Grove HAT ADC.

    Returns the raw analog value (0 = dry, ~1000 = saturated) or None.
    """
    if not ENABLE_SOIL_SENSOR:
        return None
    try:
        from grove.adc import ADC
        adc = ADC()
        raw = adc.read(SOIL_SENSOR_PIN)
        log.info("Soil moisture (raw): %d", raw)
        return raw
    except Exception as e:
        log.warning("Soil moisture read failed: %s", e)
        return None


# ── Main loop ──────────────────────────────────────────────────────────────

def main():
    endpoint = f"{BACKEND_URL}/api/sensor/reading"

    # Load the camera model once at startup (if camera is enabled)
    model = None
    if ENABLE_CAMERA:
        model = load_keras_model(MODEL_PATH)
        if model is None:
            log.error("Camera is enabled but model failed to load. "
                      "Camera classification will be skipped.")

    log.info("Starting sensor client  Plant=%s  Device=%s  Interval=%ds",
             PLANT_ID, DEVICE_ID, POLL_INTERVAL)
    log.info("Sensors enabled — temp=%s  light=%s  soil=%s  camera=%s",
             ENABLE_TEMP_SENSOR, ENABLE_LIGHT_SENSOR, ENABLE_SOIL_SENSOR, ENABLE_CAMERA)

    while True:
        try:
            # ── Read optional sensors ──
            temperature = read_temperature()
            light_level = read_light_level()
            soil_moisture = read_soil_moisture()

            # ── Camera classification ──
            deformity_score = 0.0
            deformity_type = None

            if ENABLE_CAMERA and model is not None:
                image_file = "current_capture.jpg"
                if take_picture(image_file):
                    processed = preprocess_image(image_file)
                    if processed is not None:
                        deformity_score, deformity_type = classify_image(model, processed)
                        if deformity_score is None:
                            deformity_score = 0.0

            # ── Build payload ──
            payload = {
                "plant_id":        PLANT_ID,
                "device_id":       DEVICE_ID,
                "deformity_score": deformity_score,
            }
            if temperature is not None:
                payload["temperature"] = temperature
            if light_level is not None:
                payload["light_level"] = light_level
            if soil_moisture is not None:
                payload["soil_moisture"] = soil_moisture
            if deformity_type:
                payload["deformity_type"] = deformity_type

            log.info("Sending: temp=%s  light=%s  soil=%s  deformity=%.2f  type=%s",
                     temperature, light_level, soil_moisture, deformity_score, deformity_type)

            resp = requests.post(endpoint, json=payload, timeout=10)
            resp.raise_for_status()
            log.info("Backend accepted reading: %s", resp.json())

        except requests.RequestException as e:
            log.error("Failed to send reading: %s", e)
        except KeyboardInterrupt:
            log.info("Stopped by user.")
            break
        except Exception as e:
            log.error("Unexpected error: %s", e)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
