// ── Config — edit these before deploying ────────────────────────────────────
const CONFIG = {
  // Path to manifest.json (relative when files are committed alongside highlights)
  manifestUrl: './manifest.json',

  // Base path for media files (same dir as manifest by default)
  mediaBase: './',

  // HLS stream URL from MediaMTX on your NAS.
  // Works on your local network. For public access, set up Cloudflare Tunnel
  // and replace this with your tunnel URL, e.g.:
  //   https://your-tunnel.trycloudflare.com/trackmix_wide/index.m3u8
  streamUrl: 'http://192.168.100.202:8888/trackmix_wide/index.m3u8',

  // How often to re-fetch manifest.json (ms)
  refreshMs: 60_000,
};

// ── Label display metadata ───────────────────────────────────────────────────
const LABELS = {
  bird:          { icon: '🐦', name: 'Bird' },
  deer:          { icon: '🦌', name: 'Deer' },
  fox:           { icon: '🦊', name: 'Fox' },
  bear:          { icon: '🐻', name: 'Bear' },
  rabbit:        { icon: '🐰', name: 'Rabbit' },
  squirrel:      { icon: '🐿️', name: 'Squirrel' },
  raccoon:       { icon: '🦝', name: 'Raccoon' },
  turkey:        { icon: '🦃', name: 'Turkey' },
  dog:           { icon: '🐕', name: 'Dog' },
  cat:           { icon: '🐈', name: 'Cat' },
  cow:           { icon: '🐄', name: 'Cow' },
  horse:         { icon: '🐎', name: 'Horse' },
  storm:         { icon: '⛈️', name: 'Storm' },
  severe_storm:  { icon: '🌪️', name: 'Severe Storm' },
  lightning:     { icon: '⚡', name: 'Lightning' },
  sunrise:       { icon: '🌅', name: 'Sunrise' },
  sunset:        { icon: '🌇', name: 'Sunset' },
  sunrise_scene: { icon: '🌅', name: 'Sunrise' },
  sunset_scene:  { icon: '🌇', name: 'Sunset' },
  golden_hour:   { icon: '✨', name: 'Golden Hour' },
};

function labelMeta(label) {
  return LABELS[label] ?? { icon: '📷', name: label.replace(/_/g, ' ') };
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'all',                icon: '📷', label: 'All'     },
  { id: 'wildlife',           icon: '🦌', label: 'Wildlife'},
  { id: 'weather',            icon: '⛈️', label: 'Weather' },
  { id: 'golden_hour/sunrise',icon: '🌅', label: 'Sunrise' },
  { id: 'golden_hour/sunset', icon: '🌇', label: 'Sunset'  },
];

