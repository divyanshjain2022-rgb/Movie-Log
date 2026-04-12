#!/usr/bin/env python3
"""
PVR/INOX Box Office Tracker
Tracks real-time ticket sales and revenue for any movie across all cities.
"""

import json
import urllib.request
import time
import csv
import os
from datetime import datetime, timedelta

# ── Config ──────────────────────────────────────────────────────────────
MOVIE_ID = "36040"
MOVIE_NAME = "DHURANDHAR THE REVENGE"

CITIES = [
    # Metros
    "Mumbai", "Delhi-NCR", "Bengaluru", "Hyderabad", "Chennai", "Kolkata",
    "Pune", "Ahmedabad",
    # Tier 1
    "Lucknow", "Jaipur", "Chandigarh", "Kochi", "Thiruvananthapuram",
    "Indore", "Bhopal", "Nagpur", "Vizag", "Coimbatore",
    # Tier 2
    "Surat", "Vadodara", "Nashik", "Aurangabad", "Mysore",
    "Mangalore", "Bhubaneswar", "Patna", "Ranchi", "Guwahati",
    "Dehradun", "Ludhiana", "Amritsar", "Noida", "Gurgaon",
    "Faridabad", "Ghaziabad", "Trivandrum", "Vijayawada",
    "Raipur", "Kanpur", "Varanasi", "Agra",
]

# City lat/long for API (approximate centers)
CITY_COORDS = {
    "Mumbai": ("19.076", "72.8777"),
    "Delhi-NCR": ("28.6139", "77.209"),
    "Bengaluru": ("12.9716", "77.5946"),
    "Hyderabad": ("17.385", "78.4867"),
    "Chennai": ("13.0827", "80.2707"),
    "Kolkata": ("22.5726", "88.3639"),
    "Pune": ("18.5204", "73.8567"),
    "Ahmedabad": ("23.0225", "72.5714"),
    "Lucknow": ("26.8467", "80.9462"),
    "Jaipur": ("26.9124", "75.7873"),
    "Chandigarh": ("30.7333", "76.7794"),
    "Kochi": ("9.9312", "76.2673"),
    "Thiruvananthapuram": ("8.5241", "76.9366"),
    "Indore": ("22.7196", "75.8577"),
    "Bhopal": ("23.2599", "77.4126"),
    "Nagpur": ("21.1458", "79.0882"),
    "Vizag": ("17.6868", "83.2185"),
    "Coimbatore": ("11.0168", "76.9558"),
    "Surat": ("21.1702", "72.8311"),
    "Vadodara": ("22.3072", "73.1812"),
    "Nashik": ("19.9975", "73.7898"),
    "Aurangabad": ("19.8762", "75.3433"),
    "Mysore": ("12.2958", "76.6394"),
    "Mangalore": ("12.9141", "74.856"),
    "Bhubaneswar": ("20.2961", "85.8245"),
    "Patna": ("25.6093", "85.1376"),
    "Ranchi": ("23.3441", "85.3096"),
    "Guwahati": ("26.1445", "91.7362"),
    "Dehradun": ("30.3165", "78.0322"),
    "Ludhiana": ("30.901", "75.8573"),
    "Amritsar": ("31.634", "74.8723"),
    "Noida": ("28.5355", "77.391"),
    "Gurgaon": ("28.4595", "77.0266"),
    "Faridabad": ("28.4089", "77.3178"),
    "Ghaziabad": ("28.6692", "77.4538"),
    "Trivandrum": ("8.5241", "76.9366"),
    "Vijayawada": ("16.5062", "80.648"),
    "Raipur": ("21.2514", "81.6296"),
    "Kanpur": ("26.4499", "80.3319"),
    "Varanasi": ("25.3176", "82.9739"),
    "Agra": ("27.1767", "78.0081"),
}

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "box_office_data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate, br",
    "Authorization": "Bearer",
    "chain": "PVR",
    "appVersion": "1.0",
    "platform": "WEBSITE",
    "country": "INDIA",
    "Origin": "https://www.pvrcinemas.com",
}


