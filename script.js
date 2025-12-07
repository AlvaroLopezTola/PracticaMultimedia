// ==========================================
// 1. VARIABLES GLOBALES
// ==========================================
let map;
let markers = [];
let places = []; 
let activeMarker = null;
let currentAudio = null;
let fadeTimer = null;

// VARIABLES DEL VISUALIZADOR DE AUDIO
let audioContext = null;
let analyser = null;
let dataArray = null;
let source = null;
let animationId = null;

// VARIABLES DEL ECUALIZADOR Y CONTROLES AVANZADOS
let bassFilter = null;
let midFilter = null;
let trebleFilter = null;
let isLooping = false;
let countryVolumes = JSON.parse(localStorage.getItem("soundtrip_volumes") || "{}");
let currentCountry = null;
let canvasAnimationMode = 'bars'; // 'bars', 'wave', 'circular'

// ==========================================
// CONFIGURACIÓN Y PERSISTENCIA PASAPORTE
// ==========================================
const STORAGE_KEY = "soundtrip_visited";
const FAVORITES_KEY = "soundtrip_favorites";
const COLLECTIONS_KEY = "soundtrip_collections";

let visitedCountries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
let favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
let collections = JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || "{}");

function saveVisited() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visitedCountries));
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function saveCollections() {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
}

let globalVolume = 0.5; 

