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

// ==========================================
// CONFIGURACIÓN Y PERSISTENCIA PASAPORTE
// ==========================================
const STORAGE_KEY = "soundtrip_visited";
let visitedCountries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

function saveVisited() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visitedCountries));
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

  document.getElementById('playBtn').onclick  = () => startAudio(place.sound);
  document.getElementById('pauseBtn').onclick = pauseAudio;

  const slider = document.getElementById('volSlider');
  if(slider) {
    slider.addEventListener('input', (e) => {
      globalVolume = parseFloat(e.target.value);
      if (currentAudio) currentAudio.volume = globalVolume;
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
    currentAudio.loop = true;

    source = audioContext.createMediaElementSource(currentAudio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128; 
    
    source.connect(analyser);
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