def fetch_sessions(city, movie_id, dated="NA"):
    """Fetch all showtimes for a movie in a city."""
    lat, lon = CITY_COORDS.get(city, ("20.0", "78.0"))
    headers = dict(HEADERS)
    headers["city"] = city

    body = json.dumps({
        "city": city,
        "mid": movie_id,
        "experience": "ALL",
        "specialTag": "ALL",
        "lat": lat,
        "lng": lon,
        "lang": "ALL",
        "format": "ALL",
        "dated": dated,
        "time": "08:00-24:00",
        "cinetype": "ALL",
        "hc": "ALL",
        "adFree": False,
    }).encode()

    req = urllib.request.Request(
        "https://api3.pvrcinemas.com/api/v1/booking/content/msessions",
        data=body, headers=headers, method="POST"
    )

    try:
        resp = urllib.request.urlopen(req, timeout=15)
        # Handle compressed response
        encoding = resp.headers.get("Content-Encoding", "")
        raw = resp.read()
        if encoding == "gzip":
            import gzip
            raw = gzip.decompress(raw)
        elif encoding == "br":
            try:
                import brotli
                raw = brotli.decompress(raw)
            except ImportError:
                pass
        return json.loads(raw)
    except Exception as e:
        return {"error": str(e)}


def process_city(city, movie_id):
    """Process all cinemas in a city, return aggregated data."""
    data = fetch_sessions(city, movie_id)

    if "error" in data:
        return None

    output = data.get("output")
    if not output or not isinstance(output, dict):
        return None
    sessions = output.get("movieCinemaSessions", [])
    if not sessions:
        return None

    city_results = {
        "city": city,
        "cinemas": [],
        "total_seats": 0,
        "sold_seats": 0,
        "shows": 0,
        "revenue_low": 0,   # min price per show
        "revenue_high": 0,  # max price per show
        "formats": {},
        "dates": {},
    }

    for cinema in sessions:
        cinema_name = cinema["cinema"]["name"]
        cinema_data = {
            "name": cinema_name,
            "total_seats": 0,
            "sold_seats": 0,
            "shows": 0,
        }

        for exp in cinema.get("experienceSessions", []):
            fmt = exp.get("experience") or "Regular"

            for show in exp.get("shows", []):
                total = show.get("totalSeats", 0)
                avail = show.get("availableSeats", 0)
                sold = total - avail
                prices = [int(p) for p in show.get("pricing", []) if str(p).isdigit()]
                date = show.get("showDate", "")
                show_time = show.get("showTime", "")

                min_price = min(prices) if prices else 0
                max_price = max(prices) if prices else 0

                # Revenue estimate: sold × avg of min/max price
                rev_low = sold * min_price
                rev_high = sold * max_price

                cinema_data["total_seats"] += total
                cinema_data["sold_seats"] += sold
                cinema_data["shows"] += 1

                city_results["total_seats"] += total
                city_results["sold_seats"] += sold
                city_results["shows"] += 1
                city_results["revenue_low"] += rev_low
                city_results["revenue_high"] += rev_high

                # Format breakdown
                if fmt not in city_results["formats"]:
                    city_results["formats"][fmt] = {
                        "total": 0, "sold": 0, "revenue_low": 0,
                        "revenue_high": 0, "min_price": 99999, "max_price": 0
                    }
                f = city_results["formats"][fmt]
                f["total"] += total
                f["sold"] += sold
                f["revenue_low"] += rev_low
                f["revenue_high"] += rev_high
                if min_price > 0:
                    f["min_price"] = min(f["min_price"], min_price)
                f["max_price"] = max(f["max_price"], max_price)

                # Date breakdown
                if date not in city_results["dates"]:
                    city_results["dates"][date] = {"total": 0, "sold": 0, "rev_low": 0, "rev_high": 0}
                d = city_results["dates"][date]
                d["total"] += total
                d["sold"] += sold
                d["rev_low"] += rev_low
                d["rev_high"] += rev_high

        city_results["cinemas"].append(cinema_data)

    return city_results


