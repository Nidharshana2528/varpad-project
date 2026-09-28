from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import heapq
from datetime import datetime

app = Flask(__name__)
CORS(app)

DATABASE = "varpad.db"


# =========================================================
# DATABASE CONNECTION
# =========================================================

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


# =========================================================
# CREATE DATABASE TABLES
# =========================================================

def init_database():

    conn = get_db()
    cursor = conn.cursor()

    # -----------------------------------------------------
    # DESTINATIONS
    # -----------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS destinations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            country TEXT NOT NULL,
            flag TEXT,
            image_url TEXT,
            description TEXT
        )
    """)

    # -----------------------------------------------------
    # ROADS / GRAPH
    # -----------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS roads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            destination TEXT NOT NULL,
            distance REAL NOT NULL
        )
    """)

    # -----------------------------------------------------
    # VEHICLES
    # -----------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_type TEXT NOT NULL,
            vehicle_name TEXT NOT NULL,
            mileage REAL NOT NULL,
            fuel_price REAL NOT NULL
        )
    """)

    # -----------------------------------------------------
    # TRIPS
    # -----------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            members INTEGER NOT NULL,
            starting_location TEXT NOT NULL,
            destinations TEXT NOT NULL,
            duration TEXT NOT NULL,
            vehicle_type TEXT NOT NULL,
            distance REAL,
            fuel_required REAL,
            fuel_cost REAL,
            total_cost REAL,
            cost_per_person REAL,
            trip_date TEXT,
            status TEXT DEFAULT 'Upcoming',
            created_at TEXT
        )
    """)

    conn.commit()

    # =====================================================
    # INSERT SAMPLE DESTINATIONS
    # =====================================================

    destinations = [
        (
            "Bangalore",
            "India",
            "🇮🇳",
            "https://images.unsplash.com/photo-1596176530529-78163a4f7af2",
            "Technology city with modern attractions and beautiful places."
        ),
        (
            "Mysuru",
            "India",
            "🇮🇳",
            "https://images.unsplash.com/photo-1600100397608-f010e9f7f0d0",
            "Famous for Mysore Palace and cultural attractions."
        ),
        (
            "Chennai",
            "India",
            "🇮🇳",
            "https://images.unsplash.com/photo-1582510003544-4d00b7f74220",
            "A major coastal city with beaches and cultural attractions."
        ),
        (
            "Madurai",
            "India",
            "🇮🇳",
            "https://images.unsplash.com/photo-1621339401012-8f5c7a3f4d4a",
            "Historic city famous for Meenakshi Amman Temple."
        ),
        (
            "Dubai",
            "UAE",
            "🇦🇪",
            "https://images.unsplash.com/photo-1512453979798-5ea266f8880c",
            "Modern destination famous for Burj Khalifa and luxury attractions."
        ),
        (
            "Singapore",
            "Singapore",
            "🇸🇬",
            "https://images.unsplash.com/photo-1525625293386-3f8f99389edd",
            "Modern city-state known for Marina Bay and Gardens by the Bay."
        ),
        (
            "Kuala Lumpur",
            "Malaysia",
            "🇲🇾",
            "https://images.unsplash.com/photo-1596422846543-75c6fc197f07",
            "Capital city famous for Petronas Twin Towers."
        ),
        (
            "Bangkok",
            "Thailand",
            "🇹🇭",
            "https://images.unsplash.com/photo-1508009603885-50cf7c579365",
            "Popular destination with temples, markets and city attractions."
        )
    ]

    for item in destinations:
        cursor.execute("""
            INSERT OR IGNORE INTO destinations
            (name, country, flag, image_url, description)
            VALUES (?, ?, ?, ?, ?)
        """, item)

    # =====================================================
    # INSERT VEHICLES
    # =====================================================

    vehicles = [
        ("2 Wheeler", "Bike", 45, 105),
        ("2 Wheeler", "Scooter", 40, 105),
        ("4 Wheeler", "Hatchback Car", 18, 105),
        ("4 Wheeler", "Sedan Car", 15, 105),
        ("4 Wheeler", "SUV", 12, 105)
    ]

    for vehicle in vehicles:
        cursor.execute("""
            INSERT OR IGNORE INTO vehicles
            (vehicle_type, vehicle_name, mileage, fuel_price)
            VALUES (?, ?, ?, ?)
        """, vehicle)

    # =====================================================
    # SAMPLE ROAD NETWORK
    # =====================================================
    #
    # Distance values are demo values for the academic
    # project. They can later be replaced with your own
    # road-network dataset.
    #

    roads = [
        ("Salem", "Bangalore", 200),
        ("Salem", "Mysuru", 190),
        ("Salem", "Erode", 65),
        ("Erode", "Coimbatore", 100),
        ("Coimbatore", "Madurai", 215),
        ("Coimbatore", "Bangalore", 365),
        ("Madurai", "Chennai", 460),
        ("Madurai", "Trichy", 140),
        ("Trichy", "Chennai", 330),
        ("Bangalore", "Mysuru", 145),
        ("Mysuru", "Coorg", 120),
        ("Chennai", "Bangalore", 350),
        ("Chennai", "Pondicherry", 155)
    ]

    for road in roads:

        cursor.execute("""
            SELECT id FROM roads
            WHERE source = ? AND destination = ?
        """, (road[0], road[1]))

        if cursor.fetchone() is None:
            cursor.execute("""
                INSERT INTO roads
                (source, destination, distance)
                VALUES (?, ?, ?)
            """, road)

    conn.commit()
    conn.close()


