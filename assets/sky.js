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

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const pointName = (deg) => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

// Hilltop weather at a fraction of the way through the video (v.weather: t0, step_s, arrays).
function weatherAt(wx, frac) {
  const n = wx.temp_f.length;
  const i = Math.min(n - 1, Math.max(0, Math.round(frac * (n - 1))));
  const near = (arr) => { for (let k = 0; k < n; k++) for (const j of [i - k, i + k]) if (arr[j] != null) return arr[j]; return null; };
  return { time: new Date(Date.parse(wx.t0) + i * wx.step_s * 1000),
           temp: near(wx.temp_f), from: near(wx.wind_from_deg), mph: near(wx.wind_mph) };
}

// Compass band along the top of one turn of the strip: panoramas are north at the left edge,
// so bearing b sits at b/360 of the width. Drawn per tile so it scrolls with the picture.
function drawCompass(ctx, x, w, wind) {
  ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(x, 0, w, 22);
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.fillStyle = "#fff"; ctx.lineWidth = 1;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let b = 0; b < 360; b += 15) {
    const bx = Math.round(x + (b / 360) * w) + 0.5;
    const major = b % 45 === 0;
    ctx.beginPath(); ctx.moveTo(bx, 22); ctx.lineTo(bx, major ? 14 : 18); ctx.stroke();
    if (major) {
      ctx.font = b % 90 === 0 ? "bold 12px system-ui, sans-serif" : "11px system-ui, sans-serif";
      ctx.fillText(POINTS[b / 22.5], bx, 7);
    }
  }
  if (wind && wind.from != null && wind.mph >= 1) {   // where the wind is coming from
    const wx = x + (wind.from / 360) * w;
    ctx.fillStyle = "#7fd4ff";
    ctx.beginPath(); ctx.moveTo(wx - 6, 23); ctx.lineTo(wx + 6, 23); ctx.lineTo(wx, 33); ctx.closePath(); ctx.fill();
  }
}

// Readout box (top left, under the compass band): time, temperature, and a small dial with the wind arrow (pointing the way the
// air moves) and a wedge for the direction the viewer is facing.
function drawReadout(ctx, top, wind, facing) {
  const r = 17;
  const lines = [];
  if (wind.time) lines.push(wind.time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }));
  if (wind.temp != null) lines.push(`${Math.round(wind.temp)}°F`);
  lines.push(wind.mph == null ? "wind —" : wind.mph < 1 ? "wind calm"
    : `wind ${Math.round(wind.mph)} mph from ${pointName(wind.from)}`);
  ctx.font = "13px system-ui, sans-serif";
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const bw = 2 * r + 34 + tw, bh = Math.max(2 * r + 12, lines.length * 17 + 10);
  const cx = 12 + r, cy = top + bh / 2;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath(); ctx.roundRect(6, top, bw, bh, 8); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 9px system-ui, sans-serif"; ctx.fillText("N", cx, cy - r + 6);
  const ang = (deg) => ((deg - 90) * Math.PI) / 180;   // compass bearing -> canvas angle
  if (facing != null) {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r - 1, ang(facing - 25), ang(facing + 25)); ctx.closePath(); ctx.fill();
  }
  if (wind.from != null && wind.mph >= 1) {
    const to = ang(wind.from + 180), tail = ang(wind.from);
    const hx = cx + Math.cos(to) * (r - 4), hy = cy + Math.sin(to) * (r - 4);
    ctx.strokeStyle = "#7fd4ff"; ctx.fillStyle = "#7fd4ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(tail) * (r - 4), cy + Math.sin(tail) * (r - 4)); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(to - 0.5) * 7, hy - Math.sin(to - 0.5) * 7);
    ctx.lineTo(hx - Math.cos(to + 0.5) * 7, hy - Math.sin(to + 0.5) * 7); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.font = "13px system-ui, sans-serif";
  const y0 = cy - ((lines.length - 1) * 17) / 2;
  lines.forEach((l, k) => ctx.fillText(l, 2 * r + 24, y0 + k * 17));
}

