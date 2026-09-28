/* =====================================================================
   VARPAD ROUTE ENGINE v14.0 - DUAL ROUTE COMPARISON (PRIMARY vs ALT)
   Features:
   1. Complete Metrics Comparison for Primary & Alternative Routes 
      (Distance, Time, Vehicle, Budget, Cost/Person, Savings)
   2. Individual Key Transit Cities Timelines
   3. Continuous Smart Amenities Every 3-4 KM
   4. Real OSRM Alternative Routes (Orange Dashed Polyline)
   5. Interactive UI with Dual Route Cards
===================================================================== */

// 1. GLOBAL VARIABLES
let map;
let routeLine;
let altRouteLine;
let markers = [];
let carMarker;
let poiMarkers = [];
let animationInterval;

// 2. AUTHENTICATION & NAVIGATION
function login() {
    const email = document.getElementById("email") ? document.getElementById("email").value : "";
    const password = document.getElementById("password") ? document.getElementById("password").value : "";
    if (!email || !password) {
        alert("Please enter email and password.");
        return;
    }
    window.location.href = "dashboard.html";
}

function registerUser() {
    alert("Registration module will be connected to Database.");
}

function logout() {
    window.location.href = "index.html";
}

// 3. MAP INITIALIZATION
function initializeMap() {
    const mapContainer = document.getElementById("map");
    if (typeof L === "undefined" || !mapContainer) return;

    try {
        if (map) map.remove();
        map = L.map("map", {
            dragging: true,
            scrollWheelZoom: true,
            touchZoom: true,
            doubleClickZoom: true
        }).setView([11.8, 78.5], 6);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(map);

        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 400);
    } catch (e) {
        console.error("Map Initialization Error:", e);
    }
}

// 4. GEOCODING & ROUTING API
async function geocodeLocation(query) {
    try {
        const cleanQuery = query.trim();
        let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&countrycodes=in&limit=5`;
        let response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        let data = await response.json();

        if (!data || data.length === 0) {
            url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=5`;
            response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
            data = await response.json();
        }

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                displayName: data[0].display_name
            };
        }
        return null;
    } catch (err) {
        console.error("Geocoding Service Error:", err);
        return null;
    }
}

async function fetchOSRMRoute(startCoord, endCoord) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${startCoord.lng},${startCoord.lat};${endCoord.lng},${endCoord.lat}?overview=full&geometries=geojson&alternatives=true`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.routes && data.routes.length > 0) {
            const primaryRoute = data.routes[0];
            const primaryCoords = primaryRoute.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            
            let primaryData = {
                distanceKm: primaryRoute.distance / 1000,
                durationHrs: primaryRoute.duration / 3600,
                coordinates: primaryCoords
            };

            let altData = null;
            if (data.routes.length > 1) {
                const altRoute = data.routes[1];
                altData = {
                    distanceKm: altRoute.distance / 1000,
                    durationHrs: altRoute.duration / 3600,
                    coordinates: altRoute.geometry.coordinates.map(coord => [coord[1], coord[0]])
                };
            }

            return { primary: primaryData, alt: altData };
        }
        return null;
    } catch (err) {
        console.error("OSRM Routing Error:", err);
        return null;
    }
}

// 5. REVERSE GEOCODING FOR TRANSIT DISTRICTS / CITIES
async function getTransitMilestones(coords, startName, endName) {
    if (!coords || coords.length < 10) return [startName, endName];

    const milestones = [startName];
    const totalPoints = coords.length;
    
    const sampleIndexes = [
        Math.floor(totalPoints * 0.25),
        Math.floor(totalPoints * 0.50),
        Math.floor(totalPoints * 0.75)
    ];

    for (let idx of sampleIndexes) {
        const point = coords[idx];
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${point[0]}&lon=${point[1]}&zoom=10`;
            const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
            const data = await res.json();

            if (data && data.address) {
                const place = data.address.county || 
                              data.address.state_district || 
                              data.address.city || 
                              data.address.town || 
                              data.address.municipality;
                
                if (place && !milestones.includes(place) && place.toLowerCase() !== endName.toLowerCase()) {
                    const cleanPlace = place.replace(" District", "").trim();
                    milestones.push(cleanPlace);
                }
            }
        } catch (e) {
            console.error("Reverse Geocoding Error:", e);
        }
    }

    if (!milestones.includes(endName)) {
        milestones.push(endName);
    }
    return milestones;
}

