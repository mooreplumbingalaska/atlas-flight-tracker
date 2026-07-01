const API = "https://opensky-network.org/api/states/all";
const $ = (id) => document.getElementById(id);

const areas = {
  tacoma: { name: "Tacoma", center: [47.25, -122.44], zoom: 8, lamin: 46.2, lamax: 48.3, lomin: -123.8, lomax: -121.0 },
  pnw: { name: "Pacific Northwest", center: [47.4, -122.5], zoom: 6, lamin: 42.0, lamax: 50.0, lomin: -126.0, lomax: -116.0 },
  alaska: { name: "Alaska", center: [61.2, -149.9], zoom: 4, lamin: 54.0, lamax: 71.0, lomin: -168.0, lomax: -130.0 },
  usa: { name: "USA", center: [39.5, -98.5], zoom: 4, lamin: 24.0, lamax: 49.5, lomin: -125.0, lomax: -66.5 }
};

let map;
let markerLayer;
let currentAircraft = [];
let deferredPrompt;

function feet(meters){ return meters == null ? "N/A" : `${Math.round(meters * 3.28084).toLocaleString()} ft`; }
function mph(ms){ return ms == null ? "N/A" : `${Math.round(ms * 2.23694).toLocaleString()} mph`; }
function status(msg, cls=""){ $("status").innerHTML = `<span class="${cls}">${msg}</span>`; }

function planeIcon(heading){
  const deg = Number.isFinite(heading) ? heading : 0;
  return L.divIcon({
    className: "planeIcon",
    html: `<div class="planeMarker" style="transform:rotate(${deg}deg)">✈️</div>`,
    iconSize: [28,28],
    iconAnchor: [14,14]
  });
}

function normalize(s){
  return {
    icao24: s[0],
    callsign: s[1] ? s[1].trim() : "Unknown",
    country: s[2],
    lastContact: s[4],
    lon: s[5],
    lat: s[6],
    baroAlt: s[7],
    onGround: s[8],
    velocity: s[9],
    heading: s[10],
    geoAlt: s[13],
    squawk: s[14]
  };
}

async function loadArea(key = $("area").value){
  const a = areas[key];
  map.setView(a.center, a.zoom);
  status(`Loading ${a.name}…`);
  $("panel").innerHTML = `<strong>Loading ${a.name}</strong><br>Checking OpenSky for live aircraft.`;

  const url = `${API}?lamin=${a.lamin}&lamax=${a.lamax}&lomin=${a.lomin}&lomax=${a.lomax}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      let retry = response.headers.get("x-rate-limit-retry-after-seconds");
      let extra = retry ? ` Try again in about ${Math.ceil(Number(retry)/60)} minutes.` : "";
      throw new Error(`OpenSky returned HTTP ${response.status}.${extra}`);
    }

    const data = await response.json();
    currentAircraft = (data.states || []).map(normalize).filter(x => x.lat != null && x.lon != null);

    markerLayer.clearLayers();
    currentAircraft.forEach(ac => addAircraft(ac));

    status(`${currentAircraft.length} aircraft loaded`, "good");
    $("panel").innerHTML = currentAircraft.length
      ? `<strong>${currentAircraft.length} aircraft loaded.</strong><br>Tap a plane marker for details.`
      : `<strong>No aircraft reported in ${a.name} right now.</strong><br>Try PNW or USA.`;
  } catch (err) {
    console.error(err);
    status("Flight data error", "error");
    $("panel").innerHTML = `<strong class="error">Could not load aircraft.</strong><br>${err.message}<br><br>Try Tacoma or PNW first. Large areas can hit OpenSky limits.`;
  }
}

function addAircraft(ac){
  const marker = L.marker([ac.lat, ac.lon], { icon: planeIcon(ac.heading) }).addTo(markerLayer);
  const details = `
    <strong>${ac.callsign}</strong><br>
    ${ac.country}<br>
    Altitude: ${feet(ac.geoAlt ?? ac.baroAlt)}<br>
    Speed: ${mph(ac.velocity)}<br>
    Heading: ${ac.heading == null ? "N/A" : Math.round(ac.heading) + "°"}<br>
    ICAO24: ${ac.icao24}
  `;
  marker.bindPopup(details);
  marker.on("click", () => { $("panel").innerHTML = details; });
}

function search(){
  const q = $("search").value.trim().toUpperCase();
  markerLayer.clearLayers();
  const list = q ? currentAircraft.filter(ac => ac.callsign.toUpperCase().includes(q) || ac.icao24.toUpperCase().includes(q)) : currentAircraft;
  list.forEach(addAircraft);
  status(`${list.length} shown`);
  if(list[0]) map.setView([list[0].lat, list[0].lon], 8);
}

function init(){
  map = L.map("map", { zoomControl: true }).setView(areas.tacoma.center, areas.tacoma.zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);

  $("refreshBtn").addEventListener("click", () => loadArea());
  $("area").addEventListener("change", () => loadArea());
  $("search").addEventListener("input", search);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("installBtn").hidden = false;
  });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("installBtn").hidden = true;
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
  loadArea("tacoma");
}

document.addEventListener("DOMContentLoaded", init);