// ============================
// CONTROL SPLASH SCREEN
// ============================
window.addEventListener("DOMContentLoaded", () => {
  const splash = document.getElementById("splash-screen");
  const startBtn = document.getElementById("startBtn");

  if(startBtn && splash) {
    startBtn.addEventListener("click", () => {
      splash.classList.add("hidden");
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

  // B. Capa Esri
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

  // D. Renderizar marcadores
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
  initFilters();
  initTabs();
  initFavorites();
  initCollections();
}

// ==========================================
// FUNCIONES AUXILIARES: API CLIMA
// ==========================================
async function getWeather(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    
    return {
      temp: data.current_weather.temperature,
      code: data.current_weather.weathercode,
      time: data.current_weather.time
    };
  } catch (e) {
    console.error("Error clima:", e);
    return null; 
  }
}

function getWeatherIcon(code) {
  if (code === 0) return "☀️"; 
  if (code >= 1 && code <= 3) return "⛅"; 
  if (code >= 45 && code <= 48) return "🌫️"; 
  if (code >= 51 && code <= 67) return "🌧️"; 
  if (code >= 71 && code <= 86) return "❄️"; 
  if (code >= 95) return "⛈️"; 
  return "🌡️";
}

// ==========================================
// LOGICA DE MAPA Y MARCADORES
// ==========================================
function renderMarkers(listToRender) {
  markers.forEach(m => map.removeLayer(m));
  markers = []; 

  listToRender.forEach(p => {
    const m = L.marker([p.lat, p.lng]).addTo(map);
    m.on('click', () => showPlace(p, m));
    m.bindTooltip(p.country); 
    m.placeData = p; 
    markers.push(m);
  });
}

function initFilters() {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

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
// 3. MOSTRAR PAÍS (FUNCIÓN PRINCIPAL ASÍNCRONA)
// ==========================================
async function showPlace(place, markerRef = null) {
  if (activeMarker) activeMarker.setOpacity(1);
  if (markerRef) {
    activeMarker = markerRef;
    activeMarker.setOpacity(0.5);
  }

  if (!visitedCountries.includes(place.country)) {
    visitedCountries.push(place.country);
    saveVisited();
    updatePassport();
  }

  const isVisited = visitedCountries.includes(place.country);
  const badgeHTML = isVisited ? '<span class="visited-tag">✅ Visitado</span>' : '';
  const isFavorite = favorites.includes(place.country);
  const favoriteBtn = isFavorite 
    ? '<button id="favBtn" style="background: #fbbf24; color: #000;">⭐ En favoritos</button>'
    : '<button id="favBtn">☆ Añadir a favoritos</button>';

  fadeOutAndStop();

  const info = document.getElementById('info');
  info.innerHTML = `<div style="text-align:center; padding:20px; color:#a9b4c0;">☁️ Conectando con satélite...</div>`;

  const weatherData = await getWeather(place.lat, place.lng);
  
  let weatherHTML = "";
  if (weatherData) {
    const icon = getWeatherIcon(weatherData.code);
    const localTime = weatherData.time.split("T")[1]; 
    
    weatherHTML = `
      <div class="weather-widget">
        <div class="weather-info">
          <span class="weather-icon">${icon}</span>
          <span>${weatherData.temp}°C</span>
        </div>
        <div class="local-time">
          Hora local
          <span>${localTime}</span>
        </div>
      </div>
    `;
  }

  info.innerHTML = `
    <h2>${place.country} ${badgeHTML}</h2>
    
    <div style="margin-bottom:5px;">
      <span style="font-size:0.8rem; background:#232a34; padding:2px 6px; border-radius:4px; color:#a9b4c0;">
        ${place.category ? place.category.toUpperCase() : 'GENERAL'}
      </span>
    </div>

    ${weatherHTML}

    <img src="${place.image}" alt="${place.country}" onerror="this.style.display='none'"/>
    <p>${place.description}</p>
    
    <div class="audio-controls" style="margin-top:10px;">
      <!-- BOTONES PRINCIPALES -->
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <button id="playBtn" style="flex:1;">▶ Reproducir</button>
        <button id="pauseBtn" style="flex:1; background:#303b47">⏸ Pausa</button>
      </div>

      ${favoriteBtn}

      <!-- VOLUMEN INDIVIDUAL POR PAÍS -->
      <div class="volume-container">
        <span class="volume-icon">🔊</span>
        <input type="range" id="volSlider" min="0" max="1" step="0.01" value="${countryVolumes[place.country] || 0.5}">
        <span id="volValue" style="font-size:0.85rem; color:var(--muted); min-width:35px;">50%</span>
      </div>

      <!-- BOTONES DE CONTROL AVANZADO -->
      <div style="display:flex; gap:6px; margin-top:10px;">
        <button id="loopBtn" class="control-btn" style="flex:1; background:#303b47;">🔁 Loop</button>
        <button id="vizModeBtn" class="control-btn" style="flex:1; background:#303b47;">📊 Viz</button>
      </div>

      <!-- ECUALIZADOR -->
      <div class="equalizer-section">
        <div class="eq-control">
          <label>Bass</label>
          <input type="range" id="bassSlider" min="-50" max="50" step="1" value="0" class="eq-slider">
          <span id="bassValue">0</span>
        </div>
        <div class="eq-control">
          <label>Mid</label>
          <input type="range" id="midSlider" min="-50" max="50" step="1" value="0" class="eq-slider">
          <span id="midValue">0</span>
        </div>
        <div class="eq-control">
          <label>Treble</label>
          <input type="range" id="trebleSlider" min="-50" max="50" step="1" value="0" class="eq-slider">
          <span id="trebleValue">0</span>
        </div>
      </div>

      <!-- VISUALIZADOR -->
      <canvas id="audioVisualizer"></canvas>
    </div>
  `;

  currentCountry = place;

  document.getElementById('playBtn').onclick  = () => startAudio(place.sound);
  document.getElementById('pauseBtn').onclick = pauseAudio;
  document.getElementById('favBtn').onclick = () => toggleFavorite(place);
  document.getElementById('loopBtn').onclick = toggleLoop;
  document.getElementById('vizModeBtn').onclick = toggleVisualizerMode;

  // Ecualizador
  const bassSlider = document.getElementById('bassSlider');
  const midSlider = document.getElementById('midSlider');
  const trebleSlider = document.getElementById('trebleSlider');
  
  if (bassSlider) bassSlider.addEventListener('input', (e) => updateEqualizer('bass', e.target.value));
  if (midSlider) midSlider.addEventListener('input', (e) => updateEqualizer('mid', e.target.value));
  if (trebleSlider) trebleSlider.addEventListener('input', (e) => updateEqualizer('treble', e.target.value));

  // Volumen individual por país
  const slider = document.getElementById('volSlider');
  if(slider) {
    slider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      globalVolume = vol;
      if (currentAudio) currentAudio.volume = vol;
      
      // Guardar volumen del país
      countryVolumes[place.country] = vol;
      localStorage.setItem("soundtrip_volumes", JSON.stringify(countryVolumes));
      
      // Mostrar porcentaje
      const volValue = document.getElementById('volValue');
      if (volValue) volValue.textContent = Math.round(vol * 100) + '%';
    });
  }

  map.flyTo([place.lat, place.lng], 5, { duration: 1.5 });
}

// ==========================================
// 4. AUDIO & VISUALIZADOR
// ==========================================
function startAudio(src) {
  try {
    fadeOutAndStop();

    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    currentAudio = new Audio(src);
    currentAudio.crossOrigin = "anonymous"; 
    currentAudio.volume = 0; 
    currentAudio.loop = isLooping;

    source = audioContext.createMediaElementSource(currentAudio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256; 
    
    // CREAR ECUALIZADOR CON FILTROS
    if (!bassFilter) {
      bassFilter = audioContext.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 200;
      bassFilter.gain.value = 0;
    }
    
    if (!midFilter) {
      midFilter = audioContext.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 0.5;
      midFilter.gain.value = 0;
    }
    
    if (!trebleFilter) {
      trebleFilter = audioContext.createBiquadFilter();
      trebleFilter.type = 'highshelf';
      trebleFilter.frequency.value = 5000;
      trebleFilter.gain.value = 0;
    }
    
    // CONECTAR: source -> bass -> mid -> treble -> analyser -> destination
    source.connect(bassFilter);
    bassFilter.connect(midFilter);
    midFilter.connect(trebleFilter);
    trebleFilter.connect(analyser);
    analyser.connect(audioContext.destination);

    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    const playPromise = currentAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        fadeTo(globalVolume, 500);
        drawVisualizer();
      }).catch(e => console.warn(e));
    }

    if (audioContext.state === 'suspended') audioContext.resume();

  } catch (e) { 
    console.error("Error AudioContext:", e);
    if(currentAudio) currentAudio.play();
  }
}

