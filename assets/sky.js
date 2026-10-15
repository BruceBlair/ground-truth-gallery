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
