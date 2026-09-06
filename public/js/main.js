/**
 * main.js
 * -----------------------------------------------------------------
 * Módulo compartido por todos los juegos:
 *  - Crea la conexión única de Socket.io (window.socket)
 *  - Actualiza el saldo global en la barra superior
 *  - Maneja la navegación entre pestañas de juego
 *  - Expone una función global de "toast" para mostrar errores
 * -----------------------------------------------------------------
 */

// Conexión única compartida por roulette.js, teenpatti.js y slots.js
window.socket = io();

// -------------------- Saldo --------------------
const balanceEl = document.getElementById("balance-amount");

function formatCoins(n) {
  return Math.max(0, Math.round(n)).toLocaleString("es-CO");
}

window.socket.on("balance:update", ({ balance }) => {
  balanceEl.textContent = formatCoins(balance);
});

// -------------------- Toasts de error / aviso --------------------
const toastEl = document.getElementById("toast");
let toastTimeout = null;

window.showToast = function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove("show"), 2600);
};

window.socket.on("error", (data) => {
  window.showToast(data.message || "Ocurrió un error.");
});

window.socket.on("connect_error", () => {
  window.showToast("No se pudo conectar con el servidor.");
});

// -------------------- Navegación entre juegos --------------------
const navButtons = document.querySelectorAll(".nav-btn");
const screens = document.querySelectorAll(".game-screen");

function goToGame(target) {
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.game === target));
  screens.forEach((s) => s.classList.toggle("active", s.id === `screen-${target}`));
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => goToGame(btn.dataset.game));
});

// -------------------- Pantalla de bienvenida --------------------
const welcomeScreen = document.getElementById("welcome-screen");
const topbarEl = document.getElementById("topbar");
const gameNavEl = document.getElementById("game-nav");
const gameAreaEl = document.getElementById("game-area");
const brandHomeBtn = document.getElementById("brand-home-btn");

function enterCasino(target) {
  goToGame(target);
  welcomeScreen.classList.add("hidden");
  topbarEl.hidden = false;
  gameNavEl.hidden = false;
  gameAreaEl.hidden = false;
  // Pequeño respiro para que el navegador aplique "display" antes de animar
  requestAnimationFrame(() => welcomeScreen.setAttribute("hidden", ""));
}

document.querySelectorAll(".welcome-card").forEach((card) => {
  card.addEventListener("click", () => enterCasino(card.dataset.game));
});

brandHomeBtn.addEventListener("click", () => {
  topbarEl.hidden = true;
  gameNavEl.hidden = true;
  gameAreaEl.hidden = true;
  welcomeScreen.removeAttribute("hidden");
  requestAnimationFrame(() => welcomeScreen.classList.remove("hidden"));
});
