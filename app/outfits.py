import uuid
from datetime import date

from flask import Blueprint, current_app, jsonify, request

from app.db import open_db
from app.items import NEVER_DIRTY_CATEGORIES, _row_to_item

bp = Blueprint("outfits", __name__, url_prefix="/api/outfits")

VALID_SLOTS = frozenset(
    {
        "tops",
        "bottoms",
        "shoes",
        "jacket",
        "watch",
        "bracelet",
        "chain",
        "belt",
    }
)


def _slot_item_from_row(row) -> dict:
    return {"slot": row["slot"], **_row_to_item(row)}


def _outfit_dict(outfit_row, items: list) -> dict:
    return {
        "id": outfit_row["id"],
        "name": outfit_row["name"],
        "created_date": outfit_row["created_date"],
        "items": items,
    }


def _fetch_outfit_items(conn, outfit_id: str) -> list:
    rows = conn.execute(
        """
        SELECT oi.slot,
               i.id, i.image_url, i.name, i.category, i.subcategory, i.color,
               i.tags, i.is_dirty, i.added_date
        FROM outfit_items oi
        JOIN items i ON i.id = oi.item_id
        WHERE oi.outfit_id = ?
        ORDER BY oi.slot
        """,
        (outfit_id,),
    ).fetchall()
    return [_slot_item_from_row(row) for row in rows]


def _fetch_outfit(conn, outfit_id: str) -> dict | None:
    outfit_row = conn.execute(
        "SELECT * FROM outfits WHERE id = ?", (outfit_id,)
    ).fetchone()
    if outfit_row is None:
        return None
    return _outfit_dict(outfit_row, _fetch_outfit_items(conn, outfit_id))


def _mark_items_dirty(conn, item_ids: list[str]) -> int:
    if not item_ids:
        return 0
    id_placeholders = ",".join("?" * len(item_ids))
    cat_placeholders = ",".join("?" * len(NEVER_DIRTY_CATEGORIES))
    result = conn.execute(
        f"""
        UPDATE items
        SET is_dirty = 1
        WHERE id IN ({id_placeholders})
          AND category NOT IN ({cat_placeholders})
        """,
        tuple(item_ids) + tuple(NEVER_DIRTY_CATEGORIES),
    )
    return result.rowcount


def _link_wear_items(conn, wear_id: str, item_ids: list[str]) -> None:
    if not item_ids:
        return
    conn.executemany(
        "INSERT INTO wear_log_items (wear_log_id, item_id) VALUES (?, ?)",
        [(wear_id, item_id) for item_id in item_ids],
    )


def _validate_outfit_items(conn, items: list) -> tuple[list | None, tuple | None]:
    if not isinstance(items, list) or not items:
        return None, (jsonify({"error": "items must be a non-empty list"}), 400)

    seen_slots = set()
    validated = []
    for entry in items:
        if not isinstance(entry, dict):
            return None, (jsonify({"error": "each item must be an object"}), 400)

        item_id = entry.get("item_id")
        slot = entry.get("slot")
        if not item_id or not slot:
            return None, (
                jsonify({"error": "each item requires item_id and slot"}),
                400,
            )
        if slot not in VALID_SLOTS:
            return None, (jsonify({"error": f"invalid slot: {slot}"}), 400)
        if slot in seen_slots:
            return None, (jsonify({"error": f"duplicate slot: {slot}"}), 400)
        seen_slots.add(slot)

        exists = conn.execute(
            "SELECT 1 FROM items WHERE id = ?", (item_id,)
        ).fetchone()
        if exists is None:
            return None, (jsonify({"error": f"item not found: {item_id}"}), 400)

        validated.append((item_id, slot))

    return validated, None


@bp.post("")
def create_outfit():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    if not name:
        return jsonify({"error": "name is required"}), 400

    conn = open_db(current_app.config["DATABASE"])
    try:
        validated, error = _validate_outfit_items(conn, data.get("items", []))
        if error:
            return error

        outfit_id = str(uuid.uuid4())
        created_date = date.today().isoformat()

        conn.execute(
            "INSERT INTO outfits (id, name, created_date) VALUES (?, ?, ?)",
            (outfit_id, name, created_date),
        )
        conn.executemany(
            "INSERT INTO outfit_items (outfit_id, item_id, slot) VALUES (?, ?, ?)",
            [(outfit_id, item_id, slot) for item_id, slot in validated],
        )
        conn.commit()
        outfit = _fetch_outfit(conn, outfit_id)
    finally:
        conn.close()

    return jsonify(outfit), 201


