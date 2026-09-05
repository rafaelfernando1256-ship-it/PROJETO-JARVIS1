const logEl = document.getElementById("log");
const devicesEl = document.getElementById("devices");
const statusEl = document.getElementById("connection-status");
const micButton = document.getElementById("mic-button");
const textForm = document.getElementById("text-form");
const textInput = document.getElementById("text-input");
const discoverButton = document.getElementById("discover-button");

let devices = new Map();

function addLog(message, kind = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${kind}`;
  const time = new Date().toLocaleTimeString("pt-BR");
  entry.innerHTML = `<div>${escapeHtml(message)}</div><div class="meta">${time}</div>`;
  logEl.prepend(entry);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  window.speechSynthesis.speak(utterance);
}

async function sendCommand(text) {
  addLog(`Você: ${text}`);
  try {
    const res = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    for (const result of data.results ?? []) {
      addLog(result.message, result.ok ? "ok" : "error");
      if (result.ok) speak(result.message);
    }
  } catch (err) {
    addLog(`Erro de comunicação: ${err.message}`, "error");
  }
}

textForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;
  sendCommand(text);
  textInput.value = "";
});

// --- Voz (Web Speech API) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.continuous = false;
  recognition.interimResults = false;

  let listening = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    sendCommand(transcript);
  };

  recognition.onend = () => {
    listening = false;
    micButton.classList.remove("listening");
  };

  recognition.onerror = (event) => {
    addLog(`Erro no reconhecimento de voz: ${event.error}`, "error");
  };

  micButton.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    listening = true;
    micButton.classList.add("listening");
    recognition.start();
  });
} else {
  micButton.disabled = true;
  micButton.title = "Reconhecimento de voz não suportado neste navegador";
  addLog("Reconhecimento de voz não suportado neste navegador. Use o campo de texto.", "error");
}

// --- Dispositivos ---
function renderDevices() {
  devicesEl.innerHTML = "";
  for (const device of devices.values()) {
    const card = document.createElement("div");
    card.className = "device-card";
    const isOn = device.state?.power === "on";
    card.innerHTML = `
      <h3><span class="power-dot ${isOn ? "on" : ""}"></span>${escapeHtml(device.name)}</h3>
      <div class="room">${escapeHtml(device.room ?? "")} · ${escapeHtml(device.driver)}</div>
      <div class="state">
        ${device.state?.volume !== undefined ? `Volume: ${device.state.volume}` : ""}
        ${device.state?.online === false ? " · offline" : ""}
      </div>
      <div class="actions"></div>
    `;
    const actions = card.querySelector(".actions");

    const actionButtons = [
      { label: "Ligar", action: "power_on" },
      { label: "Desligar", action: "power_off" },
      { label: "Vol +", action: "volume_up" },
      { label: "Vol -", action: "volume_down" },
      { label: "Mudo", action: "mute_toggle" },
    ];

    for (const { label, action } of actionButtons) {
      if (!device.capabilities?.some((c) => actionMatchesCapability(action, c))) continue;
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.addEventListener("click", () => executeDevice(device.id, action));
      actions.appendChild(btn);
    }

    devicesEl.appendChild(card);
  }
}

function actionMatchesCapability(action, capability) {
  if (capability === "power" && ["power_on", "power_off", "power_toggle"].includes(action)) return true;
  if (capability === "volume" && ["volume_up", "volume_down", "volume_set"].includes(action)) return true;
  if (capability === "mute" && action === "mute_toggle") return true;
  return false;
}

async function executeDevice(id, action) {
  try {
    const res = await fetch(`/api/devices/${id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await res.json();
    addLog(result.message, result.ok ? "ok" : "error");
  } catch (err) {
    addLog(`Erro ao executar comando: ${err.message}`, "error");
  }
}

discoverButton.addEventListener("click", async () => {
  addLog("Procurando dispositivos UPnP/SSDP na rede (4s)...");
  try {
    const res = await fetch("/api/discover");
    const found = await res.json();
    if (found.length === 0) {
      addLog("Nenhum dispositivo UPnP encontrado.");
    } else {
      for (const d of found) {
        addLog(`Encontrado: ${d.address} — ${d.server ?? d.st ?? "desconhecido"}`);
      }
    }
  } catch (err) {
    addLog(`Erro na descoberta: ${err.message}`, "error");
  }
});

// --- WebSocket em tempo real ---
function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    statusEl.textContent = "conectado";
    statusEl.className = "status online";
  };

  ws.onclose = () => {
    statusEl.textContent = "desconectado, tentando reconectar...";
    statusEl.className = "status offline";
    setTimeout(connectWebSocket, 2000);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "snapshot") {
      devices = new Map(msg.devices.map((d) => [d.id, d]));
      renderDevices();
    } else if (msg.type === "state") {
      const device = devices.get(msg.id);
      if (device) {
        device.state = msg.state;
        renderDevices();
      }
    }
  };
}

connectWebSocket();
