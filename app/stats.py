from flask import Blueprint, current_app, jsonify

from app.db import open_db
from app.items import _row_to_item

bp = Blueprint("stats", __name__, url_prefix="/api")


@bp.get("/statistics")
def statistics():
    conn = open_db(current_app.config["DATABASE"])
    try:
        rows = conn.execute(
            """
            SELECT i.id, i.image_url, i.name, i.category, i.subcategory, i.color, i.tags,
                   i.is_dirty, i.added_date,
                   COALESCE(w.wear_count, 0) AS wear_count
            FROM items i
            LEFT JOIN (
                SELECT item_id, COUNT(*) AS wear_count
                FROM wear_log_items
                GROUP BY item_id
            ) w ON w.item_id = i.id
            ORDER BY wear_count DESC, i.added_date DESC
            """
        ).fetchall()
    finally:
        conn.close()

    result = []
    for row in rows:
        item = _row_to_item(row)
        item["wear_count"] = row["wear_count"]
        result.append(item)

    return jsonify(result)
