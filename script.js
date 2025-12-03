// ==========================================
// 1. VARIABLES GLOBALES
// ==========================================
let map;
let markers = [];
let places = []; // Datos crudos
let activeMarker = null;
let currentAudio = null;
let fadeTimer = null;

// VARIABLES DEL VISUALIZADOR DE AUDIO (NUEVO)
let audioContext = null;
let analyser = null;
let dataArray = null;
let source = null;
let animationId = null;

// ==========================================
// CONFIGURACIÓN Y PERSISTENCIA PASAPORTE
// ==========================================
const STORAGE_KEY = "soundtrip_visited";
let visitedCountries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

function saveVisited() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visitedCountries));
}

let globalVolume = 0.5; // El volumen empieza al 50%

// ============================
// CONTROL SPLASH SCREEN
// ============================
window.addEventListener("DOMContentLoaded", () => {
  const splash = document.getElementById("splash-screen");
  const startBtn = document.getElementById("startBtn");

  if(startBtn && splash) {
    startBtn.addEventListener("click", () => {
      splash.classList.add("hidden");
      // Inicializar contexto de audio con interacción de usuario (Requisito de navegadores)
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
    });
  }
});

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

  // D. Renderizar marcadores (Usamos función nueva para soportar filtros)
  renderMarkers(places);

  // E. Botones globales
  const randomBtn = document.getElementById('randomBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resetBtn = document.getElementById("resetPassportBtn");
  
  if(randomBtn) randomBtn.onclick = goRandom;
  if(stopBtn) stopBtn.onclick = stopSound;
  if(resetBtn) resetBtn.onclick = resetPassport;

  // F. Inicializar UI
  updatePassport();
  initSearch();
  initFilters(); // NUEVO: Activar botones de filtro
}

// ==========================================
// LOGICA DE MAPA Y MARCADORES (Con Filtros)
// ==========================================
function renderMarkers(listToRender) {
  // 1. Limpiar mapa actual
  markers.forEach(m => map.removeLayer(m));
  markers = []; 

  // 2. Pintar nuevos
  listToRender.forEach(p => {
    const m = L.marker([p.lat, p.lng]).addTo(map);
    m.on('click', () => showPlace(p, m));
    m.bindTooltip(p.country); 
    m.placeData = p; // Guardar referencia para búsqueda
    markers.push(m);
  });
}

function initFilters() {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Estilo activo
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Lógica de filtrado
      const category = btn.getAttribute('data-cat');
      if (category === 'all') {
        renderMarkers(places);
      } else {
        const filtered = places.filter(p => p.category === category);
        renderMarkers(filtered);
      }
    });
  });
}

// ==========================================
// MODAL CONTROL
// ==========================================
const resetModal = document.getElementById("resetModal");
const cancelReset = document.getElementById("cancelReset");
const confirmReset = document.getElementById("confirmReset");

if(cancelReset) cancelReset.onclick = () => resetModal.classList.add("hidden");

function openResetModal() {
  if(resetModal) resetModal.classList.remove("hidden");
}

if(confirmReset) confirmReset.onclick = () => {
  resetModal.classList.add("hidden");
  executePassportReset();
};

// ==========================================
// 3. MOSTRAR PAÍS (INTERFAZ + CANVAS)
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
    saveVisited(); // Guardar progreso real
    updatePassport();
  }

  const isVisited = visitedCountries.includes(place.country);
  const badgeHTML = isVisited ? '<span class="visited-tag">✅ Visitado</span>' : '';

  // Parar audio anterior
  fadeOutAndStop();

  const info = document.getElementById('info');
  
  // HTML (INCLUYE CATEGORÍA Y CANVAS VISUALIZADOR)
  info.innerHTML = `
    <h2>${place.country} ${badgeHTML}</h2>
    <div style="margin-bottom:5px;">
      <span style="font-size:0.8rem; background:#232a34; padding:2px 6px; border-radius:4px; color:#a9b4c0;">
        ${place.category ? place.category.toUpperCase() : 'GENERAL'}
      </span>
    </div>
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

      <canvas id="audioVisualizer"></canvas>
    </div>
  `;

  // Asignar eventos
  document.getElementById('playBtn').onclick  = () => startAudio(place.sound);
  document.getElementById('pauseBtn').onclick = pauseAudio;

  // Evento Volumen
  const slider = document.getElementById('volSlider');
  slider.addEventListener('input', (e) => {
    globalVolume = parseFloat(e.target.value);
    if (currentAudio) currentAudio.volume = globalVolume;
  });

  map.flyTo([place.lat, place.lng], 5, { duration: 1.5 });
}

