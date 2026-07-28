import json
import uuid
from datetime import date
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request

from app.db import open_db

bp = Blueprint("items", __name__, url_prefix="/api/items")

# Accessories and shoes are never treated as dirty laundry.
NEVER_DIRTY_CATEGORIES = frozenset(
    {"chain", "bracelet", "watch", "shoes", "belt"}
)

UPDATABLE_FIELDS = (
    "image_url",
    "name",
    "category",
    "subcategory",
    "color",
    "tags",
    "is_dirty",
)


def category_can_be_dirty(category) -> bool:
    return category not in NEVER_DIRTY_CATEGORIES


def _row_to_item(row) -> dict:
    category = row["category"]
    return {
        "id": row["id"],
        "image_url": row["image_url"],
        "name": row["name"],
        "category": category,
        "subcategory": row["subcategory"],
        "color": row["color"],
        "tags": row["tags"],
        "is_dirty": bool(row["is_dirty"]) and category_can_be_dirty(category),
        "added_date": row["added_date"],
    }


def clear_never_dirty_flags(conn) -> int:
    """Force never-dirty categories to stay clean in the database."""
    if not NEVER_DIRTY_CATEGORIES:
        return 0
    placeholders = ",".join("?" * len(NEVER_DIRTY_CATEGORIES))
    result = conn.execute(
        f"""
        UPDATE items
        SET is_dirty = 0
        WHERE is_dirty = 1 AND category IN ({placeholders})
        """,
        tuple(NEVER_DIRTY_CATEGORIES),
    )
    return result.rowcount


def _normalize_tags(tags) -> str:
    if tags is None:
        return ""
    if isinstance(tags, list):
        return ",".join(str(t).strip() for t in tags if str(t).strip())
    return str(tags).strip()


def _import_name(entry: dict) -> str:
    name = entry.get("name")
    if name is not None and str(name).strip():
        return str(name).strip()
    return "Unnamed Item"


def _import_subcategory(entry: dict):
    sub = entry.get("subcategory")
    if sub is not None and str(sub).strip():
        return str(sub).strip()
    cat = entry.get("category")
    if cat is not None and str(cat).strip():
        return str(cat).strip()
    return None


def _entry_image_url(entry: dict, clothes_dir: Path | None = None) -> str | None:
    image_url = entry.get("image_url")
    if image_url is not None and str(image_url).strip():
        url = str(image_url).strip()
    else:
        filename = entry.get("filename")
        if filename is None or not str(filename).strip():
            return None
        url = f"/static/clothes/{str(filename).strip()}"

    # Bust browser cache when the on-disk image is replaced.
    if clothes_dir is not None and url.startswith("/static/clothes/"):
        image_name = url.split("/static/clothes/", 1)[1].split("?", 1)[0]
        image_path = clothes_dir / image_name
        if image_path.is_file():
            url = f"/static/clothes/{image_name}?v={int(image_path.stat().st_mtime)}"

    return url


def _item_row_values(entry: dict, clothes_dir: Path | None = None) -> tuple | None:
    item_id = entry.get("id")
    if not item_id:
        return None
    return (
        str(item_id),
        _entry_image_url(entry, clothes_dir),
        _import_name(entry),
        entry.get("category"),
        _import_subcategory(entry),
        entry.get("color"),
        _normalize_tags(entry.get("tags", "")),
        entry.get("added_date"),
    )


def _insert_item_entry(conn, entry: dict, clothes_dir: Path | None = None) -> bool:
    """Insert one item from an export-style dict. Returns True if a row was added."""
    values = _item_row_values(entry, clothes_dir)
    if values is None:
        return False

    item_id, image_url, name, category, subcategory, color, tags, added_date = values
    result = conn.execute(
        """
        INSERT OR IGNORE INTO items
            (id, image_url, name, category, subcategory, color, tags, is_dirty, added_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        """,
        (item_id, image_url, name, category, subcategory, color, tags, added_date),
    )
    return bool(result.rowcount)


