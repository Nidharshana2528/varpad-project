import sqlite3

DATABASE = "varpad.db"


def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def create_database():
    conn = get_db_connection()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_location TEXT NOT NULL,
            destination TEXT NOT NULL,
            travelers INTEGER NOT NULL,
            duration TEXT,
            distance REAL,
            fuel_cost REAL,
            total_cost REAL,
            status TEXT DEFAULT 'Upcoming',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()

    print("VARPAD Database created successfully!")


if __name__ == "__main__":
    create_database()