# =========================================================
# DIJKSTRA SHORTEST PATH
# =========================================================

def build_graph():

    conn = get_db()

    rows = conn.execute("""
        SELECT source, destination, distance
        FROM roads
    """).fetchall()

    conn.close()

    graph = {}

    for row in rows:

        source = row["source"]
        destination = row["destination"]
        distance = row["distance"]

        if source not in graph:
            graph[source] = []

        if destination not in graph:
            graph[destination] = []

        # Undirected graph
        graph[source].append((destination, distance))
        graph[destination].append((source, distance))

    return graph


def dijkstra(start, end):

    graph = build_graph()

    if start not in graph or end not in graph:
        return None

    distances = {
        node: float("inf")
        for node in graph
    }

    previous = {
        node: None
        for node in graph
    }

    distances[start] = 0

    priority_queue = [(0, start)]

    while priority_queue:

        current_distance, current_node = heapq.heappop(priority_queue)

        if current_distance > distances[current_node]:
            continue

        if current_node == end:
            break

        for neighbour, weight in graph[current_node]:

            new_distance = current_distance + weight

            if new_distance < distances[neighbour]:

                distances[neighbour] = new_distance
                previous[neighbour] = current_node

                heapq.heappush(
                    priority_queue,
                    (new_distance, neighbour)
                )

    if distances[end] == float("inf"):
        return None

    # Build route
    path = []
    current = end

    while current is not None:
        path.append(current)
        current = previous[current]

    path.reverse()

    return {
        "route": path,
        "distance": round(distances[end], 2)
    }


# =========================================================
# HOME / SERVER TEST
# =========================================================

@app.route("/")
def home():

    return jsonify({
        "status": "success",
        "message": "VARPAD Backend is running!",
        "project": "Vehicle and Route Planning Application Dashboard"
    })


# =========================================================
# POPULAR DESTINATIONS
# =========================================================

@app.route("/api/destinations", methods=["GET"])
def get_destinations():

    conn = get_db()

    rows = conn.execute("""
        SELECT *
        FROM destinations
        ORDER BY id
    """).fetchall()

    conn.close()

    destinations = [dict(row) for row in rows]

    return jsonify({
        "status": "success",
        "destinations": destinations
    })


