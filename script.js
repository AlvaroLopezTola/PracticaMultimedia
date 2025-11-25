// ==========================================
// 1. VARIABLES GLOBALES
// ==========================================
let map;
let markers = [];
let places = [];
let activeMarker = null;
let currentAudio = null;
let fadeTimer = null;

// Configuración
let visitedCountries = []; 
let globalVolume = 0.5; // El volumen empieza al 50%

// ==========================================
// 2. INICIALIZACIÓN
// ==========================================
init();

async function init() {
  // A. Mapa
  map = L.map('map', { zoomControl: true, worldCopyJump: true }).setView([20, 0], 2);

  // B. Capa Esri (Estética Atlas)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
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

  // F. Inicializar UI
  updatePassport();
  initSearch();
}

// ==========================================
// 3. MOSTRAR PAÍS (INTERFAZ)
// ==========================================
function showPlace(place, markerRef = null) {
  // Gestión visual del marcador
  if (activeMarker) activeMarker.setOpacity(1);
  if (markerRef) {
    activeMarker = markerRef;
    activeMarker.setOpacity(0.5);
  }

  // Pasaporte
  if (!visitedCountries.includes(place.country)) {
    visitedCountries.push(place.country);
    updatePassport();
  }

  const isVisited = visitedCountries.includes(place.country);
  const badgeHTML = isVisited ? '<span class="visited-tag">✅ Visitado</span>' : '';

  // Parar audio anterior
  fadeOutAndStop();

  const info = document.getElementById('info');
  
  // Generar HTML (Incluye el nuevo Slider de Volumen)
  info.innerHTML = `
    <h2>${place.country} ${badgeHTML}</h2>
    <img src="${place.image}" alt="${place.country}" onerror="this.style.display='none'"/>
    <p>${place.description}</p>
    
    <div class="audio-controls" style="margin-top:10px;">
      <div style="display:flex; gap:8px;">
        <button id="playBtn" style="flex:1;">▶ Reproducir</button>
        <button id="pauseBtn" style="flex:1; background:#303b47">⏸ Pausa</button>
      </div>

      <div class="volume-container">
        <span class="volume-icon">🔊</span>
        <input type="range" id="volSlider" min="0" max="1" step="0.01" value="${globalVolume}">
      </div>
    </div>
  `;

  // Asignar eventos a botones
  document.getElementById('playBtn').onclick  = () => startAudio(place.sound);
  document.getElementById('pauseBtn').onclick = pauseAudio;

  // EVENTO DE VOLUMEN: Escuchar cambios en tiempo real
  const slider = document.getElementById('volSlider');
  slider.addEventListener('input', (e) => {
    globalVolume = parseFloat(e.target.value); // Guardar valor
    if (currentAudio) {
      currentAudio.volume = globalVolume; // Aplicar al momento
    }
  });

  map.flyTo([place.lat, place.lng], 5, { duration: 1.5 });
}

// ==========================================
// 4. AUDIO (CONTROL AVANZADO)
// ==========================================
function startAudio(src) {
  try {
    fadeOutAndStop();
    currentAudio = new Audio(src);
    currentAudio.volume = 0; // Empieza en silencio para fade-in
    currentAudio.loop = true;
    
    const playPromise = currentAudio.play();
    if (playPromise !== undefined) {
      // Hacemos fade hasta el volumen que haya elegido el usuario (globalVolume)
      playPromise.then(() => fadeTo(globalVolume, 500)).catch(e => console.warn(e));
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
    // Si llegamos al volumen deseado o el audio se paró
    if (!currentAudio || currentAudio.volume >= targetVol) {
      clearInterval(timer); return;
    }
    // Subir volumen sin pasarse del máximo
    let nextVol = currentAudio.volume + inc;
    if (nextVol > 1) nextVol = 1;
    currentAudio.volume = nextVol;
  }, stepTime);
}

// ==========================================
// 5. UTILIDADES Y BUSCADOR
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

function initSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        const results = document.getElementById('searchResults');
        if (results) results.style.display = 'none';
      }
    });
  }
}

function handleSearch(query) {
  const resultsContainer = document.getElementById('searchResults');
  if (!resultsContainer) return;
  const term = query.toLowerCase().trim();

  if (term.length === 0) {
    resultsContainer.style.display = 'none';
    return;
  }
  const filtered = places.filter(p => p.country.toLowerCase().includes(term));

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

function selectSearchedCountry(countryName) {
  const place = places.find(p => p.country === countryName);
  if (!place) return;
  const index = places.indexOf(place);
  const marker = markers[index];
  showPlace(place, marker);
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  if(input) input.value = '';
  if(results) results.style.display = 'none';
}