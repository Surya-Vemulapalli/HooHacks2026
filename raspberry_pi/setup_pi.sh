#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup_pi.sh — Bootstrap a fresh Raspberry Pi OS Lite for the sensor client
#
# Run on the Pi after first boot:
#   curl -sSL <this script> | bash
#   — or —
#   chmod +x setup_pi.sh && ./setup_pi.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="https://github.com/Surya-Vemulapalli/HooHacks2026.git"
INSTALL_DIR="$HOME/HooHacks2026"
VENV_DIR="$INSTALL_DIR/raspberry_pi/venv"

echo "========================================="
echo "  HooHacks Plant Monitor — Pi Setup"
echo "========================================="

# ── 1. System update ─────────────────────────────────────────────────────────
echo ""
echo "[1/7] Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# ── 2. Install system dependencies ───────────────────────────────────────────
echo ""
echo "[2/7] Installing system dependencies..."
sudo apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    git \
    libatlas-base-dev \
    libjpeg-dev \
    libopenjp2-7 \
    libtiff-dev \
    libhdf5-dev \
    i2c-tools

# ── 3. Enable I2C and camera interfaces ─────────────────────────────────────
echo ""
echo "[3/7] Enabling I2C for Grove HAT..."

# Enable I2C (needed for Grove HAT ADC)
if ! grep -q "^dtparam=i2c_arm=on" /boot/firmware/config.txt 2>/dev/null && \
   ! grep -q "^dtparam=i2c_arm=on" /boot/config.txt 2>/dev/null; then
    # Bookworm uses /boot/firmware/config.txt, older OS uses /boot/config.txt
    CONFIG_FILE="/boot/firmware/config.txt"
    [ -f "$CONFIG_FILE" ] || CONFIG_FILE="/boot/config.txt"
    echo "dtparam=i2c_arm=on" | sudo tee -a "$CONFIG_FILE" > /dev/null
    echo "  → I2C enabled (reboot required to take effect)"
else
    echo "  → I2C already enabled"
fi

# ── 4. Clone the repo ───────────────────────────────────────────────────────
echo ""
echo "[4/7] Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
    echo "  → Repo already exists, pulling latest..."
    cd "$INSTALL_DIR" && git pull
else
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

# ── 5. Create Python virtual environment ─────────────────────────────────────
echo ""
echo "[5/7] Creating Python virtual environment..."
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

# ── 6. Install Python dependencies ──────────────────────────────────────────
echo ""
echo "[6/7] Installing Python packages (this may take a while)..."
pip install --upgrade pip

pip install \
    requests \
    numpy \
    pillow \
    opencv-python-headless \
    tensorflow \
    grove.py

# ── 7. Create env file and systemd service ───────────────────────────────────
echo ""
echo "[7/7] Creating config and systemd service..."

ENV_FILE="$INSTALL_DIR/raspberry_pi/.env"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << 'EOF'
# ── Sensor Client Configuration ──
BACKEND_URL=http://hoosleaf.fit
PLANT_ID=plant-01
DEVICE_ID=rpi-01
POLL_INTERVAL=300

# Sensor toggles (true/false)
ENABLE_TEMP_SENSOR=false
ENABLE_LIGHT_SENSOR=false
ENABLE_SOIL_SENSOR=true
ENABLE_CAMERA=true

# Grove moisture sensor
SOIL_SENSOR_PIN=0

# Camera
MODEL_PATH=model.keras
USE_LIBCAMERA=false
EOF
    echo "  → Created $ENV_FILE — edit this to match your setup"
else
    echo "  → $ENV_FILE already exists, skipping"
fi

# Create a systemd service so the client auto-starts on boot
SERVICE_FILE="/etc/systemd/system/plant-monitor.service"
sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Plant Health Monitor Sensor Client
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR/raspberry_pi
EnvironmentFile=$INSTALL_DIR/raspberry_pi/.env
ExecStart=$VENV_DIR/bin/python sensor_client.py
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable plant-monitor.service

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Place your model.keras file in: $INSTALL_DIR/raspberry_pi/"
echo "  2. Edit sensor config:            nano $ENV_FILE"
echo "  3. Reboot to apply I2C/camera:    sudo reboot"
echo "  4. After reboot, the service starts automatically."
echo ""
echo "Useful commands:"
echo "  Start now:    sudo systemctl start plant-monitor"
echo "  View logs:    journalctl -u plant-monitor -f"
echo "  Stop:         sudo systemctl stop plant-monitor"
echo ""