@bp.get("")
def list_outfits():
    conn = open_db(current_app.config["DATABASE"])
    try:
        outfits = conn.execute(
            "SELECT * FROM outfits ORDER BY created_date DESC"
        ).fetchall()
        item_rows = conn.execute(
            """
            SELECT oi.outfit_id, oi.slot,
                   i.id, i.image_url, i.name, i.category, i.subcategory, i.color,
                   i.tags, i.is_dirty, i.added_date
            FROM outfit_items oi
            JOIN items i ON i.id = oi.item_id
            ORDER BY oi.outfit_id, oi.slot
            """
        ).fetchall()

        items_by_outfit: dict[str, list] = {}
        for row in item_rows:
            items_by_outfit.setdefault(row["outfit_id"], []).append(
                _slot_item_from_row(row)
            )

        result = [
            _outfit_dict(outfit, items_by_outfit.get(outfit["id"], []))
            for outfit in outfits
        ]
    finally:
        conn.close()

    return jsonify(result)


@bp.post("/wear/adhoc")
def wear_adhoc():
    data = request.get_json(silent=True) or {}
    item_ids = data.get("item_ids")

    if not isinstance(item_ids, list) or not item_ids:
        return jsonify({"error": "item_ids must be a non-empty list"}), 400

    conn = open_db(current_app.config["DATABASE"])
    try:
        unique_ids = list(dict.fromkeys(item_ids))
        placeholders = ",".join("?" * len(unique_ids))
        found = conn.execute(
            f"SELECT id FROM items WHERE id IN ({placeholders})",
            unique_ids,
        ).fetchall()
        found_ids = {row["id"] for row in found}
        missing = [i for i in unique_ids if i not in found_ids]
        if missing:
            return jsonify({"error": f"items not found: {missing}"}), 400

        wear_id = str(uuid.uuid4())
        today = date.today().isoformat()
        conn.execute(
            "INSERT INTO wear_log (id, date, outfit_id) VALUES (?, ?, NULL)",
            (wear_id, today),
        )
        _link_wear_items(conn, wear_id, unique_ids)
        marked = _mark_items_dirty(conn, unique_ids)
        conn.commit()
    finally:
        conn.close()

    return jsonify(
        {
            "id": wear_id,
            "date": today,
            "outfit_id": None,
            "items_marked_dirty": marked,
        }
    ), 201


@bp.get("/<outfit_id>")
def get_outfit(outfit_id):
    conn = open_db(current_app.config["DATABASE"])
    try:
        outfit = _fetch_outfit(conn, outfit_id)
    finally:
        conn.close()

    if outfit is None:
        return jsonify({"error": "outfit not found"}), 404

    return jsonify(outfit)


@bp.delete("/<outfit_id>")
def delete_outfit(outfit_id):
    conn = open_db(current_app.config["DATABASE"])
    try:
        result = conn.execute("DELETE FROM outfits WHERE id = ?", (outfit_id,))
        conn.commit()
        if result.rowcount == 0:
            return jsonify({"error": "outfit not found"}), 404
    finally:
        conn.close()

    return jsonify({"deleted": outfit_id})


@bp.post("/<outfit_id>/wear")
def wear_outfit(outfit_id):
    conn = open_db(current_app.config["DATABASE"])
    try:
        outfit_row = conn.execute(
            "SELECT id FROM outfits WHERE id = ?", (outfit_id,)
        ).fetchone()
        if outfit_row is None:
            return jsonify({"error": "outfit not found"}), 404

        item_rows = conn.execute(
            "SELECT item_id FROM outfit_items WHERE outfit_id = ?",
            (outfit_id,),
        ).fetchall()
        item_ids = [row["item_id"] for row in item_rows]

        wear_id = str(uuid.uuid4())
        today = date.today().isoformat()
        conn.execute(
            "INSERT INTO wear_log (id, date, outfit_id) VALUES (?, ?, ?)",
            (wear_id, today, outfit_id),
        )
        _link_wear_items(conn, wear_id, item_ids)
        marked = _mark_items_dirty(conn, item_ids)
        conn.commit()
    finally:
        conn.close()

    return jsonify(
        {
            "id": wear_id,
            "date": today,
            "outfit_id": outfit_id,
            "items_marked_dirty": marked,
        }
    ), 201