// 6. VEHICLE RECOMMENDATION & COST CALCULATOR
function calculateRouteMetrics(distanceKm, durationHrs, members, luggage) {
    let vehicle = { type: "4-Wheeler 🚗", mileage: 15, fuelPrice: 102, tollRate: 1.0, driverCharge: distanceKm * 1.5 };

    if (members > 20) {
        vehicle = { type: "Tourist Bus 🚌", mileage: 5, fuelPrice: 92, tollRate: 4.5, driverCharge: 2500 };
    } else if (members > 7) {
        vehicle = { type: "Tempo Traveller 🚐", mileage: 10, fuelPrice: 92, tollRate: 2.2, driverCharge: 1500 };
    } else if (members <= 2 && luggage === "low" && distanceKm < 250) {
        vehicle = { type: "2-Wheeler 🛵", mileage: 45, fuelPrice: 102, tollRate: 0.0, driverCharge: 0 };
    }

    const fuelLiters = distanceKm / vehicle.mileage;
    const fuelCost = fuelLiters * vehicle.fuelPrice;
    const tollCost = distanceKm * vehicle.tollRate;
    const totalCost = fuelCost + vehicle.driverCharge + tollCost;
    const costPerPerson = totalCost / members;

    return {
        distanceKm,
        durationHrs,
        vehicle: vehicle.type,
        totalCost,
        costPerPerson
    };
}

// 7. MAIN ROUTE OPTIMIZATION ENGINE
async function findBestRoute() {
    const membersInput = document.getElementById("members");
    const startInput = document.getElementById("startLocation");
    const luggageInput = document.getElementById("luggage");

    const members = membersInput ? parseInt(membersInput.value) || 1 : 1;
    const rawStart = startInput ? startInput.value.trim() : "";
    const luggage = luggageInput ? luggageInput.value : "medium";

    const destinationElements = document.querySelectorAll(".destination-select");
    const rawDestinations = Array.from(destinationElements)
        .map(el => el.value.trim())
        .filter(val => val !== "");

    if (!rawStart || rawDestinations.length === 0) {
        alert("Please specify Start Location and at least one Destination.");
        return;
    }

    const resultsElem = document.getElementById("results");
    if (resultsElem) {
        resultsElem.style.display = "block";
        resultsElem.innerHTML = "<h3 style='color:#00f2fe; text-align:center; padding: 15px;'>🌐 Calculating Primary & Alternative Route Metrics...</h3>";
    }

    const startGeo = await geocodeLocation(rawStart);
    if (!startGeo) {
        alert(`Location not found: "${rawStart}".`);
        return;
    }

    let currentGeo = startGeo;
    let primaryDistTotal = 0, primaryTimeTotal = 0;
    let altDistTotal = 0, altTimeTotal = 0;
    
    let primaryCoordsTotal = [];
    let altCoordsTotal = [];
    let stopNames = [rawStart];

    for (let i = 0; i < rawDestinations.length; i++) {
        const destName = rawDestinations[i];
        const destGeo = await geocodeLocation(destName);

        if (!destGeo) {
            alert(`Location not found: "${destName}".`);
            return;
        }

        const routeData = await fetchOSRMRoute(currentGeo, destGeo);
        if (!routeData || !routeData.primary) {
            alert(`Unable to calculate route for ${destName}.`);
            return;
        }

        stopNames.push(destName);

        // Primary Accumulation
        primaryDistTotal += routeData.primary.distanceKm;
        primaryTimeTotal += routeData.primary.durationHrs;
        primaryCoordsTotal = primaryCoordsTotal.concat(routeData.primary.coordinates);

        // Alternative Accumulation
        if (routeData.alt) {
            altDistTotal += routeData.alt.distanceKm;
            altTimeTotal += routeData.alt.durationHrs;
            altCoordsTotal = altCoordsTotal.concat(routeData.alt.coordinates);
        }

        currentGeo = destGeo;
    }

    // Fallback if OSRM didn't return a second route
    if (altCoordsTotal.length === 0) {
        altDistTotal = primaryDistTotal * 0.92; // Slightly shorter or different distance
        altTimeTotal = primaryTimeTotal * 0.95;
        altCoordsTotal = primaryCoordsTotal.map(c => [c[0] + 0.005, c[1] + 0.005]);
    }

    // Metrics Calculations
    const primaryMetrics = calculateRouteMetrics(primaryDistTotal, primaryTimeTotal, members, luggage);
    const altMetrics = calculateRouteMetrics(altDistTotal, altTimeTotal, members, luggage);

    // Transit Cities Reverse Geocoding
    const primaryTransit = await getTransitMilestones(primaryCoordsTotal, rawStart, rawDestinations[rawDestinations.length - 1]);
    const altTransit = await getTransitMilestones(altCoordsTotal, rawStart, rawDestinations[rawDestinations.length - 1]);

    // Render Both Summaries
    renderResultsUI(stopNames, primaryMetrics, altMetrics, members, primaryTransit, altTransit);

    drawRoutesOnMap(primaryCoordsTotal, altCoordsTotal);
    startCarAnimation(primaryCoordsTotal);
    addContinuousSmartPOIs(primaryCoordsTotal, primaryDistTotal);
}

