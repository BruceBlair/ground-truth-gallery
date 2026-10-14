// Sky timelapses page: progress counts + the best graded videos (data/sky-stats.json,
// written by push-progress.py every 6 h; video files in /data/sky-media/).

const SKY_TYPES = { sunrise: "Sunrise", sunset: "Sunset", allday: "Sunrise to sunset", day: "Daytime" };

function skyTile(value, label, note) {
  const t = document.createElement("div");
  t.className = "stat-tile";
  const v = document.createElement("div"); v.className = "stat-value"; v.textContent = value;
  const l = document.createElement("div"); l.className = "stat-label"; l.textContent = label;
  t.append(v, l);
  if (note) { const n = document.createElement("div"); n.className = "stat-note"; n.textContent = note; t.append(n); }
  return t;
}

function skyDate(iso) {
  const d = iso.length === 8 ? `${iso.slice(0, 4)}-${iso.slice(4, 6)}-${iso.slice(6)}` : iso;
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function skyCard(v) {
  const card = document.createElement("div");
  card.className = `sky-card view-${v.view === "allsky" ? "allsky" : "pano"}`;
  const vid = document.createElement("video");
  vid.src = `/data/${v.video}`;
  if (v.poster) vid.poster = `/data/${v.poster}`;
  vid.controls = true; vid.muted = true; vid.loop = true; vid.playsInline = true;
  vid.preload = "metadata";
  // Tap/click anywhere on the video to play or pause (thin panoramas leave little room for controls).
  // Skip clicks on the bottom control bar so the native play button doesn't toggle twice.
  vid.addEventListener("click", (e) => {
    if (e.offsetY > vid.clientHeight - 48) return;
    if (vid.paused) vid.play(); else vid.pause();
  });
  const meta = document.createElement("div"); meta.className = "sky-meta";
  const title = document.createElement("span"); title.className = "sky-title";
  title.textContent = `${SKY_TYPES[v.type] || "Timelapse"}${v.view === "allsky" ? " · overhead" : " · 360°"}`;
  const sub = document.createElement("span"); sub.className = "sky-sub";
  sub.textContent = `${skyDate(v.date)}${v.span ? ", " + v.span : ""}`;
  const score = document.createElement("span"); score.className = "sky-score";
  score.textContent = `★ ${v.score}`; score.title = "Automatic quality rating, 0-100";
  meta.append(title, sub, score);
  card.append(vid, meta);
  return card;
}

async function loadSky() {
  let s;
  try { s = await fetchJSON("/data/sky-stats.json"); } catch (e) {
    document.getElementById("sky-updated").textContent = "Sky data is currently unavailable.";
    return;
  }
  document.getElementById("sky-updated").textContent = `Updated ${formatAge(s.updated)}`;
  const tiles = document.getElementById("sky-tiles");
  tiles.textContent = "";
  tiles.append(
    skyTile(`${s.days_recorded}`, "days recorded", s.first_day ? `since ${skyDate(s.first_day)}` : ""),
    skyTile(s.panoramas.toLocaleString("en-US"), "360° sky panoramas"),
    skyTile(s.timelapses_built.toLocaleString("en-US"), "timelapses built"),
    skyTile(`${s.timelapses_featured}`, "rated good enough to feature"),
  );
  const grid = document.getElementById("sky-grid");
  grid.textContent = "";
  (s.top || []).forEach((v) => grid.appendChild(skyCard(v)));
}

document.addEventListener("DOMContentLoaded", loadSky);