def _upsert_item_entry(conn, entry: dict, clothes_dir: Path | None = None) -> str:
    """Insert or refresh an item from disk. Preserves is_dirty. Returns added|updated|skipped."""
    values = _item_row_values(entry, clothes_dir)
    if values is None:
        return "skipped"

    item_id, image_url, name, category, subcategory, color, tags, added_date = values
    existing = conn.execute(
        "SELECT id FROM items WHERE id = ?", (item_id,)
    ).fetchone()

    if existing is None:
        conn.execute(
            """
            INSERT INTO items
                (id, image_url, name, category, subcategory, color, tags, is_dirty, added_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (item_id, image_url, name, category, subcategory, color, tags, added_date),
        )
        return "added"

    conn.execute(
        """
        UPDATE items
        SET image_url = ?, name = ?, category = ?, subcategory = ?,
            color = ?, tags = ?, added_date = ?
        WHERE id = ?
        """,
        (image_url, name, category, subcategory, color, tags, added_date, item_id),
    )
    return "updated"


def _entry_has_image(entry: dict, clothes_path: Path) -> bool:
    """True when the entry resolves to an image file under static/clothes."""
    image_url = _entry_image_url(entry, clothes_path)
    if not image_url or not image_url.startswith("/static/clothes/"):
        return False
    image_name = image_url.split("/static/clothes/", 1)[1].split("?", 1)[0]
    return (clothes_path / image_name).is_file()


def sync_clothes_folder(db_path: str | Path, clothes_dir: str | Path) -> dict:
    """Treat static/clothes as the sole wardrobe source; replace DB items from disk."""
    clothes_path = Path(clothes_dir)
    if not clothes_path.is_dir():
        return {"added": 0, "updated": 0, "removed": 0, "skipped": 0}

    added = 0
    updated = 0
    skipped = 0
    disk_ids: set[str] = set()

    conn = open_db(db_path)
    try:
        clear_never_dirty_flags(conn)

        for json_path in sorted(clothes_path.glob("*.json")):
            try:
                entry = json.loads(json_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                skipped += 1
                continue

            if not isinstance(entry, dict) or not entry.get("id"):
                skipped += 1
                continue

            if not _entry_has_image(entry, clothes_path):
                skipped += 1
                continue

            disk_ids.add(str(entry["id"]))
            result = _upsert_item_entry(conn, entry, clothes_path)
            if result == "added":
                added += 1
            elif result == "updated":
                updated += 1
            else:
                skipped += 1

        # Drop every DB item not present on disk (including API/test orphans).
        removed = 0
        rows = conn.execute("SELECT id FROM items").fetchall()
        for row in rows:
            if row["id"] not in disk_ids:
                conn.execute("DELETE FROM items WHERE id = ?", (row["id"],))
                removed += 1

        conn.commit()
    finally:
        conn.close()

    return {
        "added": added,
        "updated": updated,
        "removed": removed,
        "skipped": skipped,
    }


@bp.post("")
def create_item():
    data = request.get_json(silent=True) or {}

    image_url = data.get("image_url")
    category = data.get("category")
    color = data.get("color")
    name = data.get("name")
    subcategory = data.get("subcategory")
    if not category:
        return jsonify({"error": "category is required"}), 400

    item_id = str(uuid.uuid4())
    tags = _normalize_tags(data.get("tags", ""))
    added_date = date.today().isoformat()

    conn = open_db(current_app.config["DATABASE"])
    try:
        conn.execute(
            """
            INSERT INTO items
                (id, image_url, name, category, subcategory, color, tags, is_dirty, added_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (
                item_id,
                image_url,
                name,
                category,
                subcategory,
                color,
                tags,
                added_date,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    finally:
        conn.close()

    return jsonify(_row_to_item(row)), 201


@bp.get("")
def list_items():
    # Re-read static/clothes so renames/reuploads show up without restarting.
    sync_clothes_folder(
        current_app.config["DATABASE"],
        current_app.config["CLOTHES_DIR"],
    )

    category = request.args.get("category")

    conn = open_db(current_app.config["DATABASE"])
    try:
        if category:
            rows = conn.execute(
                "SELECT * FROM items WHERE category = ? ORDER BY added_date DESC",
                (category,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM items ORDER BY added_date DESC"
            ).fetchall()
    finally:
        conn.close()

    return jsonify([_row_to_item(row) for row in rows])


@bp.post("/clean-all")
def clean_all():
    conn = open_db(current_app.config["DATABASE"])
    try:
        result = conn.execute(
            "UPDATE items SET is_dirty = 0 WHERE is_dirty = 1"
        )
        conn.commit()
        updated = result.rowcount
    finally:
        conn.close()

    return jsonify({"updated": updated})


def _parse_import_payload():
    if request.content_type and "multipart/form-data" in request.content_type:
        uploaded = request.files.get("file")
        if uploaded is None:
            return None, (jsonify({"error": "no file provided"}), 400)
        try:
            return json.loads(uploaded.read()), None
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None, (jsonify({"error": "invalid JSON file"}), 400)

    payload = request.get_json(silent=True)
    if payload is None:
        return None, (jsonify({"error": "request body must be a JSON list"}), 400)
    return payload, None


@bp.post("/import")
def bulk_import():
    payload, error = _parse_import_payload()
    if error:
        return error

    if not isinstance(payload, list):
        return jsonify({"error": "payload must be a list of items"}), 400

    added = 0
    skipped = 0

    clothes_dir = Path(current_app.config["CLOTHES_DIR"])
    conn = open_db(current_app.config["DATABASE"])
    try:
        for entry in payload:
            if not isinstance(entry, dict):
                skipped += 1
                continue

            if _insert_item_entry(conn, entry, clothes_dir):
                added += 1
            else:
                skipped += 1

        conn.commit()
    finally:
        conn.close()

    return jsonify({"added": added, "skipped": skipped})


@bp.get("/<item_id>")
def get_item(item_id):
    conn = open_db(current_app.config["DATABASE"])
    try:
        row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    finally:
        conn.close()

    if row is None:
        return jsonify({"error": "item not found"}), 404

    return jsonify(_row_to_item(row))


@bp.patch("/<item_id>")
def update_item(item_id):
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"error": "no fields to update"}), 400

    conn = open_db(current_app.config["DATABASE"])
    try:
        existing = conn.execute(
            "SELECT * FROM items WHERE id = ?", (item_id,)
        ).fetchone()
        if existing is None:
            return jsonify({"error": "item not found"}), 404

        updates = {}
        for field in UPDATABLE_FIELDS:
            if field not in data:
                continue
            value = data[field]
            if field == "tags":
                value = _normalize_tags(value)
            elif field == "is_dirty":
                if not category_can_be_dirty(existing["category"]):
                    continue
                value = 1 if value else 0
            updates[field] = value

        if not updates:
            return jsonify(_row_to_item(existing))

        set_clause = ", ".join(f"{field} = ?" for field in updates)
        values = list(updates.values()) + [item_id]
        conn.execute(
            f"UPDATE items SET {set_clause} WHERE id = ?",
            values,
        )
        conn.commit()
        row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    finally:
        conn.close()

    return jsonify(_row_to_item(row))


@bp.patch("/<item_id>/dirty")
def toggle_dirty(item_id):
    conn = open_db(current_app.config["DATABASE"])
    try:
        row = conn.execute(
            "SELECT * FROM items WHERE id = ?", (item_id,)
        ).fetchone()
        if row is None:
            return jsonify({"error": "item not found"}), 404

        if not category_can_be_dirty(row["category"]):
            if row["is_dirty"]:
                conn.execute(
                    "UPDATE items SET is_dirty = 0 WHERE id = ?", (item_id,)
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM items WHERE id = ?", (item_id,)
                ).fetchone()
            return jsonify(_row_to_item(row))

        new_dirty = 0 if row["is_dirty"] else 1
        conn.execute(
            "UPDATE items SET is_dirty = ? WHERE id = ?",
            (new_dirty, item_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    finally:
        conn.close()

    return jsonify(_row_to_item(row))


@bp.delete("/<item_id>")
def delete_item(item_id):
    conn = open_db(current_app.config["DATABASE"])
    try:
        result = conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        conn.commit()
        if result.rowcount == 0:
            return jsonify({"error": "item not found"}), 404
    finally:
        conn.close()

    return jsonify({"deleted": item_id})
