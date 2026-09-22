#!/usr/bin/env python3
"""Scrapes lunch/breakfast/snack menus from Nutrislice and downloads food photos.

Covers two schools:
  - ES University Hills (lunch only, kids pick one path + sides)
  - Caring Steps Pre-K (breakfast/lunch/snack, no choices -- just served)

Uses only the Python standard library so it runs on a stock macOS Python 3
install with no pip installs required. Run directly, or let server.py trigger
it from the app's Refresh & Publish button.
"""
import json
import os
import urllib.request
import urllib.error
from datetime import date, timedelta

DISTRICT = "rochesterk12"
API_BASE = f"https://{DISTRICT}.api.nutrislice.com/menu/api/weeks/school"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "docs", "data")
IMAGES_DIR = os.path.join(DATA_DIR, "images")

# How wide a window to scrape around today. New months appear on Nutrislice
# roughly monthly, so a rolling window means re-running this later just
# naturally picks up newly published months without any code changes.
DAYS_BACK = 30
DAYS_FORWARD = 180

MEAL_PATH_SECTIONS = {"Lunch", "On the Go", "Alternate Entrees", "Veg Out"}
SIDE_SECTIONS = {"Sides for All Meals"}
FRUIT_VEG_SECTIONS = {"Fruit & Vegetable Bar"}
MILK_CONDIMENT_SECTIONS = {"Milk & Condiments"}

# U Hills doesn't want strawberry milk offered as a choice.
EXCLUDED_MILK_NAMES = {"strawberry low fat milk"}


def fetch_week(school_slug, menu_type, d):
    url = f"{API_BASE}/{school_slug}/menu-type/{menu_type}/{d.year}/{d.month:02d}/{d.day:02d}/"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (UniversityHillsLunchApp)"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


def next_saturday(d):
    # Nutrislice's weekly API returns the 7 days ending on the queried date,
    # so stepping through Saturdays gives full, non-overlapping coverage.
    days_ahead = (5 - d.weekday()) % 7
    return d + timedelta(days=days_ahead)


def download_image(url, food_id):
    if not url:
        return None
    ext = os.path.splitext(url.split("?")[0])[1].lstrip(".") or "png"
    if len(ext) > 4:
        ext = "png"
    filename = f"{food_id}.{ext}"
    path = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(path):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as resp, open(path, "wb") as f:
                f.write(resp.read())
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            print(f"  ! failed to download image for food {food_id}: {e}")
            return None
    return f"images/{filename}"


def simplify_food(food):
    image_path = download_image(food.get("image_url"), food["id"])
    icons = [
        icon.get("synced_name") or icon.get("name")
        for icon in food.get("icons", {}).get("food_icons", [])
    ]
    return {
        "id": food["id"],
        "name": food["name"],
        "description": food.get("description") or "",
        "category": food.get("food_category") or "",
        "image": image_path,
        "allergens": [i for i in icons if i],
    }


def parse_sections(day):
    sections = []
    current = None
    for item in day.get("menu_items", []):
        if item.get("is_section_title"):
            current = {"section": item.get("text") or "Menu", "items": []}
            sections.append(current)
            continue
        food = item.get("food")
        if not food or current is None:
            continue
        current["items"].append(simplify_food(food))
    return sections


def scrape_weeks(school_slug, menu_type, today):
    """Fetches every week in the rolling window for one school + menu type."""
    start = today - timedelta(days=DAYS_BACK)
    end = today + timedelta(days=DAYS_FORWARD)
    anchor = next_saturday(start)
    days_by_date = {}
    week_count = 0
    while anchor <= end:
        try:
            week = fetch_week(school_slug, menu_type, anchor)
            week_count += 1
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            print(f"  ! failed to fetch {school_slug}/{menu_type} week of {anchor}: {e}")
            anchor += timedelta(days=7)
            continue
        for day in week.get("days", []):
            days_by_date[day["date"]] = parse_sections(day)
        anchor += timedelta(days=7)
    return days_by_date, week_count


def build_choice_day(sections):
    """University Hills style: kids pick one of several meal paths."""
    meal_paths = []
    sides = []
    fruit_veg = []
    milks = []
    condiments = []
    for sec in sections:
        name = sec["section"]
        if name in MEAL_PATH_SECTIONS:
            if sec["items"]:
                meal_paths.append(sec)
        elif name in SIDE_SECTIONS:
            sides.extend(sec["items"])
        elif name in FRUIT_VEG_SECTIONS:
            fruit_veg.extend(sec["items"])
        elif name in MILK_CONDIMENT_SECTIONS:
            for it in sec["items"]:
                if it["category"] == "beverage":
                    if it["name"].strip().lower() not in EXCLUDED_MILK_NAMES:
                        milks.append(it)
                else:
                    condiments.append(it)
    if not meal_paths:
        return None
    return {
        "meal_paths": meal_paths,
        "sides_for_all": sides,
        "fruit_veg_bar": fruit_veg,
        "milks": milks,
        "condiments": condiments,
    }


def scrape_uhills(today):
    days_by_date, week_count = scrape_weeks("university-hills", "lunch", today)
    days_out = {}
    for d, sections in days_by_date.items():
        entry = build_choice_day(sections)
        if entry:
            days_out[d] = entry
    return {
        "generated_at": today.isoformat(),
        "school": "ES University Hills",
        "days": days_out,
    }, week_count


def scrape_prek(today):
    """Caring Steps style: no choices, just what's served -- flat lists per meal."""
    days_out = {}
    total_weeks = 0
    for menu_type in ("breakfast", "lunch", "snack"):
        days_by_date, week_count = scrape_weeks("caring-steps", menu_type, today)
        total_weeks += week_count
        for d, sections in days_by_date.items():
            items = [item for sec in sections for item in sec["items"]]
            if not items:
                continue
            days_out.setdefault(d, {})[menu_type] = items
    return {
        "generated_at": today.isoformat(),
        "school": "Caring Steps",
        "days": days_out,
    }, total_weeks


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)
    today = date.today()

    uhills, uhills_weeks = scrape_uhills(today)
    with open(os.path.join(DATA_DIR, "uhills.json"), "w") as f:
        json.dump(uhills, f, indent=2)
    print(f"U Hills: scraped {uhills_weeks} weeks, {len(uhills['days'])} days with menus.")

    prek, prek_weeks = scrape_prek(today)
    with open(os.path.join(DATA_DIR, "prek.json"), "w") as f:
        json.dump(prek, f, indent=2)
    print(f"Pre-K: scraped {prek_weeks} weeks, {len(prek['days'])} days with menus.")


if __name__ == "__main__":
    main()
