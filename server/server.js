/**
 * =====================================================================
 * CASINO MULTIJUGADOR - SERVIDOR (server.js)
 * ---------------------------------------------------------------------
 * Responsabilidades de este archivo:
 *  - Servir el frontend estático (carpeta /public)
 *  - Mantener el saldo de cada jugador conectado (autoridad del servidor)
 *  - Correr los "loops" de Ruleta y Teen Patti: son bucles infinitos que
 *    avanzan fases (apuestas -> giro/reparto -> resultado) de forma
 *    IDÉNTICA para todos los jugadores conectados (multijugador real).
 *  - Validar montos mínimos de apuesta y saldo suficiente.
 *  - Calcular ganadores/pagos y notificar el saldo actualizado a cada
 *    cliente en tiempo real vía Socket.io.
 * =====================================================================
 */

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Sirve el frontend (HTML/CSS/JS del cliente)
app.use(express.static(path.join(__dirname, "..", "public")));

// -------------------- Utilidades --------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -------------------- Estado de jugadores --------------------
const INITIAL_BALANCE = 10000;
const players = new Map(); // socket.id -> { balance }

function getPlayer(socketId) {
  return players.get(socketId);
}

function sendBalance(socketId) {
  const player = getPlayer(socketId);
  const socket = io.sockets.sockets.get(socketId);
  if (player && socket) {
    socket.emit("balance:update", { balance: player.balance });
  }
}

// =====================================================================
// JUEGO 1: RULETA ALEATORIA (TRICOLOR DE 13 CASILLAS)
// =====================================================================
const ROULETTE_MIN_BET = 100;
const ROULETTE_COLORS = {
  amarillo: [1, 2, 3, 4],
  azul: [5, 6, 7, 8],
  rojo: [9, 10, 11, 12],
};
// Orden fijo de las 13 casillas alrededor de la rueda (para animación cliente)
const ROULETTE_WHEEL_ORDER = [0, 1, 5, 9, 2, 6, 10, 3, 7, 11, 4, 8, 12];

function numberToColor(n) {
  if (n === 0) return "blanco";
  for (const [color, nums] of Object.entries(ROULETTE_COLORS)) {
    if (nums.includes(n)) return color;
  }
  return null;
}

let roulettePhase = "betting"; // betting | spinning | result
let rouletteTimeLeft = 20;
let rouletteBets = new Map(); // socketId -> [{type, value, amount}, ...]
let rouletteLastResults = []; // historial breve

function rouletteBroadcastState() {
  io.emit("roulette:state", {
    phase: roulettePhase,
    timeLeft: rouletteTimeLeft,
    wheelOrder: ROULETTE_WHEEL_ORDER,
    history: rouletteLastResults,
  });
}

function resolveRouletteBets(number, color) {
  for (const [socketId, bets] of rouletteBets.entries()) {
    const player = getPlayer(socketId);
    if (!player) continue;
    let totalWin = 0;

    if (color !== "blanco") {
      for (const bet of bets) {
        if (bet.type === "color" && bet.value === color) {
          totalWin += bet.amount * 3; // paga 3 a 1
        }
        if (bet.type === "number" && Number(bet.value) === number) {
          totalWin += bet.amount * 12; // paga 12 a 1
        }
        if (bet.type === "parity") {
          const isEven = number % 2 === 0;
          if ((bet.value === "par" && isEven) || (bet.value === "impar" && !isEven)) {
            totalWin += bet.amount * 2; // paga 2 a 1
          }
        }
      }
    }
    // El 0 blanco: todas las apuestas se pierden (ya fueron descontadas al apostar)

    if (totalWin > 0) {
      player.balance += totalWin;
      sendBalance(socketId);
    }
  }
}

async function rouletteLoop() {
  while (true) {
    // FASE 1: Apuestas
    roulettePhase = "betting";
    rouletteBets = new Map();
    for (rouletteTimeLeft = 20; rouletteTimeLeft > 0; rouletteTimeLeft--) {
      rouletteBroadcastState();
      await sleep(1000);
    }

    // FASE 2: Giro (sincronizado - todos ven el mismo resultado al mismo tiempo)
    roulettePhase = "spinning";
    const number = Math.floor(Math.random() * 13); // 0 a 12
    const color = numberToColor(number);
    io.emit("roulette:spin", { number, color, wheelOrder: ROULETTE_WHEEL_ORDER });
    rouletteTimeLeft = 6;
    for (let t = 6; t > 0; t--) {
      rouletteBroadcastState();
      await sleep(1000);
    }

    // FASE 3: Resultado y pago
    roulettePhase = "result";
    resolveRouletteBets(number, color);
    rouletteLastResults.unshift({ number, color });
    rouletteLastResults = rouletteLastResults.slice(0, 8);
    io.emit("roulette:result", { number, color, history: rouletteLastResults });

    rouletteTimeLeft = 4;
    for (let t = 4; t > 0; t--) {
      rouletteBroadcastState();
      await sleep(1000);
    }
  }
}

