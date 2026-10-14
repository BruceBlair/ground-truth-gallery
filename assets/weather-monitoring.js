const NODES_INTERVAL_SEC = 5 * 60;
const FORECAST_INTERVAL_SEC = 30 * 60;

function buildStationCard(node) {
  const card = document.createElement("div");
  card.className = "station-card";

  const h3 = document.createElement("h3");
  const nameSpan = document.createElement("span");
  nameSpan.textContent = node.label;
  const badge = document.createElement("span");
  badge.className = `status-badge status-${node.status}`;
  badge.textContent = node.status;
  h3.append(nameSpan, badge);
  card.appendChild(h3);

  const updated = document.createElement("div");
  updated.className = "updated-line";
  updated.style.margin = "0 0 0.4rem";
  updated.textContent = node.current && node.current.timestamp
    ? `Updated ${formatAge(node.current.timestamp)}`
    : "No readings yet";
  card.appendChild(updated);

  const dl = document.createElement("dl");
  dl.className = "reading-grid";
  const c = node.current || {};
  const rows = [
    ["Temp", fmt(c.temp_f, 1, "°F")],
    ["Humidity", fmt(c.humidity_pct, 0, "%")],
    ["Pressure", fmt(c.pressure_msl_inhg, 2, " inHg")],
    ["Wind", fmt(c.wind_speed_mph, 1, " mph")],
    ["Gust", fmt(c.wind_gust_mph, 1, " mph")],
    ["Wind dir", fmt(c.wind_dir_deg, 0, "°")],
    ["Rain rate", fmt(c.rain_rate_in_hr, 2, " in/hr")],
    ["Rain today", fmt(c.rain_daily_in, 2, " in")],
    ["Battery", fmt(c.battery_pct, 0, "%")],
  ];
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  });
  card.appendChild(dl);

  if (node.current && (c.temp_f === null || c.wind_speed_mph === null)) {
    const note = document.createElement("p");
    note.className = "reason";
    note.textContent = "Some fields unavailable — sensor or integration issue at this station, not necessarily calm/missing conditions.";
    card.appendChild(note);
  }

  return card;
}

function appendForecastPeriods(strip, periods) {
  periods.slice(0, 8).forEach((p) => {
    const el = document.createElement("div");
    el.className = "forecast-period";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;
    const img = document.createElement("img");
    img.src = p.icon;
    img.alt = p.short;
    img.loading = "lazy";
    const temp = document.createElement("div");
    temp.textContent = `${p.temp_f}°F`;
    const short = document.createElement("div");
    short.textContent = p.short;
    el.append(name, img, temp, short);
    strip.appendChild(el);
  });
}

function mapKindOf(n) { return n.kind || "native"; }
function mapStatusOf(n) { return n.status || "unknown"; }
function mapLabelOf(n) { return n.label; }

async function refreshNodes() {
  try {
    const nodes = await fetchJSON("/data/nodes.json");
    showStaleBanner(nodes.updated, NODES_INTERVAL_SEC, "sensor readings");
    document.getElementById("nodes-updated").textContent = `Last updated: ${formatAge(nodes.updated)}`;

    const merged = nodes.nodes.map((n) => ({ ...n, kind: "native" }));

    try {
      const ext = await fetchJSON("/data/external-stations.json");
      ext.stations
        .filter((s) => s.approx_lat != null && s.approx_lon != null)
        .forEach((s) => merged.push({
          lat: s.approx_lat,
          lon: s.approx_lon,
          kind: "external",
          status: s.temp_f != null ? "active" : "offline",
          label: `Regional station (${s.network === "wunderground" ? "WU" : s.network}) — ${s.distance_mi != null ? s.distance_mi + " mi" : "distance unknown"}`,
        }));
    } catch (e) { /* external-stations.json is optional — map still works without it */ }

    try {
      const pref = await fetchJSON("/data/preferred-locations.json");
      pref.locations.forEach((p) => merged.push({
        lat: p.lat,
        lon: p.lon,
        kind: "preferred",
        status: "unknown",
        label: `Proposed: ${p.label}`,
      }));
    } catch (e) { /* preferred-locations.json is optional — map still works without it */ }

    const mapEl = document.getElementById("node-map");
    renderNodeMap(mapEl, merged, mapStatusOf, mapLabelOf, mapKindOf, terrain && terrain.bounds);

    const grid = document.getElementById("station-grid");
    grid.textContent = "";
    nodes.nodes.forEach((n) => grid.appendChild(buildStationCard(n)));
  } catch (e) {
    document.getElementById("station-grid").textContent = "Live station data is currently unavailable.";
    console.error(e);
  }
}

async function refreshForecast() {
  try {
    const forecast = await fetchJSON("/data/forecast.json");
    document.getElementById("forecast-updated").textContent = `Forecast last updated: ${formatAge(forecast.updated)} (source: ${forecast.source})`;
    const strip = document.getElementById("forecast-strip");
    strip.textContent = "";
    appendForecastPeriods(strip, forecast.periods);
  } catch (e) {
    console.error(e);
  }
}

// Terrain: USGS 3DEP shaded relief behind the station map + a ridge-to-valley profile.
// Generated once by tools/make_terrain.py (the ground doesn't change).
let terrain = null;