// ── Timestamp helpers ─────────────────────────────────────────────────────────
function parseTs(ts) {
  const m = ts.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return new Date(0);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
function formatTs(ts) {
  return parseTs(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
function timeAgo(ts) {
  const m = Math.floor((Date.now() - parseTs(ts)) / 60000);
  if (m <  1)  return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Category helpers ──────────────────────────────────────────────────────────
function matchesTab(entry, tab) {
  if (tab === 'all') return true;
  return (entry.categories ?? []).some(c => c === tab || c.startsWith(tab + '/'));
}
function primaryCat(entry) {
  const cats = entry.categories ?? [];
  if (cats.some(c => c.startsWith('wildlife'))) return 'wildlife';
  if (cats.some(c => c.startsWith('weather')))  return 'weather';
  return 'golden';
}
function badgeFor(cat) {
  if (cat.startsWith('wildlife'))   return { text: 'Wildlife', cls: 'b-wildlife' };
  if (cat.startsWith('weather'))    return { text: 'Weather',  cls: 'b-weather'  };
  if (cat.includes('sunrise'))      return { text: 'Sunrise',  cls: 'b-golden'   };
  if (cat.includes('sunset'))       return { text: 'Sunset',   cls: 'b-golden'   };
  return { text: cat, cls: '' };
}

// ── State ─────────────────────────────────────────────────────────────────────
let allEntries      = [];
let filteredEntries = [];
let activeTab       = 'all';
let lbIndex         = 0;
let streamOpen      = false;
let hls             = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $grid         = document.getElementById('media-grid');
const $tabs         = document.getElementById('category-tabs');
const $stats        = document.getElementById('stats-bar');
const $lightbox     = document.getElementById('lightbox');
const $lbImg        = document.getElementById('lb-img');
const $lbVideo      = document.getElementById('lb-video');
const $lbMeta       = document.getElementById('lb-meta');
const $streamPanel  = document.getElementById('stream-panel');
const $liveVideo    = document.getElementById('live-video');
const $streamStatus = document.getElementById('stream-status');
const $streamToggle = document.getElementById('stream-toggle');

// ── Manifest ──────────────────────────────────────────────────────────────────
async function loadManifest() {
  try {
    const res = await fetch(CONFIG.manifestUrl + '?_=' + Date.now());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allEntries = data.entries ?? [];
    render();
  } catch (e) {
    console.error('manifest load failed:', e);
    if ($grid.querySelector('.loading')) {
      $grid.innerHTML = `<div class="empty">⚠️ Could not load manifest.json — ${e.message}</div>`;
    }
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  renderStats();
  renderTabs();
  renderGrid();
}

function renderStats() {
  const counts = { wildlife: 0, weather: 0, sunrise: 0, sunset: 0 };
  allEntries.forEach(e => {
    (e.categories ?? []).forEach(c => {
      if (c.startsWith('wildlife'))      counts.wildlife++;
      else if (c.startsWith('weather'))  counts.weather++;
      else if (c.includes('sunrise'))    counts.sunrise++;
      else if (c.includes('sunset'))     counts.sunset++;
    });
  });
  $stats.innerHTML = [
    { icon: '📷', label: 'Total',    n: allEntries.length },
    { icon: '🦌', label: 'Wildlife', n: counts.wildlife   },
    { icon: '⛈️', label: 'Weather',  n: counts.weather    },
    { icon: '🌅', label: 'Sunrise',  n: counts.sunrise    },
    { icon: '🌇', label: 'Sunset',   n: counts.sunset     },
  ].map(s => `<div class="stat-badge">${s.icon} ${s.label} <span class="n">${s.n}</span></div>`).join('');
}

function renderTabs() {
  $tabs.innerHTML = TABS.map(t => {
    const n = t.id === 'all'
      ? allEntries.length
      : allEntries.filter(e => matchesTab(e, t.id)).length;
    return `<button class="tab${t.id === activeTab ? ' active' : ''}" data-cat="${t.id}">
      ${t.icon} ${t.label}<span class="tab-n">${n}</span>
    </button>`;
  }).join('');
  $tabs.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => { activeTab = btn.dataset.cat; render(); })
  );
}

function renderGrid() {
  filteredEntries = allEntries.filter(e => matchesTab(e, activeTab));

  if (!filteredEntries.length) {
    $grid.innerHTML = '<div class="empty">No highlights in this category yet.</div>';
    return;
  }

  $grid.innerHTML = filteredEntries.map((e, i) => {
    const { icon, name } = labelMeta(e.label);
    const snap = e.snapshot ? CONFIG.mediaBase + e.snapshot : null;
    const cat  = (e.categories ?? [])[0] ?? '';
    const { text, cls } = badgeFor(cat);
    const scoreStr = e.score ? `<span class="card-score">${Math.round(e.score * 100)}%</span>` : '';
    const thumb = snap
      ? `<img class="card-thumb" src="${snap}" alt="${name}" loading="lazy">`
      : `<div class="card-thumb-ph">${icon}</div>`;
    return `<div class="media-card" data-i="${i}">
      ${thumb}
      <div class="card-badges"><span class="badge ${cls}">${text}</span></div>
      ${e.clip ? '<div class="card-clip">▶ clip</div>' : ''}
      <div class="card-body">
        <div class="card-label">${icon} ${name} ${scoreStr}</div>
        <div class="card-time">${timeAgo(e.timestamp)} &middot; ${formatTs(e.timestamp)}</div>
      </div>
    </div>`;
  }).join('');

  $grid.querySelectorAll('.media-card').forEach(card =>
    card.addEventListener('click', () => openLightbox(+card.dataset.i))
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function openLightbox(index) {
  lbIndex = index;
  showLbEntry();
  $lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  $lightbox.classList.add('hidden');
  document.body.style.overflow = '';
  $lbVideo.pause();
  $lbVideo.removeAttribute('src');
  $lbVideo.classList.add('hidden');
  $lbImg.classList.remove('hidden');
}

function showLbEntry() {
  const e = filteredEntries[lbIndex];
  if (!e) return;
  const { icon, name } = labelMeta(e.label);

  // Reset to image view
  $lbVideo.pause();
  $lbVideo.removeAttribute('src');
  $lbVideo.classList.add('hidden');
  $lbImg.classList.remove('hidden');
  $lbImg.src = e.snapshot ? CONFIG.mediaBase + e.snapshot : '';
  $lbImg.alt = name;

  const clipUrl = e.clip ? CONFIG.mediaBase + e.clip : null;
  $lbMeta.innerHTML = `
    <div class="lb-title">${icon} ${name}</div>
    <div class="lb-time">${formatTs(e.timestamp)}</div>
    ${clipUrl ? `<button class="lb-play-btn" id="lb-play">▶ Play Clip</button>` : ''}
  `;
  document.getElementById('lb-play')?.addEventListener('click', () => {
    $lbImg.classList.add('hidden');
    $lbVideo.classList.remove('hidden');
    $lbVideo.src = clipUrl;
    $lbVideo.play();
  });
}

document.getElementById('lb-close').addEventListener('click', closeLightbox);
document.getElementById('lb-prev').addEventListener('click', () => {
  lbIndex = (lbIndex - 1 + filteredEntries.length) % filteredEntries.length;
  showLbEntry();
});
document.getElementById('lb-next').addEventListener('click', () => {
  lbIndex = (lbIndex + 1) % filteredEntries.length;
  showLbEntry();
});
$lightbox.addEventListener('click', e => { if (e.target === $lightbox) closeLightbox(); });
document.addEventListener('keydown', e => {
  if ($lightbox.classList.contains('hidden')) return;
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowLeft')  { lbIndex = (lbIndex - 1 + filteredEntries.length) % filteredEntries.length; showLbEntry(); }
  if (e.key === 'ArrowRight') { lbIndex = (lbIndex + 1) % filteredEntries.length; showLbEntry(); }
});

// ── HLS live stream ───────────────────────────────────────────────────────────
function startStream() {
  const url = CONFIG.streamUrl;

  // If the stream URL is a private LAN address, warn immediately rather than
  // letting the player hang with a cryptic network error.
  const isLan = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
  if (isLan && !window.location.hostname.match(/^(localhost|127\.|192\.168\.|10\.|172\.)/)) {
    $streamStatus.textContent = 'Live stream available on local network only';
    return;
  }

  if (typeof Hls !== 'undefined' && Hls.isSupported()) {
    if (hls) hls.destroy();
    hls = new Hls({ lowLatencyMode: true });
    hls.loadSource(url);
    hls.attachMedia($liveVideo);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      $liveVideo.play().catch(() => {});
      $streamStatus.textContent = '● Live';
      $streamStatus.classList.add('ok');
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        $streamStatus.textContent = 'Stream unavailable';
        $streamStatus.classList.remove('ok');
      }
    });
  } else if ($liveVideo.canPlayType('application/vnd.apple.mpegurl')) {
    $liveVideo.src = url;
    $liveVideo.play().catch(() => {});
    $streamStatus.textContent = '● Live';
    $streamStatus.classList.add('ok');
  } else {
    $streamStatus.textContent = 'HLS not supported in this browser';
  }
}

function stopStream() {
  if (hls) { hls.destroy(); hls = null; }
  $liveVideo.pause();
  $liveVideo.removeAttribute('src');
  $streamStatus.textContent = 'Paused';
  $streamStatus.classList.remove('ok');
}

$streamToggle.addEventListener('click', () => {
  streamOpen = !streamOpen;
  $streamPanel.classList.toggle('open', streamOpen);
  $streamToggle.classList.toggle('active', streamOpen);
  streamOpen ? startStream() : stopStream();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadManifest();
setInterval(loadManifest, CONFIG.refreshMs);
