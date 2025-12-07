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

// VARIABLES PARA ZONA HORARIA
let currentTimezoneOffset = 0;
let timezoneUpdateInterval = null;

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

// TEMA (DARK/LIGHT)
const THEME_KEY = "soundtrip_theme";
let currentTheme = localStorage.getItem(THEME_KEY) || 'dark';

// ============================
// CONTROL SPLASH SCREEN
// ============================
window.addEventListener("DOMContentLoaded", () => {
  const splash = document.getElementById("splash-screen");
  const startBtn = document.getElementById("startBtn");

  // Aplicar tema al cargar
  applyTheme(currentTheme);
  initThemeToggle();

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
  const guidedTourBtn = document.getElementById('guidedTourBtn');
  
  if(randomBtn) randomBtn.onclick = goRandom;
  if(stopBtn) stopBtn.onclick = stopSound;
  if(resetBtn) resetBtn.onclick = resetPassport;
  if(guidedTourBtn) {
    guidedTourBtn.onclick = () => {
      document.getElementById('guidedTourModal').classList.remove('hidden');
    };
  }

  // F. Inicializar UI
  updatePassport();
  initSearch();
  initFilters();
  initTabs();
  initFavorites();
  initCollections();
  initGuidedTour();
  initExport();
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
      time: data.current_weather.time,
      timezone: data.timezone
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

function getLocalTimeString(timeString, timezone) {
  try {
    // El timeString ya viene en la zona horaria local desde el API
    // Solo necesitamos extraer hora y minutos
    // Formato: "2024-12-07T13:15"
    const timePart = timeString.split('T')[1]; // "13:15"
    
    if (timePart && timePart.length >= 5) {
      return timePart.substring(0, 5); // "13:15"
    }
    
    return timeString.substring(11, 16);
  } catch (e) {
    console.error("Error formateando hora:", e);
    return timeString.substring(11, 16);
  }
}

function getCurrentLocalTime(offsetHours) {
  try {
    // Obtener hora actual en UTC
    const now = new Date();
    
    // Crear hora en zona horaria local basándose en el offset
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    
    let localHours = parseInt(utcHours) + parseInt(offsetHours);
    let localMinutes = parseInt(utcMinutes);
    
    // Ajustar si se pasa de 24 horas o es negativo
    if (localHours >= 24) {
      localHours -= 24;
    } else if (localHours < 0) {
      localHours += 24;
    }
    
    // Asegurar que son números enteros positivos
    localHours = Math.max(0, Math.min(23, Math.floor(localHours)));
    localMinutes = Math.max(0, Math.min(59, Math.floor(localMinutes)));
    
    const hoursStr = String(localHours).padStart(2, '0');
    const minutesStr = String(localMinutes).padStart(2, '0');
    
    return `${hoursStr}:${minutesStr}`;
  } catch (e) {
    console.error("Error calculando hora local:", e, "offset:", offsetHours);
    return "00:00";
  }
}

function getCurrentLocalTimeByTimezone(timezone) {
  try {
    // Usar Intl.DateTimeFormat para obtener la hora en la zona horaria correcta
    const now = new Date();
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone
    });
    
    return formatter.format(now);
  } catch (e) {
    console.error("Error formateando hora con Intl:", e);
    return "00:00";
  }
}

function startTimeUpdate(timezone) {
  // Limpiar intervalo anterior si existe
  if (timezoneUpdateInterval) {
    clearInterval(timezoneUpdateInterval);
  }
  
  // Actualizar hora cada segundo
  timezoneUpdateInterval = setInterval(() => {
    const timeSpan = document.querySelector('.local-time span');
    if (timeSpan) {
      timeSpan.textContent = getCurrentLocalTimeByTimezone(timezone);
    }
  }, 1000);
}