async function loadTerrain() {
  try {
    terrain = await fetchJSON("/assets/terrain/terrain.json");
  } catch (e) { return; /* optional: the plain map still works */ }
  const mapEl = document.getElementById("node-map");
  mapEl.classList.add("terrain");
  const km = (terrain.width_m / 1000).toFixed(1);
  document.getElementById("terrain-caption").textContent =
    `Bare-earth elevation ${terrain.elev_ft.min}–${terrain.elev_ft.max} ft, ` +
    `${terrain.contour_ft.minor} ft contours (bold every ${terrain.contour_ft.major} ft), ` +
    `about ${km} km across, north up. Source: ${terrain.source}.`;
  renderProfile(document.getElementById("elev-profile"), terrain.profile);
}

function renderProfile(el, profile) {
  const pts = profile.points_m_ft;
  if (!el || !pts || pts.length < 2) return;
  const W = 640, H = 214, L = 48, R = 12, T = 14, B = 48;
  const maxD = pts[pts.length - 1][0];
  const es = pts.map((p) => p[1]);
  const lo = Math.floor((Math.min(...es) - 10) / 20) * 20, hi = Math.ceil((Math.max(...es) + 10) / 20) * 20;
  const x = (d) => L + (d / maxD) * (W - L - R);
  const y = (e) => T + (1 - (e - lo) / (hi - lo)) * (H - T - B);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Ground elevation profile between the stations");
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (text != null) n.textContent = text;
    svg.appendChild(n);
    return n;
  };
  for (let e = lo; e <= hi; e += 20) {
    add("line", { x1: L, x2: W - R, y1: y(e), y2: y(e), class: "prof-grid" });
    add("text", { x: L - 6, y: y(e) + 4, class: "prof-tick", "text-anchor": "end" }, `${e}`);
  }
  const line = pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  add("polygon", { points: `${x(0)},${H - B} ${line} ${x(maxD)},${H - B}`, class: "prof-fill" });
  add("polyline", { points: line, class: "prof-line" });
  profile.marks.forEach((m, i) => {
    const p = pts.reduce((a, b) => (Math.abs(b[0] - m.d_m) < Math.abs(a[0] - m.d_m) ? b : a));
    const anchor = i === 0 ? "start" : i === profile.marks.length - 1 ? "end" : "middle";
    add("circle", { cx: x(p[0]), cy: y(p[1]), r: 5, class: "prof-station" });
    add("text", { x: x(p[0]), y: H - B + 15, class: "prof-label", "text-anchor": anchor }, m.label);
    add("text", { x: x(p[0]), y: H - B + 28, class: "prof-tick", "text-anchor": anchor }, `${m.ground_ft != null ? m.ground_ft : Math.round(p[1])} ft`);
  });
  add("text", { x: 4, y: T + 2, class: "prof-tick" }, "ft");
  add("text", { x: (L + W - R) / 2, y: H - 4, class: "prof-tick", "text-anchor": "middle" }, `${Math.round(maxD)} m along the line`);
  el.textContent = "";
  el.appendChild(svg);
}

// Progress numbers (data/weather-stats.json, push-progress.py, every 6 h).
function statTile(value, label, note) {
  const t = document.createElement("div");
  t.className = "stat-tile";
  const v = document.createElement("div"); v.className = "stat-value"; v.textContent = value;
  const l = document.createElement("div"); l.className = "stat-label"; l.textContent = label;
  t.append(v, l);
  if (note) { const n = document.createElement("div"); n.className = "stat-note"; n.textContent = note; t.append(n); }
  return t;
}

function shortDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function loadWeatherStats() {
  let w;
  try { w = await fetchJSON("/data/weather-stats.json"); } catch (e) { return; }
  document.getElementById("stats-updated").textContent = `Updated ${formatAge(w.updated)}`;
  const tiles = document.getElementById("weather-tiles");
  tiles.textContent = "";
  const wet = Object.values(w.stations).sort((a, b) => (b.wettest_day_in || 0) - (a.wettest_day_in || 0))[0];
  tiles.append(
    statTile(`${w.days_online}`, "days online", `since ${shortDate(w.online_since)}`),
    statTile(w.readings.toLocaleString("en-US"), "sensor readings logged"),
    statTile(`${w.rain_avg_in} in`, "rain recorded", "average across the stations"),
    wet ? statTile(`${wet.wettest_day_in} in`, "wettest day", `${shortDate(wet.wettest_day)}, ${wet.label}`) : "",
    w.record_high ? statTile(`${Math.round(w.record_high.temp_f)}°F`, "highest temperature",
      `${shortDate(w.record_high.date)}, ${w.record_high.station}`) : "",
    w.record_low ? statTile(`${Math.round(w.record_low.temp_f)}°F`, "lowest temperature",
      `${shortDate(w.record_low.date)}, ${w.record_low.station}`) : "",
  );
  const rv = w.ridge_vs_valley_overnight;
  if (rv && rv.nights) {
    document.getElementById("ridge-valley-line").textContent =
      `So far the valley and ridge overnight lows have been within 2°F of each other on ` +
      `${rv.within_2f_nights} of ${rv.nights} nights.`;
  }
}

async function initWeather() {
  await loadTerrain();
  loadWeatherStats();
  refreshNodes();
  refreshForecast();
  setInterval(refreshNodes, 60000);
  setInterval(refreshForecast, 5 * 60000);
}

document.addEventListener("DOMContentLoaded", initWeather);