# =========================================================
# SEARCH DESTINATION
# =========================================================

@app.route("/api/destinations/search", methods=["GET"])
def search_destination():

    name = request.args.get("name", "").strip()

    if not name:
        return jsonify({
            "status": "error",
            "message": "Destination name is required"
        }), 400

    conn = get_db()

    rows = conn.execute("""
        SELECT *
        FROM destinations
        WHERE name LIKE ?
    """, (f"%{name}%",)).fetchall()

    conn.close()

    return jsonify({
        "status": "success",
        "results": [dict(row) for row in rows]
    })


# =========================================================
# EXPLORE DESTINATION
# =========================================================

@app.route("/api/destinations/<name>", methods=["GET"])
def explore_destination(name):

    conn = get_db()

    row = conn.execute("""
        SELECT *
        FROM destinations
        WHERE LOWER(name) = LOWER(?)
    """, (name,)).fetchone()

    conn.close()

    if row is None:

        return jsonify({
            "status": "error",
            "message": "Destination not found"
        }), 404

    return jsonify({
        "status": "success",
        "destination": dict(row)
    })


# =========================================================
# VEHICLES
# =========================================================

@app.route("/api/vehicles", methods=["GET"])
def get_vehicles():

    conn = get_db()

    rows = conn.execute("""
        SELECT *
        FROM vehicles
        ORDER BY vehicle_type
    """).fetchall()

    conn.close()

    return jsonify({
        "status": "success",
        "vehicles": [dict(row) for row in rows]
    })


# =========================================================
# VEHICLE RECOMMENDATION
# =========================================================

@app.route("/api/recommend-vehicle", methods=["POST"])
def recommend_vehicle():

    data = request.get_json()

    members = int(data.get("members", 1))

    if members <= 2:
        vehicle_type = "2 Wheeler"
    else:
        vehicle_type = "4 Wheeler"

    conn = get_db()

    vehicle = conn.execute("""
        SELECT *
        FROM vehicles
        WHERE vehicle_type = ?
        ORDER BY mileage DESC
        LIMIT 1
    """, (vehicle_type,)).fetchone()

    conn.close()

    if vehicle is None:

        return jsonify({
            "status": "error",
            "message": "Vehicle not available"
        }), 404

    return jsonify({
        "status": "success",
        "reason": f"Recommended based on {members} traveller(s)",
        "vehicle": dict(vehicle)
    })


# =========================================================
# FIND BEST ROUTE
# =========================================================

@app.route("/api/find-route", methods=["POST"])
def find_route():

    data = request.get_json()

    start = data.get("starting_location", "").strip()
    destinations = data.get("destinations", [])

    if not start:
        return jsonify({
            "status": "error",
            "message": "Starting location is required"
        }), 400

    if not destinations:
        return jsonify({
            "status": "error",
            "message": "At least one destination is required"
        }), 400

    if isinstance(destinations, str):
        destinations = [destinations]

    current_location = start

    complete_route = [start]
    total_distance = 0

    # -----------------------------------------------------
    # Visit destinations in entered order
    # -----------------------------------------------------

    for destination in destinations:

        result = dijkstra(
            current_location,
            destination
        )

        if result is None:

            return jsonify({
                "status": "error",
                "message":
                f"No route found from {current_location} to {destination}"
            }), 404

        route = result["route"]

        # Avoid duplicate location
        complete_route.extend(route[1:])

        total_distance += result["distance"]

        current_location = destination

    return jsonify({

        "status": "success",

        "route": complete_route,

        "distance_km": round(total_distance, 2),

        "message": "Shortest route calculated using Dijkstra algorithm"
    })


# =========================================================
# CALCULATE TRIP COST
# =========================================================