function stopTimeUpdate() {
  if (timezoneUpdateInterval) {
    clearInterval(timezoneUpdateInterval);
    timezoneUpdateInterval = null;
  }
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
    // Obtener la hora actual en la zona horaria local
    const localTime = getCurrentLocalTimeByTimezone(weatherData.timezone);
    
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
    
    // Iniciar actualización de hora en tiempo real
    startTimeUpdate(weatherData.timezone);
  }

  info.innerHTML = `
    <h2>${place.country} ${badgeHTML}</h2>
    
    <div style="margin-bottom:8px; display:flex; gap:8px; align-items:center;">
      <span style="font-size:0.8rem; background:#232a34; padding:2px 6px; border-radius:4px; color:#a9b4c0;">
        ${place.category ? place.category.toUpperCase() : 'GENERAL'}
      </span>
      <button id="speakBtn" class="speak-btn" title="Escuchar información">🔊 Escuchar</button>
    </div>

    ${weatherHTML}

    <!-- ZONA HORARIA -->
    ${place.timezone ? `
      <div class="info-widget timezone-widget">
        <span>🕐 Zona horaria: <strong>${place.timezone.split('/')[1]}</strong></span>
      </div>
    ` : ''}

    <img src="${place.image}" alt="${place.country}" onerror="this.style.display='none'"/>
    <p>${place.description}</p>

    <!-- TRIVIA -->
    ${place.trivia ? `
      <div class="trivia-box">
        <p style="margin:0; font-size:0.9rem; color:#34d399;">💡 ${place.trivia}</p>
      </div>
    ` : ''}
    
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
  
  // Botón para síntesis de voz
  const speakBtn = document.getElementById('speakBtn');
  if (speakBtn) {
    speakBtn.onclick = () => speakPlaceInfo(place);
  }

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
  stopTimeUpdate();
  stopGuidedTour();
  if (activeMarker) {
    activeMarker.setOpacity(1);
    activeMarker = null;
  }
}

function stopAudio() {
  // Parar audio de forma inmediata para transiciones en viaje guiado
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (animationId) cancelAnimationFrame(animationId);
  if (source) {
    try { source.disconnect(); } catch(e) {}
    source = null;
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

// ==========================================
// SISTEMA DE TEMA CLARO/OSCURO
// ==========================================
function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
    updateThemeButton();
  }
}

function applyTheme(theme) {
  currentTheme = theme;
  
  if (theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
  
  localStorage.setItem(THEME_KEY, theme);
  updateThemeButton();
}

function toggleTheme() {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

function updateThemeButton() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
    themeToggleBtn.title = currentTheme === 'dark' 
      ? 'Cambiar a tema claro' 
      : 'Cambiar a tema oscuro';
  }
}

// ==========================================
// INFORMACIÓN ENRIQUECIDA Y SÍNTESIS DE VOZ
// ==========================================
function speakPlaceInfo(place) {
  // Cancelar cualquier síntesis anterior
  speechSynthesis.cancel();
  
  // Preparar el texto a pronunciar
  let textToSpeak = `${place.country}. ${place.description}. `;
  
  if (place.trivia) {
    textToSpeak += `Dato curioso: ${place.trivia}. `;
  }
  
  if (place.timezone) {
    const tzName = place.timezone.split('/')[1];
    textToSpeak += `La zona horaria es ${tzName}. `;
  }

  // Crear utterance para síntesis de voz
  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  utterance.lang = 'es-ES'; // Español
  utterance.rate = 0.9; // Velocidad normal
  utterance.pitch = 1;
  utterance.volume = 1;

  // Reproducir
  speechSynthesis.speak(utterance);
  
  // Actualizar botón mientras se está hablando
  const speakBtn = document.getElementById('speakBtn');
  if (speakBtn) {
    speakBtn.style.background = '#10b981';
    speakBtn.textContent = '⏸ Deteniendo...';
    
    utterance.onend = () => {
      speakBtn.style.background = '';
      speakBtn.textContent = '🔊 Escuchar';
    };
  }
}

function stopSpeaking() {
  speechSynthesis.cancel();
  const speakBtn = document.getElementById('speakBtn');
  if (speakBtn) {
    speakBtn.style.background = '';
    speakBtn.textContent = '🔊 Escuchar';
  }
}

// ==========================================
// 9. VIAJE VIRTUAL GUIADO ✈️
// ==========================================

let guidedTourActive = false;
let guidedTourCountries = [];
let currentTourIndex = 0;
let guidedTourTimeout = null;

const CONTINENTS_MAP = {
  europe: ["Spain", "France", "UK", "Italy"],
  asia: ["Japan", "India"],
  america: ["USA", "Brazil", "Mexico"],
  africa: [],
  oceania: ["Australia"]
};

function initGuidedTour() {
  const modal = document.getElementById('guidedTourModal');
  const buttons = document.querySelectorAll('.continent-btn');
  
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const continent = btn.getAttribute('data-continent');
      startGuidedTour(continent);
      modal.classList.add('hidden');
    });
  });
  
  const cancelBtn = document.getElementById('cancelGuidedTour');
  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}

function startGuidedTour(continent) {
  // Obtener países del continente
  const countriesNames = CONTINENTS_MAP[continent];
  
  if (countriesNames.length === 0) {
    alert('No hay países disponibles en este continente.');
    return;
  }
  
  // Filtrar los lugares que corresponden al continente
  guidedTourCountries = places.filter(place => countriesNames.includes(place.country));
  
  if (guidedTourCountries.length === 0) {
    alert('No se encontraron países en este continente.');
    return;
  }
  
  guidedTourActive = true;
  currentTourIndex = 0;
  
  // Mostrar el primer país
  showGuidedTourPlace();
}

function showGuidedTourPlace() {
  if (currentTourIndex >= guidedTourCountries.length) {
    // Fin del viaje
    endGuidedTour();
    return;
  }
  
  const place = guidedTourCountries[currentTourIndex];
  
  // Hacer clic en el marcador para mostrar el país
  const marker = markers.find(m => m.place === place);
  if (marker) {
    marker.openPopup();
  }
  
  // Narración de transición ANTES de mostrar la información
  if (currentTourIndex > 0) {
    narrateTourTransition(place);
  } else {
    narrateTourStart(place);
  }
  
  // Mostrar la información completa del país de forma asincrónica
  setTimeout(async () => {
    await showPlace(place, marker);
    
    // Iniciar reproducción automática después de que se cargue la información
    setTimeout(() => {
      const playBtn = document.getElementById('playBtn');
      if (playBtn) {
        playBtn.click();
      }
    }, 500);
    
    // Pasar al siguiente país después del tiempo especificado
    const duration = currentTourIndex === guidedTourCountries.length - 1 ? 10000 : 12000;
    
    guidedTourTimeout = setTimeout(() => {
      // Parar el audio antes de pasar al siguiente país
      stopAudio();
      currentTourIndex++;
      showGuidedTourPlace();
    }, duration);
  }, 300);
}

function narrateTourStart(place) {
  const continentEmojis = {
    europe: '🇪🇺',
    asia: '🌏',
    america: '🌎',
    africa: '🌍',
    oceania: '🏝️'
  };
  
  const emoji = continentEmojis[place.continent] || '🌍';
  
  const text = `Bienvenido a nuestro viaje virtual. Comenzamos explorando ${place.country}. ${emoji} ${place.description}`;
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
}

function narrateTourTransition(place) {
  const text = `Nuestro viaje continúa. Ahora nos dirigimos a ${place.country}. ${place.description}`;
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
}

function stopGuidedTour() {
  if (guidedTourActive) {
    guidedTourActive = false;
    if (guidedTourTimeout) {
      clearTimeout(guidedTourTimeout);
      guidedTourTimeout = null;
    }
    speechSynthesis.cancel();
  }
}

function endGuidedTour() {
  guidedTourActive = false;
  guidedTourCountries = [];
  currentTourIndex = 0;
  
  stopAudio();
  
  const text = 'Hemos llegado al final de nuestro viaje virtual alrededor del mundo. ¡Esperamos que hayas disfrutado explorando nuevas culturas y sonidos!';
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
  
  // Mostrar información en el panel después de que termine la narración
  utterance.onend = () => {
    const infoPanel = document.getElementById('info');
    if (infoPanel) {
      infoPanel.innerHTML = '<p style="color: #10b981; font-weight: 600; text-align: center; padding: 20px;">✈️ Viaje completado. ¡Puedes explorar más países o iniciar otro viaje!</p>';
    }
  };
}

// ==========================================
// 10. EXPORTAR/COMPARTIR 📤
// ==========================================

function initExport() {
  const exportBtn = document.getElementById('exportBtn');
  const downloadListBtn = document.getElementById('downloadListBtn');
  const generateQRBtn = document.getElementById('generateQRBtn');
  const downloadCSVBtn = document.getElementById('downloadCSVBtn');
  const cancelExportBtn = document.getElementById('cancelExport');
  const downloadQRBtn = document.getElementById('downloadQRBtn');
  const closeQRModalBtn = document.getElementById('closeQRModal');
  
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      document.getElementById('exportModal').classList.remove('hidden');
    });
  }
  
  if (downloadListBtn) {
    downloadListBtn.addEventListener('click', downloadCountriesList);
  }
  
  if (generateQRBtn) {
    generateQRBtn.addEventListener('click', generatePassportQR);
  }
  
  if (downloadCSVBtn) {
    downloadCSVBtn.addEventListener('click', downloadCSV);
  }
  
  if (cancelExportBtn) {
    cancelExportBtn.addEventListener('click', () => {
      document.getElementById('exportModal').classList.add('hidden');
    });
  }
  
  if (downloadQRBtn) {
    downloadQRBtn.addEventListener('click', downloadQRImage);
  }
  
  if (closeQRModalBtn) {
    closeQRModalBtn.addEventListener('click', () => {
      document.getElementById('qrModal').classList.add('hidden');
      document.getElementById('qrContainer').innerHTML = '';
    });
  }
}

function downloadCountriesList() {
  // Crear contenido del archivo
  let content = "SOUNDTRIP - PASAPORTE DE VIAJERO\n";
  content += "================================\n\n";
  content += `Fecha de generación: ${new Date().toLocaleString('es-ES')}\n\n`;
  content += `Países visitados: ${visitedCountries.length} / 10\n\n`;
  content += "LISTA DE PAÍSES:\n";
  content += "-----------------\n";
  
  if (visitedCountries.length === 0) {
    content += "Aún no has visitado ningún país.\n";
  } else {
    visitedCountries.forEach((country, index) => {
      content += `${index + 1}. ${country}\n`;
    });
  }
  
  content += "\n\nPaíses restantes por visitar:\n";
  const allCountries = places.map(p => p.country);
  const remaining = allCountries.filter(c => !visitedCountries.includes(c));
  
  if (remaining.length === 0) {
    content += "¡Felicidades! ¡Has visitado todos los países!\n";
  } else {
    remaining.forEach((country, index) => {
      content += `• ${country}\n`;
    });
  }
  
  content += "\n\nGenerado por SoundTrip 🌍🎧\n";
  
  // Crear y descargar archivo
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `soundtrip-pasaporte-${new Date().getTime()}.txt`;
  link.click();
  
  document.getElementById('exportModal').classList.add('hidden');
}

function generatePassportQR() {
  // Crear datos del pasaporte en JSON
  const passportData = {
    app: 'SoundTrip',
    version: '1.0',
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('es-ES'),
    time: new Date().toLocaleTimeString('es-ES'),
    summary: {
      totalVisited: visitedCountries.length,
      totalCountries: 10,
      percentage: Math.round((visitedCountries.length / 10) * 100)
    },
    countries: visitedCountries,
    remainingCountries: places.filter(p => !visitedCountries.includes(p.country)).map(p => p.country)
  };
  
  // Crear un blob con los datos JSON
  const jsonString = JSON.stringify(passportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  // Crear enlace de descarga y convertirlo a data URL para el QR
  const fileName = `soundtrip-passport-${new Date().getTime()}.json`;
  
  // Para el QR, vamos a usar la URL del blob (esto permitirá descargar)
  // Pero como los QR externos no pueden acceder a URLs de blob, 
  // usaremos un formato de texto que el usuario pueda copiar/usar
  const qrText = `SoundTrip Passport Data:\n${jsonString}`;
  
  // Limpiar container anterior
  const qrContainer = document.getElementById('qrContainer');
  qrContainer.innerHTML = '';
  
  // Usar servicio QR externo (qrserver.com)
  const encodedText = encodeURIComponent(qrText);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodedText}`;
  
  // Crear imagen del QR
  const qrImg = document.createElement('img');
  qrImg.src = qrImageUrl;
  qrImg.alt = 'Código QR del pasaporte';
  qrImg.style.borderRadius = '8px';
  qrImg.style.border = '2px solid var(--border)';
  qrImg.id = 'qrImage';
  
  qrContainer.appendChild(qrImg);
  
  // Guardar referencia al blob para la descarga
  window.passportBlob = blob;
  window.passportFileName = fileName;
  
  // Actualizar contador
  document.getElementById('qrCountries').textContent = visitedCountries.length;
  
  // Mostrar modal del QR
  document.getElementById('exportModal').classList.add('hidden');
  document.getElementById('qrModal').classList.remove('hidden');
}