function drawVisualizer() {
  const canvas = document.getElementById('audioVisualizer');
  if (!canvas || !analyser) return; 

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  animationId = requestAnimationFrame(drawVisualizer);
  analyser.getByteFrequencyData(dataArray);
  ctx.clearRect(0, 0, width, height);

  if (canvasAnimationMode === 'bars') {
    drawBars(ctx, width, height);
  } else if (canvasAnimationMode === 'wave') {
    drawWave(ctx, width, height);
  } else if (canvasAnimationMode === 'circular') {
    drawCircular(ctx, width, height);
  }
}

function drawBars(ctx, width, height) {
  const barWidth = (width / dataArray.length) * 2.5;
  let barHeight;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    barHeight = dataArray[i] / 255 * height;
    const r = 31;
    const g = 111 + (barHeight * 2);
    const b = 235;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
    x += barWidth;
  }
}

function drawWave(ctx, width, height) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgb(31, 111, 235)';
  ctx.beginPath();

  const sliceWidth = width / dataArray.length;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * height) / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    x += sliceWidth;
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();

  // Línea de referencia
  ctx.strokeStyle = 'rgba(31, 111, 235, 0.2)';
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

function drawCircular(ctx, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 10;

  // Círculo de fondo
  ctx.fillStyle = 'rgba(31, 111, 235, 0.1)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fill();

  // Líneas radiales
  ctx.strokeStyle = 'rgba(31, 111, 235, 0.3)';
  for (let i = 0; i < dataArray.length; i++) {
    const angle = (i / dataArray.length) * 2 * Math.PI;
    const intensity = dataArray[i] / 255;
    
    const x1 = centerX + Math.cos(angle) * radius;
    const y1 = centerY + Math.sin(angle) * radius;
    const x2 = centerX + Math.cos(angle) * (radius + intensity * 30);
    const y2 = centerY + Math.sin(angle) * (radius + intensity * 30);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Puntos en círculo
  ctx.fillStyle = 'rgb(31, 111, 235)';
  for (let i = 0; i < dataArray.length; i += 4) {
    const angle = (i / dataArray.length) * 2 * Math.PI;
    const intensity = dataArray[i] / 255;
    
    const x = centerX + Math.cos(angle) * (radius + intensity * 30);
    const y = centerY + Math.sin(angle) * (radius + intensity * 30);

    ctx.beginPath();
    ctx.arc(x, y, 2 + intensity * 3, 0, 2 * Math.PI);
    ctx.fill();
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
  if (animationId) cancelAnimationFrame(animationId);
  
  if (!currentAudio) return;
  const soundToKill = currentAudio; 
  currentAudio = null; 
  
  let vol = soundToKill.volume;
  const fadeOut = setInterval(() => {
    vol -= 0.1;
    if (vol <= 0) {
      clearInterval(fadeOut);
      try { 
        soundToKill.pause(); 
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
// 5. UTILIDADES (Pasaporte, Random, Search, Modal)
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
  
  let marker = markers.find(m => m.placeData === place);
  if (!marker) {
    document.querySelector('.filter-btn[data-cat="all"]').click(); 
    renderMarkers(places); 
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

// ==========================================
// LÓGICA DEL MODAL DE REINICIO (CORREGIDA)
// ==========================================
const resetModal = document.getElementById("resetModal");
const cancelReset = document.getElementById("cancelReset");
const confirmReset = document.getElementById("confirmReset");

// Botón Cancelar
if(cancelReset) cancelReset.onclick = () => resetModal.classList.add("hidden");

// Función para abrir
function openResetModal() {
  if(resetModal) resetModal.classList.remove("hidden");
}

function resetPassport() {
  openResetModal();
}

// 🔥 AQUÍ ESTABA EL ERROR: Faltaba conectar el botón de confirmar
if(confirmReset) confirmReset.onclick = () => {
  resetModal.classList.add("hidden");
  executePassportReset();
};

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

// ==========================================
// SISTEMA DE FAVORITOS Y COLECCIONES
// ==========================================
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`${tabName}-panel`).classList.add('active');
    });
  });
}

function toggleFavorite(place) {
  const index = favorites.indexOf(place.country);
  
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(place.country);
  }
  
  saveFavorites();
  updateFavoritesList();
  
  // Actualizar botón en tiempo real
  const favBtn = document.getElementById('favBtn');
  if (favBtn) {
    if (favorites.includes(place.country)) {
      favBtn.textContent = '⭐ En favoritos';
      favBtn.style.background = '#fbbf24';
      favBtn.style.color = '#000';
    } else {
      favBtn.textContent = '☆ Añadir a favoritos';
      favBtn.style.background = '';
      favBtn.style.color = '';
    }
  }
}

function initFavorites() {
  updateFavoritesList();
}

function updateFavoritesList() {
  const favoritesList = document.getElementById('favoritesList');
  if (!favoritesList) return;

  if (favorites.length === 0) {
    favoritesList.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 20px;">No hay favoritos aún. Haz clic en ⭐ para agregar.</p>';
    return;
  }

  favoritesList.innerHTML = favorites.map(countryName => {
    const place = places.find(p => p.country === countryName);
    if (!place) return '';
    
    return `
      <div class="favorite-item" onclick="selectFavorite('${place.country}')">
        <img src="${place.image}" alt="${place.country}">
        <div class="favorite-item-info">
          <div class="favorite-item-name">${place.country}</div>
          <div class="favorite-item-category">${place.category || 'General'}</div>
        </div>
        <button class="favorite-item-remove" onclick="removeFavorite(event, '${place.country}')">✕</button>
      </div>
    `;
  }).join('');
}

function selectFavorite(countryName) {
  const place = places.find(p => p.country === countryName);
  if (!place) return;
  
  let marker = markers.find(m => m.placeData === place);
  if (!marker) {
    document.querySelector('.filter-btn[data-cat="all"]').click();
    renderMarkers(places);
    setTimeout(() => {
      marker = markers.find(m => m.placeData === place);
      if (marker) showPlace(place, marker);
    }, 50);
  } else {
    showPlace(place, marker);
  }
  
  // Cambiar a tab de info
  const infoTab = document.querySelector('.tab-btn[data-tab="info"]');
  if (infoTab) infoTab.click();
}

function removeFavorite(event, countryName) {
  event.stopPropagation();
  const index = favorites.indexOf(countryName);
  if (index > -1) {
    favorites.splice(index, 1);
    saveFavorites();
    updateFavoritesList();
  }
}

// ==========================================
// COLECCIONES
// ==========================================
function initCollections() {
  const createBtn = document.getElementById('createCollectionBtn');
  if (createBtn) {
    createBtn.addEventListener('click', createNewCollection);
  }
  
  const input = document.getElementById('newCollectionName');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') createNewCollection();
    });
  }
  
  updateCollectionsList();
}