// 360° panorama player: the strip is drawn on a canvas at a zoomed height and tiled so the
// right edge meets the left. Drag or swipe to spin it in either direction forever; it drifts
// slowly on its own until touched. Tap (without dragging) plays or pauses.
function panoViewer(v) {
  const wrap = document.createElement("div");
  wrap.className = "pano-viewer";
  const canvas = document.createElement("canvas");
  const vid = document.createElement("video");
  vid.className = "pano-source";
  vid.src = `/data/${v.video}`;
  vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = "auto";
  vid.setAttribute("muted", ""); vid.setAttribute("playsinline", "");
  const poster = new Image();
  if (v.poster) poster.src = `/data/${v.poster}`;
  const hint = document.createElement("div");
  hint.className = "pano-hint"; hint.textContent = "◀ drag to look around ▶";
  const btn = document.createElement("button");
  btn.className = "pano-play"; btn.type = "button"; btn.setAttribute("aria-label", "Play");
  btn.textContent = "▶";
  wrap.append(canvas, vid, hint, btn);

  const ctx = canvas.getContext("2d");
  const compass = v.cam === 2;   // only cam 2's panoramas are verified north-aligned against the sun
  let offset = 0;            // CSS px the view has turned
  let velocity = 0;          // px per frame, for the coast after a swipe
  let drift = 0.25;          // gentle auto-pan until the viewer touches it
  let dragging = false, moved = 0, lastX = 0, lastT = 0, visible = false;

  function source() {
    if (vid.readyState >= 2 && vid.videoWidth) return [vid, vid.videoWidth, vid.videoHeight];
    if (poster.complete && poster.naturalWidth) return [poster, poster.naturalWidth, poster.naturalHeight];
    return null;
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    const src = source();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
    if (!src) return;
    const [img, sw, sh] = src;
    const w = sw * (ch / sh);              // width of one full turn at this zoom
    const start = -(((offset % w) + w) % w);
    for (let x = start; x < cw; x += w) ctx.drawImage(img, Math.floor(x), 0, Math.ceil(w) + 1, ch);  // +1 px hides the seam line
    const frac = img === vid && vid.duration ? vid.currentTime / vid.duration : 0;
    const wind = v.weather ? weatherAt(v.weather, frac) : null;
    if (compass) for (let x = start; x < cw; x += w) drawCompass(ctx, x, w, wind);
    if (wind) {
      const facing = (((offset + cw / 2) % w + w) % w) / w * 360;   // bearing at the middle of the view
      drawReadout(ctx, compass ? 30 : 6, wind, compass ? facing : null);
    }
  }

  function frame() {
    if (!dragging) {
      if (Math.abs(velocity) > 0.05) { offset += velocity; velocity *= 0.95; }
      else { velocity = 0; offset += drift; }
    }
    if (visible) draw();
    requestAnimationFrame(frame);
  }

  function setPlaying(on) {
    if (on) {
      vid.play().then(() => { btn.hidden = true; }).catch(() => { btn.hidden = false; });
    } else { vid.pause(); btn.hidden = false; }
  }

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; moved = 0; lastX = e.clientX; lastT = e.timeStamp; velocity = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    offset -= dx; moved += Math.abs(dx);
    const dt = Math.max(e.timeStamp - lastT, 1);
    velocity = (-dx / dt) * 16;
    lastX = e.clientX; lastT = e.timeStamp;
    drift = 0; hint.hidden = true;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (moved < 6) { velocity = 0; setPlaying(vid.paused); }   // a tap, not a drag
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  wrap.addEventListener("wheel", (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (!d) return;
    e.preventDefault(); offset += d; drift = 0; hint.hidden = true;
  }, { passive: false });
  btn.addEventListener("click", () => setPlaying(true));
  poster.addEventListener("load", draw);
  vid.addEventListener("loadeddata", draw);

  // Play only while on screen: saves battery with several videos on the page.
  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;   // entries can batch; the last is current
    if (visible) setPlaying(true); else vid.pause();
  }, { threshold: 0.25 }).observe(wrap);

  requestAnimationFrame(frame);
  return wrap;
}

function skyCard(v) {
  const card = document.createElement("div");
  const pano = v.view !== "allsky";
  card.className = `sky-card view-${pano ? "pano" : "allsky"}`;
  let media;
  if (pano) {
    media = panoViewer(v);
  } else {
    media = document.createElement("video");
    media.src = `/data/${v.video}`;
    if (v.poster) media.poster = `/data/${v.poster}`;
    media.controls = true; media.muted = true; media.loop = true; media.playsInline = true;
    media.preload = "metadata";
  }
  const meta = document.createElement("div"); meta.className = "sky-meta";
  const title = document.createElement("span"); title.className = "sky-title";
  title.textContent = `${SKY_TYPES[v.type] || "Timelapse"}${pano ? " · 360°" : " · overhead"}`;
  const sub = document.createElement("span"); sub.className = "sky-sub";
  sub.textContent = `${skyDate(v.date)}${v.span ? ", " + v.span : ""}`;
  const score = document.createElement("span"); score.className = "sky-score";
  score.textContent = `★ ${v.score}`; score.title = "Automatic quality rating, 0-100";
  meta.append(title, sub, score);
  card.append(media, meta);
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