// =====================================================================
// JUEGO 2: TEEN PATTI (COCTELES - SUMA MÁXIMA)
// =====================================================================
const TEENPATTI_MIN_BET = 50;
const COCKTAILS = ["Mojito", "Margarita", "Daiquiri"];
const MAX_COCKTAIL_BETS_PER_PLAYER = 2; // regla 4: solo 2 de los 3 cócteles
const COCKTAIL_WIN_MULTIPLIER = 3; // regla 3: retorno total = apuesta x3

// Multiplicador de la apuesta "Crown" según la combinación del cóctel ganador.
// AJUSTA ESTOS VALORES si quieres otra tabla de pagos: son un valor por
// defecto razonable, ya que las reglas no especifican los multiplicadores
// exactos. "Carta alta" se trata como la combinación base (no especial),
// por eso Crown no paga sobre ella.
const CROWN_PAYOUTS = {
  "Trío": 40,
  "Escalera del mismo color": 25,
  "Escalera": 12,
  "Mismo color": 6,
  "Pareja": 3,
  "Carta alta": 0,
};

// Jerarquía de combinaciones (regla 6), de mayor a menor valor
const COMBO_RANK = {
  "Trío": 6,
  "Escalera del mismo color": 5,
  "Escalera": 4,
  "Mismo color": 3,
  "Pareja": 2,
  "Carta alta": 1,
};