@app.route("/api/calculate-trip", methods=["POST"])
def calculate_trip():

    data = request.get_json()

    members = int(data.get("members", 1))

    distance = float(data.get("distance", 0))

    vehicle_type = data.get(
        "vehicle_type",
        "4 Wheeler"
    )

    if members <= 0:
        return jsonify({
            "status": "error",
            "message": "Members must be greater than 0"
        }), 400

    if distance <= 0:
        return jsonify({
            "status": "error",
            "message": "Distance must be greater than 0"
        }), 400

    conn = get_db()

    vehicle = conn.execute("""
        SELECT *
        FROM vehicles
        WHERE vehicle_type = ?
        ORDER BY mileage DESC
        LIMIT 1
    """, (vehicle_type,)).fetchone()

    conn.close()

    if vehicle is None:

        return jsonify({
            "status": "error",
            "message": "Vehicle type not found"
        }), 404

    mileage = vehicle["mileage"]
    fuel_price = vehicle["fuel_price"]

    # -----------------------------------------------------
    # Fuel calculation
    # -----------------------------------------------------

    fuel_required = distance / mileage

    fuel_cost = fuel_required * fuel_price

    # Additional estimated trip cost
    service_cost = distance * 1.50

    total_cost = fuel_cost + service_cost

    cost_per_person = total_cost / members

    return jsonify({

        "status": "success",

        "vehicle": vehicle["vehicle_name"],

        "vehicle_type": vehicle_type,

        "distance_km": round(distance, 2),

        "mileage_km_per_litre": mileage,

        "fuel_required_litres":
        round(fuel_required, 2),

        "fuel_price":
        round(fuel_price, 2),

        "fuel_cost":
        round(fuel_cost, 2),

        "service_cost":
        round(service_cost, 2),

        "total_cost":
        round(total_cost, 2),

        "cost_per_person":
        round(cost_per_person, 2)
    })


# =========================================================
# SAVE TRIP
# =========================================================

@app.route("/api/trips", methods=["POST"])
def save_trip():

    data = request.get_json()

    members = int(data.get("members", 1))
    starting_location = data.get(
        "starting_location",
        ""
    ).strip()

    destinations = data.get(
        "destinations",
        []
    )

    duration = data.get(
        "duration",
        ""
    )

    vehicle_type = data.get(
        "vehicle_type",
        "4 Wheeler"
    )

    distance = float(
        data.get("distance", 0)
    )

    fuel_required = float(
        data.get("fuel_required", 0)
    )

    fuel_cost = float(
        data.get("fuel_cost", 0)
    )

    total_cost = float(
        data.get("total_cost", 0)
    )

    cost_per_person = float(
        data.get("cost_per_person", 0)
    )

    trip_date = data.get(
        "trip_date",
        ""
    )

    if isinstance(destinations, list):
        destinations_text = ", ".join(destinations)
    else:
        destinations_text = str(destinations)

    created_at = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    conn = get_db()

    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO trips
        (
            members,
            starting_location,
            destinations,
            duration,
            vehicle_type,
            distance,
            fuel_required,
            fuel_cost,
            total_cost,
            cost_per_person,
            trip_date,
            status,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        members,
        starting_location,
        destinations_text,
        duration,
        vehicle_type,
        distance,
        fuel_required,
        fuel_cost,
        total_cost,
        cost_per_person,
        trip_date,
        "Upcoming",
        created_at
    ))

    trip_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return jsonify({

        "status": "success",

        "message": "Trip saved successfully",

        "trip_id": trip_id
    })


# =========================================================
# GET ALL TRIPS
# =========================================================

@app.route("/api/trips", methods=["GET"])
def get_trips():

    conn = get_db()

    rows = conn.execute("""
        SELECT *
        FROM trips
        ORDER BY id DESC
    """).fetchall()

    conn.close()

    return jsonify({
        "status": "success",
        "trips": [dict(row) for row in rows]
    })


# =========================================================
# UPCOMING TRIPS
# =========================================================

