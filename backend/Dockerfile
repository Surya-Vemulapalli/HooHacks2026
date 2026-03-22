FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Assuming your Flask entry point is in app.py and the instance is named app
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:create_app()"]