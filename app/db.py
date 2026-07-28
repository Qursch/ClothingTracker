import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    image_url TEXT,
    name TEXT,
    category TEXT,
    subcategory TEXT,
    color TEXT,
    tags TEXT,
    is_dirty INTEGER NOT NULL DEFAULT 0,
    added_date TEXT
);

CREATE TABLE IF NOT EXISTS outfits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_date TEXT
);

CREATE TABLE IF NOT EXISTS outfit_items (
    outfit_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    PRIMARY KEY (outfit_id, slot),
    FOREIGN KEY (outfit_id) REFERENCES outfits(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wear_log (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    outfit_id TEXT,
    FOREIGN KEY (outfit_id) REFERENCES outfits(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS wear_log_items (
    wear_log_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    PRIMARY KEY (wear_log_id, item_id),
    FOREIGN KEY (wear_log_id) REFERENCES wear_log(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    latitude TEXT,
    longitude TEXT
);

INSERT OR IGNORE INTO settings (id, latitude, longitude) VALUES (1, NULL, NULL);
"""


def migrate_db(conn: sqlite3.Connection) -> None:
    """Add new columns to existing databases without losing data."""
    columns = {row[1] for row in conn.execute("PRAGMA table_info(items)")}
    if "name" not in columns:
        conn.execute("ALTER TABLE items ADD COLUMN name TEXT")
    if "subcategory" not in columns:
        conn.execute("ALTER TABLE items ADD COLUMN subcategory TEXT")


def init_db(db_path: str | Path) -> None:
    """Create the database file and tables if they do not already exist."""
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)
        migrate_db(conn)
        conn.commit()


def open_db(db_path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
