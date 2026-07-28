from pathlib import Path

from flask import Flask

from app.db import init_db
from app.items import sync_clothes_folder


def create_app() -> Flask:
    root = Path(__file__).resolve().parent.parent
    app = Flask(
        __name__,
        template_folder=str(root / "templates"),
        static_folder=str(root / "static"),
    )

    instance_path = Path(app.instance_path)
    instance_path.mkdir(parents=True, exist_ok=True)
    app.config["DATABASE"] = str(instance_path / "wardrobe.db")
    app.config["CLOTHES_DIR"] = str(root / "static" / "clothes")

    init_db(app.config["DATABASE"])
    sync_clothes_folder(app.config["DATABASE"], app.config["CLOTHES_DIR"])

    from app.routes import bp
    from app.items import bp as items_bp
    from app.outfits import bp as outfits_bp
    from app.settings import bp as settings_bp, weather_bp
    from app.stats import bp as stats_bp

    app.register_blueprint(bp)
    app.register_blueprint(items_bp)
    app.register_blueprint(outfits_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(weather_bp)
    app.register_blueprint(stats_bp)

    return app