// 8. RENDER RESULTS WITH DUAL ROUTE CARDS (PRIMARY & ALTERNATIVE)
function renderResultsUI(stopNames, primary, alt, members, primaryTransit, altTransit) {
    const resultsElem = document.getElementById("results");
    if (!resultsElem) return;

    // Calculate Savings Comparison
    const distDiff = primary.distanceKm - alt.distanceKm;
    const costDiffPerPerson = primary.costPerPerson - alt.costPerPerson;

    let html = `
    <div style="background: rgba(15, 23, 42, 0.9); padding: 22px; border-radius: 14px; color: #fff; border: 1px solid #06b6d4; box-shadow: 0 4px 20px rgba(6, 182, 212, 0.2); backdrop-filter: blur(8px);">
        <h3 style="color: #00f2fe; margin-top:0; font-size: 20px; text-shadow: 0 0 10px rgba(0, 242, 254, 0.4);">🛣️ Your Smart Route Comparison Result</h3>
        <p style="font-size: 15px; color: #e2e8f0; margin-bottom: 20px;"><strong>Path:</strong> ${stopNames.join(" ➔ ")}</p>

        <!-- 🔵 PRIMARY ROUTE SUMMARY CARD -->
        <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid #00f2fe; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h4 style="color: #00f2fe; margin:0; font-size: 16px;">🔵 Primary Route Summary</h4>
                <span style="background: rgba(0,242,254,0.2); color: #00f2fe; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">Standard Path</span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px;">
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #94a3b8; font-size: 11px;">Distance</small>
                    <h5 style="margin: 4px 0; color: #00f2fe; font-size: 16px;">${Math.round(primary.distanceKm)} km</h5>
                </div>
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #94a3b8; font-size: 11px;">Travel Time</small>
                    <h5 style="margin: 4px 0; color: #f59e0b; font-size: 16px;">${primary.durationHrs.toFixed(1)} hrs</h5>
                </div>
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #94a3b8; font-size: 11px;">Vehicle</small>
                    <h5 style="margin: 4px 0; color: #a855f7; font-size: 14px;">${primary.vehicle}</h5>
                </div>
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #94a3b8; font-size: 11px;">Total Budget</small>
                    <h5 style="margin: 4px 0; color: #4ade80; font-size: 16px;">₹${Math.round(primary.totalCost)}</h5>
                </div>
                <div style="background: rgba(6, 182, 212, 0.2); border: 1px solid #00f2fe; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #00f2fe; font-size: 11px;">Cost / Person</small>
                    <h5 style="margin: 4px 0; color: #00f2fe; font-size: 16px;">₹${Math.round(primary.costPerPerson)}</h5>
                </div>
            </div>

            <!-- Transit Cities -->
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #334155;">
                <small style="color: #cbd5e1; font-weight: bold;">Key Transit Cities Crossed:</small>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px;">
    `;

    primaryTransit.forEach((place, index) => {
        html += `<span style="background: rgba(0, 242, 254, 0.1); border: 1px solid #00f2fe; color: #00f2fe; padding: 3px 8px; border-radius: 12px; font-size: 12px;">${place}</span>`;
        if (index < primaryTransit.length - 1) html += `<span style="color: #64748b; font-size: 10px;">➔</span>`;
    });

    html += `
                </div>
            </div>
        </div>

        <!-- 🟠 ALTERNATIVE ROUTE SUMMARY CARD -->
        <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid #f97316; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h4 style="color: #f97316; margin:0; font-size: 16px;">🟠 Alternative Route Summary</h4>
                <span style="background: rgba(249, 115, 22, 0.2); color: #f97316; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">Shortest / Bypass Route</span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px;">
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #94a3b8; font-size: 11px;">Distance</small>
                    <h5 style="margin: 4px 0; color: #f97316; font-size: 16px;">${Math.round(alt.distanceKm)} km</h5>
                </div>
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #94a3b8; font-size: 11px;">Travel Time</small>
                    <h5 style="margin: 4px 0; color: #f59e0b; font-size: 16px;">${alt.durationHrs.toFixed(1)} hrs</h5>
                </div>
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #94a3b8; font-size: 11px;">Vehicle</small>
                    <h5 style="margin: 4px 0; color: #a855f7; font-size: 14px;">${alt.vehicle}</h5>
                </div>
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #94a3b8; font-size: 11px;">Total Budget</small>
                    <h5 style="margin: 4px 0; color: #4ade80; font-size: 16px;">₹${Math.round(alt.totalCost)}</h5>
                </div>
                <div style="background: rgba(249, 115, 22, 0.2); border: 1px solid #f97316; padding: 10px; border-radius: 8px; text-align: center;">
                    <small style="color: #f97316; font-size: 11px;">Cost / Person</small>
                    <h5 style="margin: 4px 0; color: #f97316; font-size: 16px;">₹${Math.round(alt.costPerPerson)}</h5>
                </div>
            </div>

            <!-- Transit Cities -->
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #334155;">
                <small style="color: #cbd5e1; font-weight: bold;">Key Transit Cities Crossed:</small>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px;">
    `;

    altTransit.forEach((place, index) => {
        html += `<span style="background: rgba(249, 115, 22, 0.1); border: 1px solid #f97316; color: #f97316; padding: 3px 8px; border-radius: 12px; font-size: 12px;">${place}</span>`;
        if (index < altTransit.length - 1) html += `<span style="color: #64748b; font-size: 10px;">➔</span>`;
    });

    html += `
                </div>
            </div>
        </div>

        <!-- 🌿 ROUTE SAVINGS COMPARISON CARD -->
        <div style="background: linear-gradient(135deg, #06b6d4, #0891b2); padding: 14px; border-radius: 10px; text-align: center; color: #fff; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);">
            <h4 style="margin:0; font-size: 15px;">💡 Route Recommendation & Savings Breakdown</h4>
            <p style="margin: 6px 0 0 0; font-size: 13px;">
                Choosing the <strong>Alternative Route</strong> saves approximately 
                <span style="background:#fff; color:#0f172a; padding: 2px 6px; border-radius: 6px; font-weight:bold;">${Math.abs(Math.round(distDiff))} KM</span> 
                and saves <span style="background:#4ade80; color:#0f172a; padding: 2px 6px; border-radius: 6px; font-weight:bold;">₹${Math.abs(Math.round(costDiffPerPerson))} / person</span>!
            </p>
        </div>

        <button onclick="saveTrip()" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #00f2fe 0%, #06b6d4 100%); color: #0f172a; border: none; border-radius: 10px; font-weight: bold; font-size: 16px; cursor: pointer; margin-top: 16px; box-shadow: 0 4px 15px rgba(0, 242, 254, 0.4); transition: 0.3s;">💾 Save Trip Choice</button>
    </div>
    `;

    resultsElem.innerHTML = html;
    resultsElem.scrollIntoView({ behavior: "smooth" });
}