function buildTeenPattiDeck() {
  // 40 cartas: 1-10, Rojo y Negro, 2 de cada número por color (regla 1)
  const deck = [];
  for (let value = 1; value <= 10; value++) {
    for (let i = 0; i < 2; i++) deck.push({ value, color: "Rojo" });
    for (let i = 0; i < 2; i++) deck.push({ value, color: "Negro" });
  }
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Evalúa una mano de 3 cartas según la jerarquía de combinaciones (regla 6, 8, 9)
function evaluateHand(cards) {
  const values = cards.map((c) => c.value).sort((a, b) => a - b);
  const colors = cards.map((c) => c.color);

  const isTrio = values[0] === values[1] && values[1] === values[2];
  const isFlush = colors[0] === colors[1] && colors[1] === colors[2];
  const isStraight = values[1] === values[0] + 1 && values[2] === values[1] + 1;
  const isPair =
    !isTrio && (values[0] === values[1] || values[1] === values[2] || values[0] === values[2]);

  let type;
  if (isTrio) type = "Trío";
  else if (isStraight && isFlush) type = "Escalera del mismo color";
  else if (isStraight) type = "Escalera";
  else if (isFlush) type = "Mismo color";
  else if (isPair) type = "Pareja";
  else type = "Carta alta";

  return {
    type,
    rank: COMBO_RANK[type],
    sortedValuesDesc: [...values].sort((a, b) => b - a), // para desempate (regla 7)
  };
}

// > 0 si A gana, < 0 si B gana, 0 si empate total
function compareHands(handA, handB) {
  if (handA.rank !== handB.rank) return handA.rank - handB.rank;
  for (let i = 0; i < 3; i++) {
    if (handA.sortedValuesDesc[i] !== handB.sortedValuesDesc[i]) {
      return handA.sortedValuesDesc[i] - handB.sortedValuesDesc[i];
    }
  }
  return 0;
}

let teenpattiPhase = "betting"; // betting | locked | dealing | result
let teenpattiTimeLeft = 15;
// socketId -> { cocktails: { [nombreCoctel]: monto }, crown: monto|null }
let teenpattiBets = new Map();
let teenpattiHistory = []; // últimos 5 ganadores { winner, type }

function teenpattiBroadcastState() {
  io.emit("teenpatti:state", {
    phase: teenpattiPhase,
    timeLeft: teenpattiTimeLeft,
    history: teenpattiHistory,
    cocktails: COCKTAILS,
  });
}

function resolveTeenPattiBets(winnerCocktail, winningType) {
  for (const [socketId, bet] of teenpattiBets.entries()) {
    const player = getPlayer(socketId);
    if (!player) continue;
    let totalWin = 0;

    // Apuesta al cóctel ganador (regla 3): retorno total = apuesta x3
    const cocktailAmount = bet.cocktails[winnerCocktail];
    if (cocktailAmount) {
      totalWin += cocktailAmount * COCKTAIL_WIN_MULTIPLIER;
    }

    // Apuesta Crown (regla 5): paga solo si la mano ganadora es una
    // combinación especial, según CROWN_PAYOUTS
    if (bet.crown) {
      const crownMultiplier = CROWN_PAYOUTS[winningType] || 0;
      if (crownMultiplier > 0) {
        totalWin += bet.crown * crownMultiplier;
      }
    }

    if (totalWin > 0) {
      player.balance += totalWin;
      sendBalance(socketId);
    }
  }
}

async function teenpattiLoop() {
  while (true) {
    // FASE 1: Apuestas (20s)
    teenpattiPhase = "betting";
    teenpattiBets = new Map();
    for (teenpattiTimeLeft = 20; teenpattiTimeLeft > 0; teenpattiTimeLeft--) {
      teenpattiBroadcastState();
      await sleep(1000);
    }

    // FASE 2: Cierre y bloqueo de apuestas
    teenpattiPhase = "locked";
    teenpattiTimeLeft = 2;
    teenpattiBroadcastState();
    io.emit("teenpatti:locked", {});
    await sleep(2000);

    // FASE 3: Reparto aleatorio (3 cartas por cóctel, regla 2)
    teenpattiPhase = "dealing";
    const deck = shuffle(buildTeenPattiDeck());
    const hands = {};
    const evaluations = {};
    for (const cocktail of COCKTAILS) {
      const cards = [deck.pop(), deck.pop(), deck.pop()];
      hands[cocktail] = cards;
      evaluations[cocktail] = evaluateHand(cards);
    }
    io.emit("teenpatti:dealing", { hands, evaluations });
    await sleep(3500);

    // FASE 4: Resolución - gana el cóctel con la mejor combinación (regla 6/7)
    teenpattiPhase = "result";
    let winnerCocktail = COCKTAILS[0];
    for (const c of COCKTAILS.slice(1)) {
      if (compareHands(evaluations[c], evaluations[winnerCocktail]) > 0) {
        winnerCocktail = c;
      }
    }
    const winningType = evaluations[winnerCocktail].type;

    resolveTeenPattiBets(winnerCocktail, winningType);

    teenpattiHistory.unshift({ winner: winnerCocktail, type: winningType });
    teenpattiHistory = teenpattiHistory.slice(0, 5);

    io.emit("teenpatti:result", {
      winner: winnerCocktail,
      type: winningType,
      hands,
      evaluations,
      history: teenpattiHistory,
    });

    teenpattiTimeLeft = 6;
    for (let t = 6; t > 0; t--) {
      teenpattiBroadcastState();
      await sleep(1000);
    }
  }
}

// =====================================================================
// JUEGO 3: TRAGA MONEDAS (TABLA DE PREMIOS EXACTA)
// =====================================================================
const SLOTS_MIN_BET = 100;
const OTHER_SYMBOLS = ["Estrella", "Diamante", "Herradura", "Limón"];
const randomOther = () => OTHER_SYMBOLS[Math.floor(Math.random() * OTHER_SYMBOLS.length)];

function spinSlots(amount) {
  const roll = Math.floor(Math.random() * 1000) + 1; // 1 a 1000

  let reels, multiplier, label;

  if (roll === 1) {
    reels = ["7", "7", "7"];
    multiplier = 300;
    label = "¡JACKPOT MAYOR!";
  } else if (roll <= 6) {
    reels = ["BAR", "BAR", "BAR"];
    multiplier = 30;
    label = "Jackpot Menor";
  } else if (roll <= 16) {
    reels = ["Campana", "Campana", "Campana"];
    multiplier = 10;
    label = "Trío Alto";
  } else if (roll <= 36) {
    reels = ["Cereza", "Cereza", "Cereza"];
    multiplier = 5;
    label = "Trío Bajo";
  } else if (roll <= 86) {
    reels = ["7", "7", randomOther()];
    multiplier = 3;
    label = "Doble 7";
  } else if (roll <= 186) {
    reels = ["Cereza", "Cereza", randomOther()];
    multiplier = 1;
    label = "Doble Cereza";
  } else {
    reels = [randomOther(), randomOther(), randomOther()];
    multiplier = 0;
    label = "Sin Premio";
  }

  const prize = amount * multiplier;
  return { reels, multiplier, prize, label, roll };
}

// =====================================================================
// CONEXIÓN DE SOCKETS
// =====================================================================
io.on("connection", (socket) => {
  players.set(socket.id, { balance: INITIAL_BALANCE });

  // Estado inicial para el jugador recién conectado
  socket.emit("balance:update", { balance: INITIAL_BALANCE });
  socket.emit("roulette:state", {
    phase: roulettePhase,
    timeLeft: rouletteTimeLeft,
    wheelOrder: ROULETTE_WHEEL_ORDER,
    history: rouletteLastResults,
  });
  socket.emit("teenpatti:state", {
    phase: teenpattiPhase,
    timeLeft: teenpattiTimeLeft,
    history: teenpattiHistory,
    cocktails: COCKTAILS,
  });

  // ---------- RULETA: recibir apuesta ----------
  socket.on("roulette:bet", (data) => {
    const player = getPlayer(socket.id);
    if (!player) return;
    if (roulettePhase !== "betting") {
      return socket.emit("error", { message: "Las apuestas están cerradas en esta ronda." });
    }
    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount < ROULETTE_MIN_BET) {
      return socket.emit("error", { message: `Apuesta mínima: ${ROULETTE_MIN_BET} monedas.` });
    }
    if (amount > player.balance) {
      return socket.emit("error", { message: "Saldo insuficiente." });
    }
    if (!["color", "number", "parity"].includes(data.type)) {
      return socket.emit("error", { message: "Tipo de apuesta inválido." });
    }

    player.balance -= amount;
    sendBalance(socket.id);

    const current = rouletteBets.get(socket.id) || [];
    current.push({ type: data.type, value: data.value, amount });
    rouletteBets.set(socket.id, current);

    socket.emit("roulette:bet-ack", { type: data.type, value: data.value, amount });
  });

  // ---------- TEEN PATTI: recibir apuesta ----------
  socket.on("teenpatti:bet", (data) => {
    const player = getPlayer(socket.id);
    if (!player) return;
    if (teenpattiPhase !== "betting") {
      return socket.emit("error", { message: "Las apuestas están cerradas en esta ronda." });
    }
    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount < TEENPATTI_MIN_BET) {
      return socket.emit("error", { message: `Apuesta mínima: ${TEENPATTI_MIN_BET} monedas.` });
    }
    if (amount > player.balance) {
      return socket.emit("error", { message: "Saldo insuficiente." });
    }

    const current = teenpattiBets.get(socket.id) || { cocktails: {}, crown: null };

    if (data.betType === "crown") {
      if (current.crown !== null) {
        return socket.emit("error", { message: "Ya hiciste tu apuesta Crown en esta ronda." });
      }
      current.crown = amount;
    } else if (data.betType === "cocktail") {
      const cocktail = data.cocktail;
      if (!COCKTAILS.includes(cocktail)) {
        return socket.emit("error", { message: "Cóctel inválido." });
      }
      if (current.cocktails[cocktail] !== undefined) {
        return socket.emit("error", { message: "Ya apostaste por ese cóctel." });
      }
      if (Object.keys(current.cocktails).length >= MAX_COCKTAIL_BETS_PER_PLAYER) {
        return socket.emit("error", { message: "Solo puedes apostar por 2 de los 3 cócteles." });
      }
      current.cocktails[cocktail] = amount;
    } else {
      return socket.emit("error", { message: "Tipo de apuesta inválido." });
    }

    player.balance -= amount;
    sendBalance(socket.id);
    teenpattiBets.set(socket.id, current);

    socket.emit("teenpatti:bet-ack", { betType: data.betType, cocktail: data.cocktail, amount });
  });

  // ---------- TRAGA MONEDAS: girar ----------
  socket.on("slots:spin", (data) => {
    const player = getPlayer(socket.id);
    if (!player) return;
    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount < SLOTS_MIN_BET) {
      return socket.emit("error", { message: `Apuesta mínima: ${SLOTS_MIN_BET} monedas.` });
    }
    if (amount > player.balance) {
      return socket.emit("error", { message: "Saldo insuficiente." });
    }

    player.balance -= amount;
    const result = spinSlots(amount);
    player.balance += result.prize;

    // Actualiza el saldo visible en la barra superior de inmediato
    sendBalance(socket.id);
    socket.emit("slots:result", { ...result, amount, balance: player.balance });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    rouletteBets.delete(socket.id);
    teenpattiBets.delete(socket.id);
  });
});

// Arranca los ciclos globales del casino (corren siempre, haya o no jugadores)
rouletteLoop();
teenpattiLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎰 Casino Multijugador corriendo en http://localhost:${PORT}`);
});
