// SoundTrip – versión estable usando Audio nativo (sin Howler)
// Mantiene: marcadores, flyTo, panel, botones, fades y botones aleatorio/parar.

let map, markers = [], places = [], activeMarker = null;
let currentAudio = null;
let fadeTimer = null;

init();

async function init() {
  // 1) Mapa
  map = L.map('map', { zoomControl: true, worldCopyJump: true })
          .setView([20, 0], 2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 6,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // 2) Datos
  try {
    const res = await fetch('data/countries.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    places = await res.json();
  } catch (e) {
    console.error('Error cargando countries.json:', e);
    alert('No se pudieron cargar los datos. Revisa data/countries.json');
    return;
  }

  // 3) Marcadores
  places.forEach(p => {
    const m = L.marker([p.lat, p.lng]).addTo(map);
    m.bindTooltip(p.country, { direction: 'top', offset: [0, -8] });
    m.on('click', () => showPlace(p, m));
    markers.push(m);
  });

  // 4) Botones
  document.getElementById('randomBtn').onclick = goRandom;
  document.getElementById('stopBtn').onclick = stopSound;
}

function showPlace(place, markerRef = null) {
  // Resaltar marcador
  if (activeMarker) activeMarker.setOpacity(1);
  if (markerRef) { activeMarker = markerRef; activeMarker.setOpacity(0.6); }

  // Detener audio anterior con fade
  fadeOutAndStop();

  // Panel
  const info = document.getElementById('info');
  info.innerHTML = `
    <h2>${place.country}</h2>
    <img src="${place.image}" alt="${place.country}" onerror="this.style.display='none'"/>
    <p>${place.description}</p>
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button id="playBtn">Reproducir</button>
      <button id="pauseBtn" style="background:#303b47">Pausa</button>
    </div>
  `;

  // Controles
  document.getElementById('playBtn').onclick  = () => startAudio(place.sound);
  document.getElementById('pauseBtn').onclick = pauseAudio;

  // Zoom al país
  map.flyTo([place.lat, place.lng], 4, { duration: 1.2 });
}

/* ========== Audio nativo ========== */
function startAudio(src) {
  try {
    fadeOutAndStop(); // por si hubiera algo sonando

    currentAudio = new Audio(src);
    currentAudio.volume = 0;          // empezamos bajo para hacer fade-in
    currentAudio.loop = true;         // opcional; quítalo si no quieres loop
    const playPromise = currentAudio.play();

    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => {
        // Fade-in suave a 0.85
        fadeTo(0.85, 300);
      }).catch(err => {
        console.warn('Reproducción bloqueada o error:', err);
        alert('No se pudo reproducir el audio. Comprueba el volumen del sistema y la ruta: ' + src);
      });
    } else {
      // Navegadores viejos: subir volumen sin promesa
      currentAudio.volume = 0.85;
    }
  } catch (e) {
    console.error('Error iniciando audio:', e);
  }
}

function pauseAudio() {
  if (currentAudio) currentAudio.pause();
}

function stopSound() {
  fadeOutAndStop();
  if (activeMarker) { activeMarker.setOpacity(1); activeMarker = null; }
}

function fadeOutAndStop() {
  if (!currentAudio) return;
  fadeTo(0, 250, () => {
    try { currentAudio.pause(); } catch(_) {}
    currentAudio = null;
  });
}

function fadeTo(targetVol = 0.85, ms = 300, done = null) {
  if (!currentAudio) { if (done) done(); return; }
  if (fadeTimer) clearInterval(fadeTimer);

  const steps = Math.max(1, Math.floor(ms / 20));
  const start = currentAudio.volume;
  const delta = (targetVol - start) / steps;
  let i = 0;

  fadeTimer = setInterval(() => {
    if (!currentAudio) { clearInterval(fadeTimer); return; }
    i++;
    const v = Math.min(1, Math.max(0, start + delta * i));
    currentAudio.volume = v;
    if (i >= steps) {
      clearInterval(fadeTimer);
      if (done) done();
    }
  }, 20);
}

/* ========== Utilidades ========== */
function goRandom() {
  if (!places.length) return;
  const r = places[Math.floor(Math.random() * places.length)];
  showPlace(r);
}