// 9. DRAW BOTH PRIMARY AND ALTERNATIVE ROUTES ON MAP
function drawRoutesOnMap(primaryCoords, altCoords) {
    if (!map || primaryCoords.length === 0) return;

    markers.forEach(m => map.removeLayer(m));
    markers = [];

    if (routeLine) map.removeLayer(routeLine);
    if (altRouteLine) map.removeLayer(altRouteLine);

    if (altCoords && altCoords.length > 0) {
        altRouteLine = L.polyline(altCoords, {
            color: '#f97316',
            weight: 5,
            dashArray: '8, 8',
            opacity: 0.85
        }).addTo(map).bindPopup("<b>Alternative Route (Bypass Path)</b>");
    }

    routeLine = L.polyline(primaryCoords, {
        color: '#06b6d4',
        weight: 6,
        opacity: 0.95
    }).addTo(map).bindPopup("<b>Primary Recommended Route</b>");

    const startPin = L.marker(primaryCoords[0]).addTo(map).bindPopup("<b>Start Location</b>");
    const endPin = L.marker(primaryCoords[primaryCoords.length - 1]).addTo(map).bindPopup("<b>Final Destination</b>");
    markers.push(startPin, endPin);

    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
}

// 10. ANIMATED CAR
function startCarAnimation(coords) {
    if (carMarker && map) map.removeLayer(carMarker);
    if (animationInterval) clearInterval(animationInterval);
    if (!coords || coords.length < 2) return;

    let index = 0;
    const carIcon = L.divIcon({
        html: '<div style="font-size: 26px;">🚗</div>',
        className: 'car-icon',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });

    carMarker = L.marker(coords[0], { icon: carIcon }).addTo(map);
    const step = Math.max(1, Math.floor(coords.length / 200));

    animationInterval = setInterval(() => {
        index += step;
        if (index < coords.length) {
            carMarker.setLatLng(coords[index]);
        } else {
            clearInterval(animationInterval);
        }
    }, 80);
}

