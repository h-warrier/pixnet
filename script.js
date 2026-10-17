// IMPORTANT: Replace this with the URL of your deployed Python backend API!
const API_ENDPOINT = "https://ai-chatbot-backend-xbng.onrender.com/api/chat";

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const btnTheme = document.getElementById('btn-theme');

// Session id persistence
let sessionId = localStorage.getItem('chatbotSessionId');
if (!sessionId) {
    sessionId = 'session_' + Date.now() + Math.random().toString(16).slice(2);
    localStorage.setItem('chatbotSessionId', sessionId);
}

// ---------------- Renderer Framework ----------------
const renderers = [];
function registerRenderer(matcher, rendererFn){
    renderers.push({matcher, rendererFn});
}

async function runRenderersForMessage(text, container){
    for (const r of renderers){
        try{
            const match = r.matcher(text);
            if (match){
                await r.rendererFn(match, container);
                // allow multiple renderers, do not break
            }
        }catch(err){
            console.warn('Renderer error', err);
        }
    }
}

// ---------------- Weather Renderer (client-side, no API key) ----------------
// Uses Nominatim for geocoding and Open-Meteo for forecast (both free)

function detectWeatherQuery(text){
    // Try to capture queries like "weather in Taipei", "what's the weather at New York?"
    const re = /(?:what(?:'s| is)?\s+)?(?:the\s+)?(?:weather|forecast|temperature)(?:\s+(?:like|in|at))?\s*(?:for\s*)?([A-Za-z0-9\s,\-._]+)?\??$/i;
    const m = text.match(re);
    if (!m) return null;
    const place = (m[1] || '').trim();
    // If no place was provided, we'll assume local location (cannot rely on client geolocation without permission)
    if (!place) return {place: null};
    return {place};
}

async function geocodePlace(place){
    const key = 'geo_' + place.toLowerCase();
    try{
        const cached = sessionStorage.getItem(key);
        if (cached) return JSON.parse(cached);
    }catch(e){/* ignore */}
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`;
    const resp = await fetch(url, {headers:{'Accept':'application/json'}});
    if (!resp.ok) throw new Error('Geocoding failed');
    const data = await resp.json();
    if (!data || data.length === 0) throw new Error('Location not found');
    const first = data[0];
    const out = {lat: parseFloat(first.lat), lon: parseFloat(first.lon), display_name: first.display_name};
    try{ sessionStorage.setItem(key, JSON.stringify(out)); }catch(e){}
    return out;
}

async function fetchWeather(lat, lon){
    // Open-Meteo API: current weather + hourly temps + daily extremes
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,apparent_temperature,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`;
    const resp = await fetch(url, {headers:{'Accept':'application/json'}});
    if (!resp.ok) throw new Error('Weather fetch failed');
    const data = await resp.json();
    return data;
}

function formatTemperature(t){
    return `${Math.round(t)}°C`;
}

function weatherCodeToLabel(code){
    // simplified mapping from Open-Meteo weathercode
    const map = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Drizzle: Light',
        53: 'Drizzle: Moderate',
        55: 'Drizzle: Dense',
        61: 'Rain: Slight',
        63: 'Rain: Moderate',
        65: 'Rain: Heavy',
        71: 'Snow: Slight',
        73: 'Snow: Moderate',
        75: 'Snow: Heavy',
        80: 'Rain showers: Slight',
        81: 'Rain showers: Moderate',
        82: 'Rain showers: Violent',
        95: 'Thunderstorm',
    };
    return map[code] || 'Unknown';
}

function createSparkline(values, width=220, height=48){
    // values: array of numbers
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = width / (values.length - 1);
    let points = [];
    values.forEach((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / range) * height;
        points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = `
      <polyline fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" points="${points.join(' ')}" stroke-linecap="round" stroke-linejoin="round" />
    `;
    return svg;
}

async function weatherRenderer(match, container){
    // match: {place: string|null}
    try{
        const place = match.place;
        let placeInfo;
        if (place){
            placeInfo = await geocodePlace(place);
        } else {
            // No place provided: best effort to use browser geolocation (permission prompt)
            if (navigator.geolocation){
                placeInfo = await new Promise((resolve, reject) => {
                    const timer = setTimeout(()=> reject(new Error('Geolocation timeout')), 8000);
                    navigator.geolocation.getCurrentPosition(pos => { clearTimeout(timer); resolve({lat: pos.coords.latitude, lon: pos.coords.longitude, display_name: 'Your location'}); }, err => { clearTimeout(timer); reject(err); }, {timeout:7000});
                }).catch(()=> null);
            }
            if (!placeInfo) throw new Error('No place provided and geolocation not available');
        }

        // fetch weather
        const weather = await fetchWeather(placeInfo.lat, placeInfo.lon);

        // build card
        const panel = document.createElement('div');
        panel.className = 'weather-card';

        const header = document.createElement('div'); header.className = 'wc-header';
        const title = document.createElement('div'); title.className = 'wc-title';
        title.textContent = placeInfo.display_name || place || 'Unknown location';
        const currentTemp = document.createElement('div'); currentTemp.className = 'wc-current';
        const cw = weather.current_weather || {};
        currentTemp.innerHTML = `<div class="wc-temp">${formatTemperature(cw.temperature || 0)}</div><div class="wc-cond">${weatherCodeToLabel(cw.weathercode)}</div>`;
        header.appendChild(title); header.appendChild(currentTemp);

        const body = document.createElement('div'); body.className = 'wc-body';
        // highs/lows
        const daily = (weather.daily && weather.daily) || {};
        const highs = daily.temperature_2m_max ? formatTemperature(daily.temperature_2m_max[0]) : '--';
        const lows = daily.temperature_2m_min ? formatTemperature(daily.temperature_2m_min[0]) : '--';
        const sun = (daily.sunrise && daily.sunset) ? {sunrise: daily.sunrise[0], sunset: daily.sunset[0]} : null;
        const hl = document.createElement('div'); hl.className = 'wc-highlow'; hl.innerHTML = `<div>High: <strong>${highs}</strong></div><div>Low: <strong>${lows}</strong></div>`;
        body.appendChild(hl);
        if (sun){
            const sunEl = document.createElement('div'); sunEl.className = 'wc-sun'; sunEl.innerHTML = `<div>Sunrise: ${new Date(sun.sunrise).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div><div>Sunset: ${new Date(sun.sunset).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>`;
            body.appendChild(sunEl);
        }

        // hourly sparkline (next 12 hours)
        const now = new Date();
        const times = weather.hourly.time || [];
        const temps = weather.hourly.temperature_2m || [];
        let startIdx = 0;
        for (let i=0;i<times.length;i++){
            if (new Date(times[i]) > now){ startIdx = i; break; }
        }
        const sliceTemps = temps.slice(startIdx, startIdx + 12);
        if (sliceTemps.length > 1){
            const sparkWrap = document.createElement('div'); sparkWrap.className = 'wc-spark';
            const svg = createSparkline(sliceTemps);
            sparkWrap.appendChild(svg);
            body.appendChild(sparkWrap);
        }

        // attach to panel
        panel.appendChild(header);
        panel.appendChild(body);

        // insert as a bot message element
        const wrapper = document.createElement('div');
        wrapper.className = 'message bot-message';
        wrapper.appendChild(panel);
        container.appendChild(wrapper);
        container.scrollTop = container.scrollHeight;

    }catch(err){
        // render fallback text
        const fallback = document.createElement('div'); fallback.className = 'message bot-message';
        fallback.textContent = `I couldn't fetch visual weather details: ${err.message}`;
        container.appendChild(fallback);
        container.scrollTop = container.scrollHeight;
    }
}

// Register weather renderer
registerRenderer(detectWeatherQuery, weatherRenderer);

// ---------------- Ambient blobs (existing) ----------------
const blobEls = Array.from(document.querySelectorAll('.blob'));
const blobState = blobEls.map((el)=>({el, x: Math.random()*100, y: Math.random()*100, vx:(Math.random()-0.5)*0.04, vy:(Math.random()-0.5)*0.04, hue: Math.random()*360, hueSpeed:(Math.random()-0.5)*0.6}));
function updateBlobs(ts, last){
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return last;
    const delta = last ? ts - last : 16;
    for (const s of blobState){
        s.x += s.vx * (delta/16);
        s.y += s.vy * (delta/16);
        if (s.x < -20) s.x = 120; if (s.x > 120) s.x = -20; if (s.y < -20) s.y = 120; if (s.y > 120) s.y = -20;
        s.hue = (s.hue + s.hueSpeed * (delta/16) + 360) % 360;
        const tx = (s.x - 50) * 2.0; const ty = (s.y - 50) * 1.2;
        s.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.06)`;
        s.el.style.background = `radial-gradient(circle at 40% 40%, hsla(${s.hue},90%,65%,0.36), hsla(${(s.hue+30)%360},90%,55%,0.10) 30%, transparent 60%)`;
    }
    return ts;
}
let lastFrame = 0; function loop(ts){ lastFrame = updateBlobs(ts, lastFrame); requestAnimationFrame(loop); }
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(loop);

// Theme toggle (existing)
if (btnTheme){ btnTheme.addEventListener('click', ()=>{ const root=document.documentElement; const current=getComputedStyle(root).getPropertyValue('--bg').trim(); if (current==='#0f1724'){ root.style.setProperty('--bg','#f6f9fb'); root.style.setProperty('--text','#0b1220'); } else { root.style.setProperty('--bg','#0f1724'); root.style.setProperty('--text','#EAF2F8'); } btnTheme.querySelector('i').classList.toggle('fa-moon'); btnTheme.querySelector('i').classList.toggle('fa-sun'); }); }

// ---------------- Chat functions (existing, augmented with renderers) ----------------
function displayMessage(message, sender){
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    // Run renderers to augment or replace text with visuals
    runRenderersForMessage(message, chatMessages).catch(()=>{});
    // prune DOM
    if (chatMessages.childElementCount > 200){ const removeCount=40; for (let i=0;i<removeCount;i++){ if (chatMessages.firstChild) chatMessages.removeChild(chatMessages.firstChild); } }
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setLoadingState(isLoading){ sendButton.disabled = isLoading; userInput.disabled = isLoading; userInput.placeholder = isLoading ? "Thinking..." : "Type your message..."; sendButton.innerHTML = isLoading ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-paper-plane"></i>'; }

async function sendMessage(){
    const message = userInput.value.trim(); if (message === "") return;
    // 1. Display user message
    displayMessage(message, 'user'); userInput.value=''; setLoadingState(true);

    // If weather query, fire off renderer (it will append a bot message with visuals). We still send to backend for text reply.
    try{
        const weatherMatch = detectWeatherQuery(message);
        if (weatherMatch){
            // run renderer asynchronously (don't await) to show visuals promptly
            weatherRenderer(weatherMatch, chatMessages).catch(()=>{});
        }
    }catch(e){ console.warn('Weather detect error', e); }

    try{
        // send to backend as before
        const payload = { message: message, session_id: sessionId };
        const response = await fetch(API_ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.error) displayMessage(`[Error: ${data.error}]`, 'bot'); else displayMessage(data.response, 'bot');
        if (data.session_id && data.session_id !== sessionId){ sessionId = data.session_id; localStorage.setItem('chatbotSessionId', sessionId); }
    }catch(err){ console.error('Fetch error:', err); displayMessage("Sorry, I can't connect to the server right now.", 'bot'); }
    finally{ setLoadingState(false); userInput.focus(); }
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', function(e){ if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } });
userInput.addEventListener('input', ()=>{ sendButton.disabled = userInput.value.trim() === ''; });
if (userInput.value.trim() !== '') sendButton.disabled = false;
