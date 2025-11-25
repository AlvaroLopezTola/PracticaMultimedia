// ==========================================
// 1. VARIABLES GLOBALES
// ==========================================
let map;
let markers = [];
let places = [];
let activeMarker = null;
let currentAudio = null;
let fadeTimer = null;

// Memoria de sesión (se borra al recargar)
let visitedCountries = []; 

// ==========================================
// 2. INICIALIZACIÓN
// ==========================================
init();

async function init() {
  // A. Mapa centrado
  map = L.map('map', { zoomControl: true, worldCopyJump: true }).setView([20, 0], 2);

  // B. Mapa Estilo Esri (Nombres legibles)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
  }).addTo(map);

  // C. Cargar datos
  try {
    const res = await fetch('data/countries.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    places = await res.json();
  } catch (e) {
    console.error('Error cargando countries.json:', e);
    return;
  }

  // D. Crear marcadores
  places.forEach(p => {
    const m = L.marker([p.lat, p.lng]).addTo(map);
    m.on('click', () => showPlace(p, m));
    m.bindTooltip(p.country); 
    markers.push(m);
  });

  // E. Botones globales
  const randomBtn = document.getElementById('randomBtn');
  const stopBtn = document.getElementById('stopBtn');
  
  if(randomBtn) randomBtn.onclick = goRandom;
  if(stopBtn) stopBtn.onclick = stopSound;

  // F. Inicializar barra a 0
  updatePassport();

  // G. ACTIVAR BUSCADOR (NUEVO)
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    // Detectar escritura
    searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
    
    // Cerrar buscador si hacemos clic fuera
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        const results = document.getElementById('searchResults');
        if (results) results.style.display = 'none';
      }
    });
  }
}

// ==========================================
// 3. MOSTRAR PAÍS
// ==========================================
function showPlace(place, markerRef = null) {
  // Gestión visual del marcador
  if (activeMarker) activeMarker.setOpacity(1);
  if (markerRef) {
    activeMarker = markerRef;
    activeMarker.setOpacity(0.5);
  }

  // Pasaporte (Solo sesión actual)
  if (!visitedCountries.includes(place.country)) {
    visitedCountries.push(place.country);
    updatePassport();
  }

  const isVisited = visitedCountries.includes(place.country);
  const badgeHTML = isVisited ? '<span class="visited-tag">✅ Visitado</span>' : '';

  // Audio y Panel
  fadeOutAndStop();

  const info = document.getElementById('info');
  info.innerHTML = `
    <h2>${place.country} ${badgeHTML}</h2>
    <img src="${place.image}" alt="${place.country}" onerror="this.style.display='none'"/>
    <p>${place.description}</p>
    <div class="audio-controls" style="display:flex; gap:8px; margin-top:10px;">
      <button id="playBtn">▶ Reproducir</button>
      <button id="pauseBtn" style="background:#303b47">⏸ Pausa</button>
    </div>
  `;

  const btnPlay = document.getElementById('playBtn');
  const btnPause = document.getElementById('pauseBtn');

  if(btnPlay) btnPlay.onclick  = () => startAudio(place.sound);
  if(btnPause) btnPause.onclick = pauseAudio;

  map.flyTo([place.lat, place.lng], 5, { duration: 1.5 });
}

// ==========================================
// 4. AUDIO
// ==========================================
function startAudio(src) {
  try {
    fadeOutAndStop();
    currentAudio = new Audio(src);
    currentAudio.volume = 0; 
    currentAudio.loop = true;
    
    const playPromise = currentAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => fadeTo(0.85, 500)).catch(e => console.warn(e));
    }
  } catch (e) { console.error(e); }
}

function pauseAudio() {
  if (currentAudio) currentAudio.pause();
}

function stopSound() {
  fadeOutAndStop();
  if (activeMarker) {
    activeMarker.setOpacity(1);
    activeMarker = null;
  }
}

function fadeOutAndStop() {
  if (!currentAudio) return;
  const soundToKill = currentAudio; 
  currentAudio = null; 
  let vol = soundToKill.volume;
  const fadeOut = setInterval(() => {
    vol -= 0.1;
    if (vol <= 0) {
      clearInterval(fadeOut);
      try { soundToKill.pause(); } catch(e){}
    } else {
      soundToKill.volume = vol;
    }
  }, 50);
}

function fadeTo(targetVol, ms) {
  if (!currentAudio) return;
  const steps = 20;
  const stepTime = ms / steps;
  const inc = targetVol / steps;
  let timer = setInterval(() => {
    if (!currentAudio || currentAudio.volume >= targetVol) {
      clearInterval(timer); return;
    }
    currentAudio.volume = Math.min(1, currentAudio.volume + inc);
  }, stepTime);
}

// ==========================================
// 5. UTILIDADES
// ==========================================
function updatePassport() {
  const total = places.length; 
  const visited = visitedCountries.length;
  const percent = total > 0 ? (visited / total) * 100 : 0;

  const countEl = document.getElementById('visited-count');
  if(countEl) countEl.innerText = visited;
  
  const fillEl = document.getElementById('progress-fill');
  if(fillEl) fillEl.style.width = `${percent}%`;
}

function goRandom() {
  if (!places.length) return;
  const r = places[Math.floor(Math.random() * places.length)];
  let m = null;
  markers.forEach(marker => {
    const latlng = marker.getLatLng();
    if(latlng.lat === r.lat && latlng.lng === r.lng) m = marker;
  });
  showPlace(r, m);
}

// ==========================================
// 6. BUSCADOR (NUEVO)
// ==========================================
function handleSearch(query) {
  const resultsContainer = document.getElementById('searchResults');
  if (!resultsContainer) return;

  const term = query.toLowerCase().trim();

  // Si está vacío, ocultamos la lista
  if (term.length === 0) {
    resultsContainer.style.display = 'none';
    return;
  }

  // Filtrar países
  const filtered = places.filter(p => p.country.toLowerCase().includes(term));

  // Generar HTML de resultados
  if (filtered.length > 0) {
    resultsContainer.innerHTML = filtered.map(p => `
      <div class="result-item" onclick="selectSearchedCountry('${p.country}')">
        <img src="${p.image}" style="width:30px;height:20px;object-fit:cover;border-radius:2px;margin-right:8px;">
        <span>${p.country}</span>
      </div>
    `).join('');
    resultsContainer.style.display = 'block';
  } else {
    resultsContainer.innerHTML = '<div class="result-item" style="padding:10px;">No se encontraron resultados</div>';
    resultsContainer.style.display = 'block';
  }
}

// Función auxiliar para cuando haces clic en un resultado
function selectSearchedCountry(countryName) {
  // Buscar el objeto del país
  const place = places.find(p => p.country === countryName);
  if (!place) return;

  // Buscar su marcador
  const index = places.indexOf(place);
  const marker = markers[index];

  // Ejecutar la acción principal
  showPlace(place, marker);

  // Limpiar buscador
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  if(input) input.value = '';
  if(results) results.style.display = 'none';
}