function downloadQRImage() {
  // Opción 1: Descargar el JSON del pasaporte (mejor alternativa)
  if (window.passportBlob && window.passportFileName) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(window.passportBlob);
    link.download = window.passportFileName;
    link.click();
    return;
  }
  
  // Opción 2: Si falla, descargar la imagen QR
  const qrImg = document.getElementById('qrImage');
  if (qrImg && qrImg.src) {
    const link = document.createElement('a');
    link.href = qrImg.src;
    link.download = `soundtrip-qr-${new Date().getTime()}.png`;
    link.click();
  }
}

function downloadCSV() {
  // BOM para UTF-8 (necesario para Excel reconozca los caracteres especiales)
  const BOM = '\uFEFF';
  
  // Preparar datos CSV
  let csvContent = 'País,Visitado,Categoría,Zona Horaria\n';
  
  places.forEach(place => {
    const isVisited = visitedCountries.includes(place.country) ? 'Sí' : 'No';
    const category = place.category || 'General';
    const timezone = place.timezone ? place.timezone.split('/')[1] : 'N/A';
    
    csvContent += `${place.country},${isVisited},${category},${timezone}\n`;
  });
  
  // Agregar resumen
  csvContent += '\n';
  csvContent += `RESUMEN,,,\n`;
  csvContent += `Total visitados,${visitedCountries.length},,\n`;
  csvContent += `Total por visitar,${places.length - visitedCountries.length},,\n`;
  csvContent += `Porcentaje completado,${Math.round((visitedCountries.length / places.length) * 100)}%,,\n`;
  csvContent += `Fecha de exportación,${new Date().toLocaleString('es-ES')},,\n`;
  csvContent += `Países visitados,${visitedCountries.join('; ')},,\n`;
  
  // Crear y descargar archivo con BOM
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `soundtrip-datos-${new Date().getTime()}.csv`;
  link.click();
  
  document.getElementById('exportModal').classList.add('hidden');
}