function createNewCollection() {
  const input = document.getElementById('newCollectionName');
  if (!input) return;
  
  const name = input.value.trim();
  if (!name) {
    alert('Ingresa un nombre para la colección');
    return;
  }
  
  if (collections[name]) {
    alert('Ya existe una colección con ese nombre');
    return;
  }
  
  collections[name] = [];
  saveCollections();
  input.value = '';
  updateCollectionsList();
}

function updateCollectionsList() {
  const collectionsList = document.getElementById('collectionsList');
  if (!collectionsList) return;

  const collectionNames = Object.keys(collections);
  
  if (collectionNames.length === 0) {
    collectionsList.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 20px; font-size: 0.9rem;">Crea colecciones para organizar tus países favoritos.</p>';
    return;
  }

  collectionsList.innerHTML = collectionNames.map(collName => {
    const countries = collections[collName] || [];
    return `
      <div class="collection-item">
        <div class="collection-header">
          <span class="collection-name">${collName}</span>
          <span class="collection-count">${countries.length}</span>
        </div>
        
        <div class="collection-countries">
          ${countries.map(country => `
            <div class="collection-country">
              ${country}
              <span class="collection-country-remove" onclick="removeFromCollection(event, '${collName}', '${country}')">✕</span>
            </div>
          `).join('') || '<span style="color: var(--muted); font-size: 0.85rem;">Vacía</span>'}
        </div>
        
        <div class="collection-actions">
          <button class="collection-action-btn" onclick="addToCollectionModal('${collName}')">+ Agregar</button>
          <button class="collection-action-btn delete" onclick="deleteCollection('${collName}')">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

function addToCollectionModal(collectionName) {
  const availableCountries = favorites.filter(c => 
    !collections[collectionName].includes(c)
  );
  
  if (availableCountries.length === 0) {
    alert('No hay favoritos disponibles para agregar a esta colección');
    return;
  }
  
  const selection = prompt(
    `Agregar a "${collectionName}":\n\n${availableCountries.join(', ')}`,
    availableCountries[0]
  );
  
  if (selection && availableCountries.includes(selection)) {
    if (!collections[collectionName].includes(selection)) {
      collections[collectionName].push(selection);
      saveCollections();
      updateCollectionsList();
    }
  }
}

function removeFromCollection(event, collectionName, country) {
  event.stopPropagation();
  const index = collections[collectionName].indexOf(country);
  if (index > -1) {
    collections[collectionName].splice(index, 1);
    saveCollections();
    updateCollectionsList();
  }
}

function deleteCollection(collectionName) {
  if (confirm(`¿Eliminar la colección "${collectionName}"?`)) {
    delete collections[collectionName];
    saveCollections();
    updateCollectionsList();
  }
}

// ==========================================
// ECUALIZADOR Y CONTROLES AVANZADOS
// ==========================================
function updateEqualizer(type, value) {
  const numValue = parseInt(value) / 10; // Convertir -50/50 a -5/5
  
  if (type === 'bass' && bassFilter) {
    bassFilter.gain.value = numValue;
    const bassValue = document.getElementById('bassValue');
    if (bassValue) bassValue.textContent = value;
  } else if (type === 'mid' && midFilter) {
    midFilter.gain.value = numValue;
    const midValue = document.getElementById('midValue');
    if (midValue) midValue.textContent = value;
  } else if (type === 'treble' && trebleFilter) {
    trebleFilter.gain.value = numValue;
    const trebleValue = document.getElementById('trebleValue');
    if (trebleValue) trebleValue.textContent = value;
  }
}

function toggleLoop() {
  isLooping = !isLooping;
  const loopBtn = document.getElementById('loopBtn');
  
  if (loopBtn) {
    loopBtn.style.background = isLooping ? '#10b981' : '#303b47';
    loopBtn.style.color = isLooping ? '#fff' : '';
  }
  
  if (currentAudio) {
    currentAudio.loop = isLooping;
  }
}

function toggleVisualizerMode() {
  const modes = ['bars', 'wave', 'circular'];
  const currentIndex = modes.indexOf(canvasAnimationMode);
  canvasAnimationMode = modes[(currentIndex + 1) % modes.length];
  
  const vizModeBtn = document.getElementById('vizModeBtn');
  if (vizModeBtn) {
    const modeNames = { 'bars': '📊 Barras', 'wave': '〰️ Onda', 'circular': '🔵 Circular' };
    vizModeBtn.textContent = modeNames[canvasAnimationMode];
  }
}