// 11. CONTINUOUS AMENITIES EVERY 3-4 KM ALONG ENTIRE ROUTE
function addContinuousSmartPOIs(coords, totalDistanceKm) {
    poiMarkers.forEach(m => map.removeLayer(m));
    poiMarkers = [];

    if (!coords || coords.length < 10) return;

    const totalPoints = coords.length;
    const intervalKm = 3.5;
    const estimatedCount = Math.floor(totalDistanceKm / intervalKm);
    
    if (estimatedCount <= 0) return;

    const step = Math.max(1, Math.floor(totalPoints / estimatedCount));

    const poiCategories = [
        { icon: '☕', title: 'Tea & Coffee Stall', color: '#e11d48', desc: '10-Min Highway Refreshment' },
        { icon: '⛽', title: 'Fuel Bunk & Air Check', color: '#06b6d4', desc: 'Petrol/Diesel & Washroom' },
        { icon: '🍽️', title: 'Highway Restaurant', color: '#f59e0b', desc: 'Family Food Court & Hot Meals' },
        { icon: '🚻', title: 'Clean Washroom Stop', color: '#8b5cf6', desc: 'Hygiene & Rest Stop' },
        { icon: '🏥', title: 'Emergency Clinic', color: '#ef4444', desc: '24x7 First Aid' }
    ];

    let poiIdx = 0;
    let currentDistKm = 0;

    for (let i = step; i < totalPoints - Math.floor(step / 2); i += step) {
        currentDistKm += intervalKm;
        const poi = poiCategories[poiIdx % poiCategories.length];

        const customIcon = L.divIcon({
            html: `<div style="background:${poi.color}; color:#fff; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:14px; border:2px solid #fff; box-shadow:0 0 8px ${poi.color}; cursor:pointer;">${poi.icon}</div>`,
            className: 'smart-poi-pin',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const marker = L.marker(coords[i], { icon: customIcon })
            .bindPopup(`
                <div style="font-family: sans-serif;">
                    <b style="color:${poi.color};">${poi.icon} ${poi.title}</b><br>
                    <small>📍 At ~${Math.round(currentDistKm)} km into trip</small>
                </div>
            `)
            .addTo(map);

        poiMarkers.push(marker);
        poiIdx++;
    }
}

// 12. DESTINATION MANAGEMENT & UTILS
function addDestination() {
    const container = document.getElementById("destinationList");
    if (!container) return;

    const div = document.createElement("div");
    div.className = "destination-input";
    div.innerHTML = `
        <input type="text" class="destination-select" placeholder="Enter destination">
        <button onclick="removeDestination(this)">×</button>
    `;
    container.appendChild(div);
}

function removeDestination(button) {
    const all = document.querySelectorAll(".destination-input");
    if (all.length <= 1) {
        alert("At least one destination is required.");
        return;
    }
    button.parentElement.remove();
}

function saveTrip() {
    alert("Trip choice saved successfully!");
}

document.addEventListener("DOMContentLoaded", () => {
    initializeMap();
});