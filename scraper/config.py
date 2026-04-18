import os
from dotenv import load_dotenv

load_dotenv()

HAPPYROBOT_WEBHOOK_URL: str = os.environ.get("HAPPYROBOT_WEBHOOK_URL", "")
OUTPUT_PATH: str = os.environ.get("OUTPUT_PATH", "signals_raw.jsonl")
PUSH_ERRORS_PATH: str = "push_errors.jsonl"

LOOKBACK_DAYS: int = 30
RESULTS_PER_SOURCE: int = 50

SEARCH_KEYWORDS: list[str] = [
    "Altenpflege",
    "Seniorenheim",
    "Pflegeheim",
    "Betreutes Wohnen",
    "Studentenwohnheim",
    "Haustechnik",
    "Einrichtungsleitung Neubau",
    "Facility Manager Pflegeheim",
    "Projektleitung Sanierung Pflege",
]

INDEED_KEYWORDS: list[str] = [
    "Facility Manager Pflegeheim",
    "Haustechnik Altenpflege",
    "Einrichtungsleitung Neubau",
    "Projektleitung Sanierung Pflege",
    "Hausleitung Seniorenresidenz",
]

BUND_KEYWORDS: list[str] = [
    "Küchengeräte",
    "Ausstattung Wohnbereich",
    "Haustechnik Altenheim",
    "Sanierung Pflegeheim",
    "Haushaltsgeräte Seniorenheim",
]
