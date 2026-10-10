"""Run with python -m persistence.backup. Restores are documented, never automatic."""

from config import load_settings
from .database import Database
from dotenv import load_dotenv
from pathlib import Path


def main():
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    settings = load_settings()
    destination = Database(settings.database_path).backup()
    print(destination)


if __name__ == "__main__":
    main()
