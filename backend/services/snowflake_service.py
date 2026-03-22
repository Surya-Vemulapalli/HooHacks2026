import snowflake.connector
from flask import current_app


def get_connection():
    cfg = current_app.config
    return snowflake.connector.connect(
        account=cfg["SNOWFLAKE_ACCOUNT"],
        user=cfg["SNOWFLAKE_USER"],
        password=cfg["SNOWFLAKE_PASSWORD"],
        database=cfg["SNOWFLAKE_DATABASE"],
        schema=cfg["SNOWFLAKE_SCHEMA"],
        warehouse=cfg["SNOWFLAKE_WAREHOUSE"],
        role=cfg["SNOWFLAKE_ROLE"],
    )


def init_db():
    """Create database and tables if they don't exist."""
    with get_connection() as conn:
        cur = conn.cursor()
        cfg = current_app.config
        db_name = cfg["SNOWFLAKE_DATABASE"]
        schema_name = cfg["SNOWFLAKE_SCHEMA"]

        cur.execute(f"CREATE DATABASE IF NOT EXISTS {db_name}")
        cur.execute(f"USE DATABASE {db_name}")
        cur.execute(f"USE SCHEMA {schema_name}")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS plant_readings (
                id          INTEGER AUTOINCREMENT PRIMARY KEY,
                plant_id    VARCHAR(64)   NOT NULL,
                device_id   VARCHAR(64)   NOT NULL,
                recorded_at TIMESTAMP_NTZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
                temperature FLOAT,
                light_level FLOAT,
                deformity_score FLOAT,
                deformity_type  VARCHAR(128),
                image_url       VARCHAR(1024)
            )
        """)


def insert_reading(plant_id, device_id, temperature, light_level,
                   deformity_score, deformity_type=None, image_url=None):
    with get_connection() as conn:
        conn.cursor().execute(
            """
            INSERT INTO plant_readings
                (plant_id, device_id, temperature, light_level,
                 deformity_score, deformity_type, image_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (plant_id, device_id, temperature, light_level,
             deformity_score, deformity_type, image_url),
        )


def get_readings(plant_id, limit=100):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, plant_id, device_id, recorded_at,
                   temperature, light_level, deformity_score, deformity_type, image_url
            FROM plant_readings
            WHERE plant_id = %s
            ORDER BY recorded_at DESC
            LIMIT %s
            """,
            (plant_id, limit),
        )
        cols = [d[0].lower() for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_trend_summary(plant_id, hours=24):
    """Aggregate stats over the last N hours for Gemini context."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                COUNT(*)                          AS reading_count,
                AVG(temperature)                  AS avg_temp,
                MIN(temperature)                  AS min_temp,
                MAX(temperature)                  AS max_temp,
                AVG(light_level)                  AS avg_light,
                MIN(light_level)                  AS min_light,
                MAX(light_level)                  AS max_light,
                AVG(deformity_score)              AS avg_deformity,
                MAX(deformity_score)              AS max_deformity,
                LISTAGG(DISTINCT deformity_type, ', ')
                    WITHIN GROUP (ORDER BY deformity_type) AS deformity_types
            FROM plant_readings
            WHERE plant_id = %s
              AND recorded_at >= DATEADD(hour, -%s, CURRENT_TIMESTAMP())
            """,
            (plant_id, hours),
        )
        cols = [d[0].lower() for d in cur.description]
        row = cur.fetchone()
        return dict(zip(cols, row)) if row else {}


def get_all_plants():
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT DISTINCT plant_id,
                   MAX(recorded_at) AS last_seen,
                   COUNT(*)         AS total_readings
            FROM plant_readings
            GROUP BY plant_id
            ORDER BY last_seen DESC
            """
        )
        cols = [d[0].lower() for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
