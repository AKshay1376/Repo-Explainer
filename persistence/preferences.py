"""Local profile and strictly typed settings; account sync can later wrap this boundary."""

import json

from .models import now, text

DEFAULTS = {"remember_workspace": True, "persist_ask_history": False,
            "default_landing_page": "home", "auto_open_last_project": False,
            "activity_limit": 500, "analysis_limit": 50, "validation_limit": 200}


def get(connection):
    result = DEFAULTS.copy()
    for item in connection.execute("SELECT key,value_json FROM preferences"):
        if item["key"] in DEFAULTS:
            result[item["key"]] = json.loads(item["value_json"])
    return result


def update(connection, changes):
    if not isinstance(changes, dict) or any(key not in DEFAULTS for key in changes):
        raise ValueError("Unsupported setting.")
    for key, value in changes.items():
        default = DEFAULTS[key]
        if isinstance(default, bool):
            if not isinstance(value, bool):
                raise ValueError("Setting must be true or false.")
        elif isinstance(default, int):
            if isinstance(value, bool) or not isinstance(value, int) or value < 10 or value > 1000:
                raise ValueError("Retention limit must be between 10 and 1000.")
        elif key == "default_landing_page" and value not in {"home", "last_project"}:
            raise ValueError("Unsupported landing page.")
        connection.execute("INSERT INTO preferences(key,value_json) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json",
                           (key, json.dumps(value)))
    return get(connection)


def profile(connection):
    item = connection.execute("SELECT * FROM user_profile LIMIT 1").fetchone()
    if item:
        return dict(item)
    stamp = now()
    connection.execute("INSERT INTO user_profile(id,display_name,created_at,updated_at) VALUES (?,?,?,?)",
                       ("local", "Local workspace", stamp, stamp))
    return dict(connection.execute("SELECT * FROM user_profile WHERE id='local'").fetchone())


def update_profile(connection, display_name):
    profile(connection)
    connection.execute("UPDATE user_profile SET display_name=?,updated_at=? WHERE id='local'",
                       (text(display_name, 100), now()))
    return profile(connection)