@app.route("/api/trips/upcoming", methods=["GET"])
def upcoming_trips():

    conn = get_db()

    rows = conn.execute("""
        SELECT *
        FROM trips
        WHERE status = 'Upcoming'
        ORDER BY trip_date
    """).fetchall()

    conn.close()

    return jsonify({
        "status": "success",
        "trips": [dict(row) for row in rows]
    })


# =========================================================
# ONGOING TRIPS
# =========================================================

@app.route("/api/trips/ongoing", methods=["GET"])
def ongoing_trips():

    conn = get_db()

    rows = conn.execute("""
        SELECT *
        FROM trips
        WHERE status = 'Ongoing'
        ORDER BY trip_date
    """).fetchall()

    conn.close()

    return jsonify({
        "status": "success",
        "trips": [dict(row) for row in rows]
    })


# =========================================================
# TRIP HISTORY
# =========================================================

@app.route("/api/trips/history", methods=["GET"])
def trip_history():

    conn = get_db()

    rows = conn.execute("""
        SELECT *
        FROM trips
        WHERE status = 'Completed'
        ORDER BY trip_date DESC
    """).fetchall()

    conn.close()

    return jsonify({
        "status": "success",
        "trips": [dict(row) for row in rows]
    })


# =========================================================
# UPDATE TRIP STATUS
# =========================================================

@app.route("/api/trips/<int:trip_id>/status", methods=["PUT"])
def update_trip_status(trip_id):

    data = request.get_json()

    status = data.get("status", "").strip()

    allowed_status = [
        "Upcoming",
        "Ongoing",
        "Completed"
    ]

    if status not in allowed_status:

        return jsonify({
            "status": "error",
            "message":
            "Status must be Upcoming, Ongoing or Completed"
        }), 400

    conn = get_db()

    cursor = conn.cursor()

    cursor.execute("""
        UPDATE trips
        SET status = ?
        WHERE id = ?
    """, (status, trip_id))

    conn.commit()

    updated = cursor.rowcount

    conn.close()

    if updated == 0:

        return jsonify({
            "status": "error",
            "message": "Trip not found"
        }), 404

    return jsonify({
        "status": "success",
        "message": "Trip status updated"
    })


# =========================================================
# DASHBOARD STATISTICS
# =========================================================

@app.route("/api/dashboard", methods=["GET"])
def dashboard():

    conn = get_db()

    total = conn.execute("""
        SELECT COUNT(*) AS count
        FROM trips
    """).fetchone()["count"]

    upcoming = conn.execute("""
        SELECT COUNT(*) AS count
        FROM trips
        WHERE status = 'Upcoming'
    """).fetchone()["count"]

    ongoing = conn.execute("""
        SELECT COUNT(*) AS count
        FROM trips
        WHERE status = 'Ongoing'
    """).fetchone()["count"]

    completed = conn.execute("""
        SELECT COUNT(*) AS count
        FROM trips
        WHERE status = 'Completed'
    """).fetchone()["count"]

    total_cost = conn.execute("""
        SELECT COALESCE(SUM(total_cost), 0) AS total
        FROM trips
    """).fetchone()["total"]

    total_distance = conn.execute("""
        SELECT COALESCE(SUM(distance), 0) AS total
        FROM trips
    """).fetchone()["total"]

    conn.close()

    return jsonify({

        "status": "success",

        "statistics": {

            "total_trips": total,

            "upcoming_trips": upcoming,

            "ongoing_trips": ongoing,

            "completed_trips": completed,

            "total_distance_km":
            round(total_distance, 2),

            "total_spend":
            round(total_cost, 2)
        }
    })


# =========================================================
# RUN SERVER
# =========================================================

if __name__ == "__main__":

    init_database()

    print("------------------------------------------")
    print("      VARPAD BACKEND SERVER")
    print("------------------------------------------")
    print("Database : varpad.db")
    print("Server   : http://127.0.0.1:5000")
    print("------------------------------------------")

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )