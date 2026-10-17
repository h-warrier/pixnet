// IMPORTANT: Replace this with the URL of your deployed Python backend API!
const API_ENDPOINT = "https://ai-chatbot-backend-xbng.onrender.com/api/chat";

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const btnTheme = document.getElementById('btn-theme');

let sessionId = localStorage.getItem('chatbotSessionId');
if (!sessionId) {
    sessionId = 'session_' + Date.now() + Math.random().toString(16).slice(2);
    localStorage.setItem('chatbotSessionId', sessionId);
}

// ---------------- Renderer registry ----------------
const renderers = [];
function registerRenderer(matcher, rendererFn){
    renderers.push({ matcher, rendererFn });
}

async function runRenderersForMessage(text, container){
    for (const r of renderers) {
        try {
            const match = r.matcher(text);
            if (match) {
                await r.rendererFn(match, container);
            }
        } catch (err) {
            console.warn('Renderer error', err);
        }
    }
}

// ---------------- Weather renderer (client-side, no API key) ----------------
const WEATHER_LOOKUP = {
    0: { label: 'Clear sky', icon: '☀️', tone: 'sun' },
    1: { label: 'Mainly clear', icon: '🌤️', tone: 'sun' },
    2: { label: 'Partly cloudy', icon: '⛅', tone: 'cloud' },
    3: { label: 'Overcast', icon: '☁️', tone: 'cloud' },
    45: { label: 'Fog', icon: '🌫️', tone: 'mist' },
    48: { label: 'Rime fog', icon: '🌫️', tone: 'mist' },
    51: { label: 'Light drizzle', icon: '🌦️', tone: 'rain' },
    53: { label: 'Drizzle', icon: '🌦️', tone: 'rain' },
    55: { label: 'Heavy drizzle', icon: '🌧️', tone: 'rain' },
    61: { label: 'Rain', icon: '🌧️', tone: 'rain' },
    63: { label: 'Rain', icon: '🌧️', tone: 'rain' },
    65: { label: 'Heavy rain', icon: '🌧️', tone: 'rain' },
    71: { label: 'Light snow', icon: '🌨️', tone: 'snow' },
    73: { label: 'Snow', icon: '❄️', tone: 'snow' },
    75: { label: 'Heavy snow', icon: '❄️', tone: 'snow' },
    80: { label: 'Rain showers', icon: '🌦️', tone: 'rain' },
    81: { label: 'Showers', icon: '🌧️', tone: 'rain' },
    82: { label: 'Heavy showers', icon: '⛈️', tone: 'storm' },
    95: { label: 'Thunderstorm', icon: '⛈️', tone: 'storm' },
    96: { label: 'Thunderstorm + hail', icon: '⛈️', tone: 'storm' },
    99: { label: 'Severe hail', icon: '⛈️', tone: 'storm' }
};

function detectWeatherQuery(text) {
    const q = String(text || '').toLowerCase();
    const weatherKeywords = /(weather|forecast|temperature|climate)/i;
    if (!weatherKeywords.test(q)) return null;

    // extract location if present in common forms
    const placeMatch = q.match(/(?:in|at|for|around)\s+([a-z0-9\s,.-]+)/i) || q.match(/(?:weather|forecast|temperature)\s+(?:for\s+)?([a-z0-9\s,.-]+)/i);
    const place = placeMatch ? placeMatch[1].trim() : null;
    return { place };
}

async function geocodePlace(place) {
    const key = 'geo_' + place.toLowerCase();
    try {
        const cached = sessionStorage.getItem(key);
        if (cached) return JSON.parse(cached);
    } catch (e) {}

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error('Geocoding failed');
    const data = await resp.json();
    if (!data || data.length === 0) throw new Error('Location not found');
    const first = data[0];
    const out = {
        lat: parseFloat(first.lat),
        lon: parseFloat(first.lon),
        display_name: first.display_name || place
    };
    try { sessionStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
    return out;
}

async function fetchWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,apparent_temperature&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error('Weather fetch failed');
    return resp.json();
}

function formatTemperature(v) {
    return `${Math.round(v)}°C`;
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createSparkline(values, width = 220, height = 54) {
    const safeValues = values.filter(Number.isFinite);
    if (!safeValues.length) return null;
    const min = Math.min(...safeValues);
    const max = Math.max(...safeValues);
    const range = max - min || 1;
    const step = width / (safeValues.length - 1);
    const points = safeValues.map((value, i) => {
        const x = i * step;
        const y = height - ((value - min) / range) * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = `
      <polyline fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="2" points="${points.join(' ')}" stroke-linecap="round" stroke-linejoin="round" />
    `;
    return svg;
}

function addWeatherCard(container, data) {
    const card = document.createElement('div');
    card.className = `weather-card weather-${data.tone}`;

    const header = document.createElement('div');
    header.className = 'weather-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'weather-title-wrap';
    titleWrap.innerHTML = `<div class="weather-name">${data.place}</div>`;

    const current = document.createElement('div');
    current.className = 'weather-current';
    current.innerHTML = `
      <div class="weather-icon">${data.icon}</div>
      <div>
        <div class="weather-temp">${data.temp}</div>
        <div class="weather-condition">${data.label}</div>
      </div>
    `;

    header.appendChild(titleWrap);
    header.appendChild(current);

    const body = document.createElement('div');
    body.className = 'weather-body';

    const row = document.createElement('div');
    row.className = 'weather-row';
    row.innerHTML = `
      <div>High: <strong>${data.high}</strong></div>
      <div>Low: <strong>${data.low}</strong></div>
      <div>Feels: <strong>${data.feels}</strong></div>
    `;

    const details = document.createElement('div');
    details.className = 'weather-detail-row';
    details.innerHTML = `
      <span>Sunrise: ${data.sunrise}</span>
      <span>Sunset: ${data.sunset}</span>
    `;

    body.appendChild(row);
    body.appendChild(details);

    if (data.sparkline) {
        const sparkWrap = document.createElement('div');
        sparkWrap.className = 'weather-spark';
        sparkWrap.appendChild(data.sparkline);
        body.appendChild(sparkWrap);
    }

    card.appendChild(header);
    card.appendChild(body);

    const wrapper = document.createElement('div');
    wrapper.className = 'message bot-message';
    wrapper.appendChild(card);
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

async function weatherRenderer(match, container){
    try {
        const targetPlace = match.place || 'your location';
        let placeInfo;

        if (match.place) {
            placeInfo = await geocodePlace(match.place);
        } else if (navigator.geolocation) {
            placeInfo = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Location lookup timeout')), 8000);
                navigator.geolocation.getCurrentPosition(
                    (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, display_name: 'Your location' }); },
                    () => { clearTimeout(timer); reject(new Error('Geolocation unavailable')); },
                    { timeout: 7000 }
                );
            });
        }

        if (!placeInfo) throw new Error('No location available');

        const weather = await fetchWeather(placeInfo.lat, placeInfo.lon);
        const currentWeather = weather.current_weather || {};
        const weatherCode = Number(currentWeather.weathercode || 0);
        const meta = WEATHER_LOOKUP[weatherCode] || WEATHER_LOOKUP[0];

        const times = (weather.hourly && weather.hourly.time) || [];
        const temps = (weather.hourly && weather.hourly.temperature_2m) || [];
        const apparent = (weather.hourly && weather.hourly.apparent_temperature) || [];
        const now = new Date();
        let startIdx = 0;
        for (let i = 0; i < times.length; i++) {
            if (new Date(times[i]) > now) { startIdx = i; break; }
        }
        const sliceTemps = temps.slice(startIdx, startIdx + 12);
        const sliceApp = apparent.slice(startIdx, startIdx + 12);

        const daily = weather.daily || {};
        const high = daily.temperature_2m_max && daily.temperature_2m_max[0] != null ? formatTemperature(daily.temperature_2m_max[0]) : '--';
        const low = daily.temperature_2m_min && daily.temperature_2m_min[0] != null ? formatTemperature(daily.temperature_2m_min[0]) : '--';
        const feelsVal = (sliceApp && sliceApp[0] != null) ? sliceApp[0] : (currentWeather.temperature != null ? currentWeather.temperature : null);
        const feels = feelsVal != null ? formatTemperature(feelsVal) : '--';
        const sunrise = daily.sunrise && daily.sunrise[0] ? formatTime(daily.sunrise[0]) : '--';
        const sunset = daily.sunset && daily.sunset[0] ? formatTime(daily.sunset[0]) : '--';

        const data = {
            place: placeInfo.display_name,
            temp: formatTemperature(currentWeather.temperature || 0),
            label: meta.label,
            icon: meta.icon,
            tone: meta.tone,
            high,
            low,
            feels,
            sunrise,
            sunset,
            sparkline: sliceTemps.length > 1 ? createSparkline(sliceTemps) : null
        };

        addWeatherCard(container, data);
    } catch (err) {
        const fallback = document.createElement('div');
        fallback.className = 'message bot-message';
        fallback.textContent = `I couldn’t fetch the visual weather details right now: ${err.message}`;
        container.appendChild(fallback);
        container.scrollTop = container.scrollHeight;
    }
}

registerRenderer(detectWeatherQuery, weatherRenderer);

// ---------------- Ambient blobs (existing) ----------------
const blobEls = Array.from(document.querySelectorAll('.blob'));
const blobState = blobEls.map((el) => ({
    el,
    x: Math.random() * 100,
    y: Math.random() * 100,
    vx: (Math.random() - 0.5) * 0.04,
    vy: (Math.random() - 0.5) * 0.04,
    hue: Math.random() * 360,
    hueSpeed: (Math.random() - 0.5) * 0.6
}));

function updateBlobs(ts, last) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return last;
    const delta = last ? ts - last : 16;
    for (const s of blobState) {
        s.x += s.vx * (delta / 16);
        s.y += s.vy * (delta / 16);
        if (s.x < -20) s.x = 120;
        if (s.x > 120) s.x = -20;
        if (s.y < -20) s.y = 120;
        if (s.y > 120) s.y = -20;
        s.hue = (s.hue + s.hueSpeed * (delta / 16) + 360) % 360;
        const tx = (s.x - 50) * 2.0;
        const ty = (s.y - 50) * 1.2;
        s.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.06)`;
        s.el.style.background = `radial-gradient(circle at 40% 40%, hsla(${s.hue},90%,65%,0.36), hsla(${(s.hue + 30) % 360},90%,55%,0.10) 30%, transparent 60%)`;
    }
    return ts;
}

let lastFrame = 0;
function loop(ts){
    lastFrame = updateBlobs(ts, lastFrame);
    requestAnimationFrame(loop);
}
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    requestAnimationFrame(loop);
}

// Theme toggle
if (btnTheme) {
    btnTheme.addEventListener('click', () => {
        const root = document.documentElement;
        const current = getComputedStyle(root).getPropertyValue('--bg').trim();
        if (current === '#0f1724') {
            root.style.setProperty('--bg', '#f6f9fb');
            root.style.setProperty('--text', '#0b1220');
        } else {
            root.style.setProperty('--bg', '#0f1724');
            root.style.setProperty('--text', '#EAF2F8');
        }
        btnTheme.querySelector('i').classList.toggle('fa-moon');
        btnTheme.querySelector('i').classList.toggle('fa-sun');
    });
}

// ---------------- Chat functions ----------------
function displayMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = message;

    // Append textual message
    chatMessages.appendChild(messageElement);

    // Run renderers to augment or replace text with visuals
    runRenderersForMessage(message, chatMessages).catch(() => {});

    if (chatMessages.childElementCount > 200) {
        const removeCount = 40;
        for (let i = 0; i < removeCount; i++) {
            if (chatMessages.firstChild) chatMessages.removeChild(chatMessages.firstChild);
        }
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setLoadingState(isLoading) {
    sendButton.disabled = isLoading;
    userInput.disabled = isLoading;
    userInput.placeholder = isLoading ? 'Thinking...' : 'Type your message...';
    sendButton.innerHTML = isLoading
        ? '<i class="fas fa-spinner fa-spin"></i>'
        : '<i class="fas fa-paper-plane"></i>';
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (message === '') return;

    displayMessage(message, 'user');
    userInput.value = '';
    setLoadingState(true);

    // Trigger weather visuals for matching queries, without blocking backend text response.
    const weatherMatch = detectWeatherQuery(message);
    if (weatherMatch) {
        weatherRenderer(weatherMatch, chatMessages).catch(() => {});
    }

    try {
        const payload = { message, session_id: sessionId };
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            displayMessage(`[Error: ${data.error}]`, 'bot');
        } else {
            displayMessage(data.response, 'bot');
        }

        if (data.session_id && data.session_id !== sessionId) {
            sessionId = data.session_id;
            localStorage.setItem('chatbotSessionId', sessionId);
        }
    } catch (err) {
        console.error('Fetch error:', err);
        displayMessage("Sorry, I can't connect to the server right now.", 'bot');
    } finally {
        setLoadingState(false);
        userInput.focus();
    }
}

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
userInput.addEventListener('input', () => {
    sendButton.disabled = userInput.value.trim() === '';
});

if (userInput.value.trim() !== '') {
    sendButton.disabled = false;
}