// ==========================================
// 4. AUDIO & VISUALIZADOR (WEB AUDIO API)
// ==========================================
function startAudio(src) {
  try {
    fadeOutAndStop(); // Limpieza previa

    // 1. Inicializar contexto si no existe
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // 2. Crear elemento de audio
    currentAudio = new Audio(src);
    currentAudio.crossOrigin = "anonymous"; // Vital para el canvas
    currentAudio.volume = 0; 
    currentAudio.loop = true;

    // 3. Conectar los "cables" para el visualizador
    source = audioContext.createMediaElementSource(currentAudio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128; // Cantidad de barras
    
    // Conectar: Fuente -> Analizador -> Altavoces
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    // Preparar array de datos
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // 4. Reproducir
    const playPromise = currentAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        fadeTo(globalVolume, 500);
        // INICIAR ANIMACIÓN
        drawVisualizer();
      }).catch(e => console.warn(e));
    }

    // Reactivar contexto si estaba suspendido (política de navegadores)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

  } catch (e) { 
    console.error("Error AudioContext:", e);
    // Fallback por si falla el visualizador
    if(currentAudio) currentAudio.play();
  }
}

function drawVisualizer() {
  const canvas = document.getElementById('audioVisualizer');
  if (!canvas || !analyser) return; 

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  // Loop de animación
  animationId = requestAnimationFrame(drawVisualizer);

  // Obtener datos
  analyser.getByteFrequencyData(dataArray);

  // Limpiar lienzo
  ctx.clearRect(0, 0, width, height);

  // Dibujar barras
  const barWidth = (width / dataArray.length) * 2.5;
  let barHeight;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    barHeight = dataArray[i] / 255 * height;

    // Color dinámico (Azul a Verde)
    const r = 31;
    const g = 111 + (barHeight * 2);
    const b = 235;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    
    ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
    x += barWidth;
  }
}

function pauseAudio() {
  if (currentAudio) currentAudio.pause();
  if (animationId) cancelAnimationFrame(animationId);
}

function stopSound() {
  fadeOutAndStop();
  if (activeMarker) {
    activeMarker.setOpacity(1);
    activeMarker = null;
  }
}

function fadeOutAndStop() {
  // Parar animación visual inmediatamente
  if (animationId) cancelAnimationFrame(animationId);
  
  if (!currentAudio) return;
  const soundToKill = currentAudio; 
  currentAudio = null; 
  
  // Fade out manual
  let vol = soundToKill.volume;
  const fadeOut = setInterval(() => {
    vol -= 0.1;
    if (vol <= 0) {
      clearInterval(fadeOut);
      try { 
        soundToKill.pause(); 
        // Desconectar nodos para liberar memoria
        if(source) { source.disconnect(); source = null; }
      } catch(e){}
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
  // Solo elegir entre los visibles (filtrados)
  const visiblePlaces = markers.map(m => m.placeData);
  if (!visiblePlaces.length) { alert("No hay países visibles"); return; }
  
  const r = visiblePlaces[Math.floor(Math.random() * visiblePlaces.length)];
  const m = markers.find(marker => marker.placeData === r);
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
  
  // Buscar marcador (aunque esté oculto por filtro, forzamos mostrarlo)
  let marker = markers.find(m => m.placeData === place);
  if (!marker) {
    document.querySelector('.filter-btn[data-cat="all"]').click(); // Reset filtros
    renderMarkers(places); // Forzar render
    setTimeout(() => {
       marker = markers.find(m => m.placeData === place);
       if(marker) showPlace(place, marker);
    }, 50);
  } else {
    showPlace(place, marker);
  }

  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  if(input) input.value = '';
  if(results) results.style.display = 'none';
}

// ABRIR MODAL
function resetPassport() {
  openResetModal();
}

// EJECUTAR RESETEO REAL
function executePassportReset() {
  visitedCountries = [];
  saveVisited();
  updatePassport();

  const info = document.getElementById("info");
  info.innerHTML = `<p>Haz clic en un país para escuchar su paisaje sonoro 🌍🎧</p>`;

  if (activeMarker) {
    activeMarker.setOpacity(1);
    activeMarker = null;
  }
  stopSound();
}

