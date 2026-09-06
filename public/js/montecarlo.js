/**
 * montecarlo.js
 * -----------------------------------------------------------------
 * Pestaña de "Análisis de Monte Carlo".
 *
 * Esto NO se conecta al servidor: es una simulación 100% local (en el
 * navegador) que reproduce EXACTAMENTE las mismas reglas, probabilidades
 * y tablas de pago que server.js usa para Ruleta, Teen Patti y
 * Tragamonedas. La idea del método de Monte Carlo es simple: en vez de
 * calcular a mano la probabilidad de cada resultado, se simulan miles
 * (o cientos de miles) de rondas al azar y se promedia lo que pasó. A
 * medida que crecen las rondas, el promedio simulado converge al valor
 * esperado teórico real (Ley de los Grandes Números).
 * -----------------------------------------------------------------
 */

(function () {
  // ==================================================================
  // Copia fiel de las reglas del servidor (server.js) para que la
  // simulación sea matemáticamente idéntica al juego real.
  // ==================================================================
  const ROULETTE_COLORS = {
    amarillo: [1, 2, 3, 4],
    azul: [5, 6, 7, 8],
    rojo: [9, 10, 11, 12],
  };

  function numberToColor(n) {
    if (n === 0) return "blanco";
    for (const [color, nums] of Object.entries(ROULETTE_COLORS)) {
      if (nums.includes(n)) return color;
    }
    return null;
  }

  function simRouletteRound(betType, betValue, amount) {
    const number = Math.floor(Math.random() * 13); // 0 a 12
    const color = numberToColor(number);
    let totalWin = 0;
    if (color !== "blanco") {
      if (betType === "color" && betValue === color) totalWin = amount * 3;
      if (betType === "number" && Number(betValue) === number) totalWin = amount * 12;
      if (betType === "parity") {
        const isEven = number % 2 === 0;
        if ((betValue === "par" && isEven) || (betValue === "impar" && !isEven)) {
          totalWin = amount * 2;
        }
      }
    }
    return totalWin - amount; // ganancia neta de esta ronda
  }

  const COCKTAILS = ["Mojito", "Margarita", "Daiquiri"];
  const COCKTAIL_WIN_MULTIPLIER = 3;
  const CROWN_PAYOUTS = {
    "Trío": 40,
    "Escalera del mismo color": 25,
    "Escalera": 12,
    "Mismo color": 6,
    "Pareja": 3,
    "Carta alta": 0,
  };
  const COMBO_RANK = {
    "Trío": 6,
    "Escalera del mismo color": 5,
    "Escalera": 4,
    "Mismo color": 3,
    "Pareja": 2,
    "Carta alta": 1,
  };

  function buildTeenPattiDeck() {
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

  function evaluateHand(cards) {
    const values = cards.map((c) => c.value).sort((a, b) => a - b);
    const colors = cards.map((c) => c.color);
    const isTrio = values[0] === values[1] && values[1] === values[2];
    const isFlush = colors[0] === colors[1] && colors[1] === colors[2];
    const isStraight = values[1] === values[0] + 1 && values[2] === values[1] + 1;
    const isPair = !isTrio && (values[0] === values[1] || values[1] === values[2] || values[0] === values[2]);
    let type;
    if (isTrio) type = "Trío";
    else if (isStraight && isFlush) type = "Escalera del mismo color";
    else if (isStraight) type = "Escalera";
    else if (isFlush) type = "Mismo color";
    else if (isPair) type = "Pareja";
    else type = "Carta alta";
    return { type, rank: COMBO_RANK[type], sortedDesc: [...values].sort((a, b) => b - a) };
  }

  function compareHands(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (let i = 0; i < 3; i++) {
      if (a.sortedDesc[i] !== b.sortedDesc[i]) return a.sortedDesc[i] - b.sortedDesc[i];
    }
    return 0;
  }

  function simTeenPattiRound(cocktail, crownEnabled, amount, crownAmount) {
    const deck = shuffle(buildTeenPattiDeck());
    const evaluations = {};
    for (const c of COCKTAILS) {
      const cards = [deck.pop(), deck.pop(), deck.pop()];
      evaluations[c] = evaluateHand(cards);
    }
    let winner = COCKTAILS[0];
    for (const c of COCKTAILS.slice(1)) {
      if (compareHands(evaluations[c], evaluations[winner]) > 0) winner = c;
    }
    const winningType = evaluations[winner].type;

    let net = 0;
    if (cocktail !== "none") {
      net -= amount;
      if (cocktail === winner) net += amount * COCKTAIL_WIN_MULTIPLIER;
    }
    if (crownEnabled) {
      net -= crownAmount;
      const mult = CROWN_PAYOUTS[winningType] || 0;
      if (mult > 0) net += crownAmount * mult;
    }
    return net;
  }

  const OTHER_SYMBOLS = ["Estrella", "Diamante", "Herradura", "Limón"];
  function simSlotsRound(amount) {
    const roll = Math.floor(Math.random() * 1000) + 1;
    let multiplier;
    if (roll === 1) multiplier = 300;
    else if (roll <= 6) multiplier = 30;
    else if (roll <= 16) multiplier = 10;
    else if (roll <= 36) multiplier = 5;
    else if (roll <= 86) multiplier = 3;
    else if (roll <= 186) multiplier = 1;
    else multiplier = 0;
    return amount * multiplier - amount;
  }

  // ==================================================================
  // Valores esperados TEÓRICOS (calculados con la fórmula de
  // probabilidad, no simulados) para comparar contra lo simulado.
  // ==================================================================
  function theoreticalEdge(game) {
    if (game === "roulette") {
      // Cualquier apuesta de ruleta en este juego tiene exactamente la
      // misma ventaja de la casa: 1/13 (el 0 blanco es la única casilla
      // que nunca paga). Es una propiedad elegante del diseño del juego.
      return { edge: 1 / 13, exact: true, note: "Idéntica para color, número o paridad: la única casilla que nunca paga es el 0 blanco (1 de 13)." };
    }
    if (game === "slots") {
      // EV exacto = suma(prob * multiplicador) - 1
      const evMultiplier = (1 * 300 + 5 * 30 + 10 * 10 + 20 * 5 + 50 * 3 + 100 * 1 + 814 * 0) / 1000;
      return { edge: 1 - evMultiplier, exact: true, note: "Calculado con la tabla de premios exacta (1 a 1000)." };
    }
    // Teen Patti: no tiene una fórmula cerrada simple porque las 3 manos
    // se reparten del MISMO mazo de 40 cartas (no son independientes) y
    // los empates favorecen al primer cóctel en la lista. Por eso esto
    // es justo un caso donde Monte Carlo es la herramienta correcta:
    // en vez de calcular a mano, se estima simulando.
    return { edge: null, exact: false, note: "No tiene una fórmula matemática simple (las 3 manos salen del mismo mazo de 40 cartas), así que la única forma práctica de estimarla es simulando muchas rondas — justo lo que hace esta pestaña." };
  }

  // ==================================================================
  // Estado de la UI
  // ==================================================================
  const state = {
    game: "roulette",
    rouletteBetType: "color",
    rouletteBetValue: "rojo",
    cocktail: "Mojito",
    crownEnabled: false,
  };

  const gameTabsWrap = document.getElementById("mc-game-tabs");
  const optionsRoulette = document.getElementById("mc-options-roulette");
  const optionsTeenpatti = document.getElementById("mc-options-teenpatti");
  const crownToggle = document.getElementById("mc-crown-toggle");
  const amountInput = document.getElementById("mc-amount");
  const roundsSelect = document.getElementById("mc-rounds");
  const runBtn = document.getElementById("mc-run-btn");
  const statusEl = document.getElementById("mc-status");
  const resultsCard = document.getElementById("mc-results");
  const statsGrid = document.getElementById("mc-stats-grid");
  const explainerEl = document.getElementById("mc-explainer");
  const canvas = document.getElementById("mc-chart");

  gameTabsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mc-game]");
    if (!btn) return;
    state.game = btn.dataset.mcGame;
    gameTabsWrap.querySelectorAll("[data-mc-game]").forEach((b) => b.classList.toggle("selected", b === btn));
    optionsRoulette.hidden = state.game !== "roulette";
    optionsTeenpatti.hidden = state.game !== "teenpatti";
  });

  optionsRoulette.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mc-bet-type]");
    if (!btn) return;
    state.rouletteBetType = btn.dataset.mcBetType;
    state.rouletteBetValue = btn.dataset.mcBetValue;
    optionsRoulette.querySelectorAll("[data-mc-bet-type]").forEach((b) => b.classList.toggle("selected", b === btn));
  });

  optionsTeenpatti.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mc-cocktail]");
    if (!btn) return;
    state.cocktail = btn.dataset.mcCocktail;
    optionsTeenpatti.querySelectorAll("[data-mc-cocktail]").forEach((b) => b.classList.toggle("selected", b === btn));
  });

  crownToggle.addEventListener("change", () => {
    state.crownEnabled = crownToggle.checked;
  });

  function formatCoins(n) {
    const sign = n < 0 ? "-" : "";
    return sign + Math.round(Math.abs(n)).toLocaleString("es-CO");
  }

  function formatPct(n) {
    return (n * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  function drawChart(cumulative) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Muestreamos hasta 400 puntos para que dibujar sea instantáneo
    // incluso con 100.000 rondas simuladas.
    const maxPoints = 400;
    const step = Math.max(1, Math.floor(cumulative.length / maxPoints));
    const points = [];
    for (let i = 0; i < cumulative.length; i += step) points.push(cumulative[i]);
    if (points[points.length - 1] !== cumulative[cumulative.length - 1]) {
      points.push(cumulative[cumulative.length - 1]);
    }

    const min = Math.min(0, ...points);
    const max = Math.max(0, ...points);
    const range = max - min || 1;

    const padL = 50, padR = 14, padT = 14, padB = 24;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const xAt = (i) => padL + (i / (points.length - 1 || 1)) * plotW;
    const yAt = (v) => padT + plotH - ((v - min) / range) * plotH;

    // Línea del cero (punto de equilibrio)
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, yAt(0));
    ctx.lineTo(w - padR, yAt(0));
    ctx.stroke();
    ctx.setLineDash([]);

    // Etiquetas del eje Y
    ctx.fillStyle = "#8f8fb3";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(formatCoins(max), padL - 6, yAt(max) + 4);
    ctx.fillText(formatCoins(min), padL - 6, yAt(min) + 4);
    ctx.fillText("0", padL - 6, yAt(0) + 4);

    // Área bajo la curva (verde si termina en positivo, roja si negativo)
    const endsPositive = points[points.length - 1] >= 0;
    const lineColor = endsPositive ? "#22e6a3" : "#ff4d6d";
    const fillColor = endsPositive ? "rgba(34,230,163,0.15)" : "rgba(255,77,109,0.15)";

    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(points[0]));
    points.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
    ctx.lineTo(xAt(points.length - 1), yAt(0));
    ctx.lineTo(xAt(0), yAt(0));
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(points[0]));
    points.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eje X
    ctx.fillStyle = "#8f8fb3";
    ctx.textAlign = "left";
    ctx.fillText("Ronda 1", padL, h - 6);
    ctx.textAlign = "right";
    ctx.fillText(`Ronda ${cumulative.length.toLocaleString("es-CO")}`, w - padR, h - 6);
  }

  function statBox(label, value, cls) {
    const div = document.createElement("div");
    div.className = "mc-stat";
    div.innerHTML = `<span class="mc-stat-label">${label}</span><span class="mc-stat-value ${cls || ""}">${value}</span>`;
    return div;
  }

  function runSimulation() {
    const rounds = Number(roundsSelect.value);
    const amount = Math.max(1, Number(amountInput.value) || 100);

    statusEl.textContent = `Simulando ${rounds.toLocaleString("es-CO")} rondas...`;
    runBtn.disabled = true;

    // setTimeout(0) para que el navegador pinte el "Simulando..." antes
    // de bloquear el hilo con el cálculo (que igual es muy rápido: unas
    // pocas decenas de milisegundos incluso en 100.000 rondas).
    setTimeout(() => {
      const cumulative = new Array(rounds);
      let totalBet = 0;
      let totalNet = 0;
      let wins = 0;

      for (let i = 0; i < rounds; i++) {
        let net = 0;
        let staked = 0;

        if (state.game === "roulette") {
          staked = amount;
          net = simRouletteRound(state.rouletteBetType, state.rouletteBetValue, amount);
        } else if (state.game === "teenpatti") {
          staked = (state.cocktail !== "none" ? amount : 0) + (state.crownEnabled ? amount : 0);
          net = simTeenPattiRound(state.cocktail, state.crownEnabled, amount, amount);
        } else {
          staked = amount;
          net = simSlotsRound(amount);
        }

        totalBet += staked;
        totalNet += net;
        if (net > 0) wins++;
        cumulative[i] = totalNet;
      }

      const totalReturn = totalBet + totalNet;
      const empiricalEdge = totalBet > 0 ? -totalNet / totalBet : 0;
      const winRate = rounds > 0 ? wins / rounds : 0;
      const avgNetPerRound = totalNet / rounds;

      statsGrid.innerHTML = "";
      statsGrid.appendChild(statBox("Rondas simuladas", rounds.toLocaleString("es-CO")));
      statsGrid.appendChild(statBox("Total apostado", formatCoins(totalBet) + " 🪙"));
      statsGrid.appendChild(statBox("Total retornado", formatCoins(totalReturn) + " 🪙"));
      statsGrid.appendChild(statBox(
        "Ganancia / pérdida neta",
        (totalNet >= 0 ? "+" : "") + formatCoins(totalNet) + " 🪙",
        totalNet >= 0 ? "positive" : "negative"
      ));
      statsGrid.appendChild(statBox("Rondas ganadoras", formatPct(winRate)));
      statsGrid.appendChild(statBox(
        "Ventaja de la casa (simulada)",
        formatPct(empiricalEdge),
        empiricalEdge >= 0 ? "negative" : "positive"
      ));

      const theo = theoreticalEdge(state.game);
      let explainer;
      if (theo.exact) {
        explainer =
          `Ventaja de la casa teórica (calculada, no simulada): ${formatPct(theo.edge)}. ` +
          `${theo.note} Con esta cantidad de rondas, la ventaja simulada ` +
          `(${formatPct(empiricalEdge)}) ya se acerca bastante a ese ${formatPct(theo.edge)} teórico — ` +
          `mientras más rondas simules, más se acerca (Ley de los Grandes Números).`;
      } else {
        explainer =
          `${theo.note} Con ${rounds.toLocaleString("es-CO")} rondas simuladas, la mejor estimación disponible ` +
          `de la ventaja de la casa para esta apuesta es ${formatPct(empiricalEdge)}. ` +
          `Ejecuta la simulación varias veces o sube el número de rondas y compara: si el número se mueve poco, ` +
          `es una señal de que ya convergió.`;
      }
      explainerEl.textContent = explainer;

      drawChart(cumulative);

      resultsCard.hidden = false;
      statusEl.textContent = "";
      runBtn.disabled = false;
    }, 30);
  }

  runBtn.addEventListener("click", runSimulation);
})();
