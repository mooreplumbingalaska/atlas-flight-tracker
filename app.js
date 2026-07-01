const API = "https://opensky-network.org/api/states/all";
const $ = id => document.getElementById(id);

const boxes = {
  pnw: { lamin: 42.0, lamax: 50.5, lomin: -126.5, lomax: -116.0, zoom: 6, center: [47.3, -122.7] },
  alaska: { lamin: 51.0, lamax: 72.0, lomin: -170.0, lomax: -130.0, zoom: 4, center: [61.2, -149.9] },
  usa: { lamin: 24.0, lamax: 49.5, lomin: -125.0, lomax: -66.0, zoom: 4, center: [39.8, -98.5] }
};

let map, layer, allAircraft = [], deferredPrompt = null;
let favorites = JSON.parse(localStorage.getItem("atlasFavorites") || "[]");

function initMap() {
  map = L.map("map", { zoomControl: false }).setView([47.25, -122.44], 7);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
}

function planeIcon(heading) {
  const deg = Number.isFinite(heading) ? heading : 0;
  return L.divIcon({
    className: "planeIcon",
    html: `<div style="transform:rotate(${deg}deg)">✈️</div>`,
    iconSize: [24,24],
    iconAnchor: [12,12]
  });
}

function metersToFeet(m) {
  return m == null ? "N/A" : `${Math.round(m * 3.28084).toLocaleString()} ft`;
}
function msToMph(ms) {
  return ms == null ? "N/A" : `${Math.round(ms * 2.23694).toLocaleString()} mph`;
}
function ts(t) {
  if (!t) return "N/A";
  return new Date(t * 1000).toLocaleString();
}

function normalize(row) {
  return {
    icao24: row[0],
    callsign: row[1] ? row[1].trim() : "Unknown",
    country: row[2],
    time_position: row[3],
    last_contact: row[4],
    lon: row[5],
    lat: row[6],
    baro_altitude: row[7],
    on_ground: row[8],
    velocity: row[9],
    heading: row[10],
    vertical_rate: row[11],
    geo_altitude: row[13],
    squawk: row[14]
  };
}

async function loadBox(boxName = "pnw") {
  const box = boxes[boxName];
  setStatus(`Loading ${boxName.toUpperCase()} aircraft...`);
  map.setView(box.center, box.zoom);

  const params = new URLSearchParams({
    lamin: box.lamin, lamax: box.lamax, lomin: box.lomin, lomax: box.lomax
  });

  try {
    const res = await fetch(`${API}?${params.toString()}`);
    if (!res.ok) throw new Error(`OpenSky error ${res.status}`);
    const data = await res.json();
    allAircraft = (data.states || []).map(normalize).filter(a => a.lat && a.lon);
    renderAircraft(allAircraft);
    $("aircraftCount").textContent = `${allAircraft.length} aircraft`;
    $("lastUpdate").textContent = `Updated ${new Date().toLocaleTimeString()}`;
    setStatus("Live map loaded");
  } catch (err) {
    console.error(err);
    setStatus("Could not load flights. OpenSky may be rate-limited. Try Refresh.");
  }
}

function renderAircraft(list) {
  layer.clearLayers();
  list.slice(0, 900).forEach(a => {
    const marker = L.marker([a.lat, a.lon], { icon: planeIcon(a.heading) }).addTo(layer);
    marker.on("click", () => showDetails(a));
    marker.bindPopup(`<strong>${a.callsign}</strong><br>${a.country}<br>${metersToFeet(a.geo_altitude || a.baro_altitude)}`);
  });
}

function showDetails(a) {
  const fav = favorites.includes(a.icao24);
  $("details").innerHTML = `
    <h2>${a.callsign}</h2>
    <p>${a.country || "Unknown country"} · ICAO24 ${a.icao24}</p>
    <div class="grid">
      <div class="tile"><small>Altitude</small><strong>${metersToFeet(a.geo_altitude || a.baro_altitude)}</strong></div>
      <div class="tile"><small>Speed</small><strong>${msToMph(a.velocity)}</strong></div>
      <div class="tile"><small>Heading</small><strong>${a.heading == null ? "N/A" : Math.round(a.heading) + "°"}</strong></div>
      <div class="tile"><small>Status</small><strong>${a.on_ground ? "On ground" : "Airborne"}</strong></div>
      <div class="tile"><small>Last contact</small><strong>${ts(a.last_contact)}</strong></div>
      <div class="tile"><small>Squawk</small><strong>${a.squawk || "N/A"}</strong></div>
    </div>
    <button class="ghost" style="margin-top:12px" onclick="toggleFavorite('${a.icao24}')">${fav ? "Remove favorite" : "Save favorite"}</button>
  `;
}

window.toggleFavorite = function(id) {
  if (favorites.includes(id)) favorites = favorites.filter(x => x !== id);
  else favorites.push(id);
  localStorage.setItem("atlasFavorites", JSON.stringify(favorites));
  setStatus("Favorites updated");
};

function search() {
  const q = $("searchInput").value.trim().toUpperCase();
  if (!q) return;
  const matches = allAircraft.filter(a => (a.callsign || "").toUpperCase().includes(q) || a.icao24.toUpperCase().includes(q));
  renderAircraft(matches);
  $("aircraftCount").textContent = `${matches.length} match${matches.length === 1 ? "" : "es"}`;
  if (matches[0]) {
    map.setView([matches[0].lat, matches[0].lon], 8);
    showDetails(matches[0]);
  } else {
    setStatus("No match in currently loaded area. Try USA then search again.");
  }
}

function setStatus(msg) { $("statusText").textContent = msg; }

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").classList.remove("hidden");
});

$("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").classList.add("hidden");
});

$("searchBtn").addEventListener("click", search);
$("searchInput").addEventListener("keydown", e => { if (e.key === "Enter") search(); });
document.querySelectorAll("[data-box]").forEach(btn => btn.addEventListener("click", () => loadBox(btn.dataset.box)));
$("refreshBtn").addEventListener("click", () => loadBox("pnw"));
$("darkBtn").addEventListener("click", () => document.body.classList.toggle("light"));
$("favoritesBtn").addEventListener("click", () => {
  const favs = allAircraft.filter(a => favorites.includes(a.icao24));
  renderAircraft(favs);
  $("aircraftCount").textContent = `${favs.length} favorite${favs.length === 1 ? "" : "s"}`;
});
$("nearMeBtn").addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    map.setView([latitude, longitude], 8);
    const box = {
      lamin: latitude - 3, lamax: latitude + 3,
      lomin: longitude - 4, lomax: longitude + 4,
      center: [latitude, longitude], zoom: 7
    };
    boxes.custom = box;
    loadBox("custom");
  }, () => setStatus("Location permission denied"));
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

initMap();
loadBox("pnw");