def format_currency(amount):
    """Format amount in lakhs/crores."""
    if amount >= 10000000:
        return f"₹{amount/10000000:.2f} Cr"
    elif amount >= 100000:
        return f"₹{amount/100000:.2f}L"
    else:
        return f"₹{amount:,.0f}"


def run_tracker():
    """Main tracker function."""
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    print(f"\n{'='*70}")
    print(f"  PVR/INOX BOX OFFICE TRACKER — {MOVIE_NAME}")
    print(f"  Snapshot: {datetime.now().strftime('%B %d, %Y %I:%M %p')}")
    print(f"{'='*70}\n")

    all_results = []
    grand_total = 0
    grand_sold = 0
    grand_rev_low = 0
    grand_rev_high = 0
    grand_shows = 0
    all_formats = {}
    all_dates = {}
    cities_with_data = 0

    for i, city in enumerate(CITIES):
        print(f"  [{i+1}/{len(CITIES)}] {city}...", end=" ", flush=True)
        result = process_city(city, MOVIE_ID)

        if result is None:
            print("No shows")
            continue

        cities_with_data += 1
        occ = (result["sold_seats"] / result["total_seats"] * 100) if result["total_seats"] > 0 else 0
        rev_avg = (result["revenue_low"] + result["revenue_high"]) // 2

        print(f"{result['sold_seats']:,} / {result['total_seats']:,} seats "
              f"({occ:.0f}%) | {len(result['cinemas'])} cinemas | "
              f"~{format_currency(rev_avg)}")

        all_results.append(result)
        grand_total += result["total_seats"]
        grand_sold += result["sold_seats"]
        grand_rev_low += result["revenue_low"]
        grand_rev_high += result["revenue_high"]
        grand_shows += result["shows"]

        # Merge formats
        for fmt, fdata in result["formats"].items():
            if fmt not in all_formats:
                all_formats[fmt] = {"total": 0, "sold": 0, "rev_low": 0, "rev_high": 0}
            all_formats[fmt]["total"] += fdata["total"]
            all_formats[fmt]["sold"] += fdata["sold"]
            all_formats[fmt]["rev_low"] += fdata["revenue_low"]
            all_formats[fmt]["rev_high"] += fdata["revenue_high"]

        # Merge dates
        for dt, ddata in result["dates"].items():
            if dt not in all_dates:
                all_dates[dt] = {"total": 0, "sold": 0, "rev_low": 0, "rev_high": 0}
            all_dates[dt]["total"] += ddata["total"]
            all_dates[dt]["sold"] += ddata["sold"]
            all_dates[dt]["rev_low"] += ddata["rev_low"]
            all_dates[dt]["rev_high"] += ddata["rev_high"]

        time.sleep(0.3)  # Be gentle

    # ── Summary ──────────────────────────────────────────────────────
    grand_occ = (grand_sold / grand_total * 100) if grand_total > 0 else 0
    rev_avg = (grand_rev_low + grand_rev_high) // 2

    print(f"\n{'='*70}")
    print(f"  NATIONAL SUMMARY — {MOVIE_NAME}")
    print(f"{'='*70}")
    print(f"  Cities with shows:  {cities_with_data}")
    print(f"  Total shows:        {grand_shows:,}")
    print(f"  Total seats:        {grand_total:,}")
    print(f"  Tickets sold:       {grand_sold:,}")
    print(f"  Occupancy:          {grand_occ:.1f}%")
    print(f"  Revenue estimate:   {format_currency(grand_rev_low)} — {format_currency(grand_rev_high)}")
    print(f"  Best estimate:      {format_currency(rev_avg)}")

    # ── By Date ──────────────────────────────────────────────────────
    print(f"\n  {'─'*50}")
    print(f"  BY DATE")
    print(f"  {'─'*50}")
    for dt in sorted(all_dates.keys()):
        d = all_dates[dt]
        occ = (d["sold"] / d["total"] * 100) if d["total"] > 0 else 0
        avg = (d["rev_low"] + d["rev_high"]) // 2
        day_name = datetime.strptime(dt, "%Y-%m-%d").strftime("%A") if dt else "?"
        print(f"  {dt} ({day_name}): {d['sold']:,}/{d['total']:,} ({occ:.0f}%) → ~{format_currency(avg)}")

    # ── By Format ────────────────────────────────────────────────────
    print(f"\n  {'─'*50}")
    print(f"  BY FORMAT")
    print(f"  {'─'*50}")
    for fmt in sorted(all_formats.keys(), key=lambda f: all_formats[f]["sold"], reverse=True):
        f = all_formats[fmt]
        occ = (f["sold"] / f["total"] * 100) if f["total"] > 0 else 0
        avg = (f["rev_low"] + f["rev_high"]) // 2
        print(f"  {fmt:20s}: {f['sold']:>6,}/{f['total']:>6,} ({occ:.0f}%) → ~{format_currency(avg)}")

    # ── Top Cities ───────────────────────────────────────────────────
    print(f"\n  {'─'*50}")
    print(f"  TOP 15 CITIES BY REVENUE")
    print(f"  {'─'*50}")
    all_results.sort(key=lambda r: (r["revenue_low"] + r["revenue_high"]) // 2, reverse=True)
    for r in all_results[:15]:
        occ = (r["sold_seats"] / r["total_seats"] * 100) if r["total_seats"] > 0 else 0
        avg = (r["revenue_low"] + r["revenue_high"]) // 2
        print(f"  {r['city']:20s}: {r['sold_seats']:>6,} tickets ({occ:.0f}%) → ~{format_currency(avg)}")

    # ── Save to CSV ──────────────────────────────────────────────────
    csv_file = os.path.join(OUTPUT_DIR, f"{MOVIE_NAME.replace(' ', '_')}_{timestamp}.csv")
    with open(csv_file, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "City", "Cinemas", "Shows", "Total Seats", "Sold Seats",
            "Occupancy %", "Revenue Low", "Revenue High", "Revenue Avg"
        ])
        for r in all_results:
            occ = (r["sold_seats"] / r["total_seats"] * 100) if r["total_seats"] > 0 else 0
            avg = (r["revenue_low"] + r["revenue_high"]) // 2
            writer.writerow([
                r["city"], len(r["cinemas"]), r["shows"], r["total_seats"],
                r["sold_seats"], f"{occ:.1f}", r["revenue_low"], r["revenue_high"], avg
            ])
        # Grand total row
        writer.writerow([
            "TOTAL", cities_with_data, grand_shows, grand_total, grand_sold,
            f"{grand_occ:.1f}", grand_rev_low, grand_rev_high, rev_avg
        ])

    print(f"\n  Data saved to: {csv_file}")

    # ── Save JSON snapshot ───────────────────────────────────────────
    json_file = os.path.join(OUTPUT_DIR, f"{MOVIE_NAME.replace(' ', '_')}_{timestamp}.json")
    snapshot = {
        "movie": MOVIE_NAME,
        "movie_id": MOVIE_ID,
        "timestamp": datetime.now().isoformat(),
        "national": {
            "cities": cities_with_data,
            "shows": grand_shows,
            "total_seats": grand_total,
            "sold_seats": grand_sold,
            "occupancy": round(grand_occ, 1),
            "revenue_low": grand_rev_low,
            "revenue_high": grand_rev_high,
            "revenue_avg": rev_avg,
        },
        "by_date": {dt: all_dates[dt] for dt in sorted(all_dates.keys())},
        "by_format": all_formats,
        "by_city": [{
            "city": r["city"],
            "cinemas": len(r["cinemas"]),
            "shows": r["shows"],
            "total_seats": r["total_seats"],
            "sold_seats": r["sold_seats"],
            "revenue_low": r["revenue_low"],
            "revenue_high": r["revenue_high"],
        } for r in all_results],
    }
    with open(json_file, "w") as f:
        json.dump(snapshot, f, indent=2)

    print(f"  JSON saved to: {json_file}")
    print(f"\n{'='*70}\n")


if __name__ == "__main__":
    run_tracker()
