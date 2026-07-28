from flask import Blueprint, render_template

bp = Blueprint("main", __name__)


@bp.route("/")
def home():
    return render_template("index.html")


@bp.route("/outfit-maker")
def outfit_maker():
    return render_template("outfit_maker.html")


@bp.route("/clothes")
def clothes():
    return render_template("clothes.html")


@bp.route("/saved-outfits")
def saved_outfits():
    return render_template("saved_outfits.html")


@bp.route("/settings")
def settings_page():
    return render_template("settings.html")


@bp.route("/statistics")
def statistics_page():
    return render_template("statistics.html")
