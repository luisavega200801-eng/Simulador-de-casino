/**
 * teenpatti.js
 * -----------------------------------------------------------------
 * Juego 2: Teen Patti de cócteles (Mojito, Margarita, Daiquiri)
 *  - Cada ronda se reparten 3 cartas a cada cóctel; gana el que logre
 *    la mejor combinación (Trío > Escalera del mismo color > Escalera
 *    > Mismo color > Pareja > Carta alta), decidido por el servidor.
 *  - El jugador puede apostar por HASTA 2 de los 3 cócteles (paga 3 a 1
 *    cada uno si acierta) y, adicionalmente, una apuesta "Crown" que
 *    paga según la combinación exacta con la que gane la ronda.
 * -----------------------------------------------------------------
 */

(function () {
  const phaseEl = document.getElementById("teenpatti-phase");
  const timerEl = document.getElementById("teenpatti-timer");
  const cardsRowEl = document.getElementById("teenpatti-cards");
  const amountInput = document.getElementById("teenpatti-amount");
  const hintEl = document.getElementById("teenpatti-hint");
  const historyEl = document.getElementById("teenpatti-history");
  const activeBetsEl = document.getElementById("teenpatti-active-bets");

  const crownAmountInput = document.getElementById("crown-amount");
  const crownBtn = document.getElementById("crown-bet-btn");
  const crownHintEl = document.getElementById("crown-hint");

  const tiles = document.querySelectorAll(".cocktail-tile");
  const MAX_COCKTAIL_BETS = 2;

  let myCocktailBets = {}; // { Mojito: 100, Daiquiri: 50 }
  let myCrownBet = null;

  function renderActiveBets() {
    activeBetsEl.innerHTML = "";
    Object.entries(myCocktailBets).forEach(([cocktail, amount]) => {
      const tag = document.createElement("span");
      tag.className = "active-bet-tag";
      tag.textContent = `${cocktail} · ${amount}`;
      activeBetsEl.appendChild(tag);
    });
  }

  tiles.forEach((tile) => {
    tile.addEventListener("click", () => {
      const cocktail = tile.dataset.cocktail;

      if (myCocktailBets[cocktail] !== undefined) {
        window.showToast("Ya apostaste por ese cóctel en esta ronda.");
        return;
      }
      if (Object.keys(myCocktailBets).length >= MAX_COCKTAIL_BETS) {
        window.showToast("Solo puedes apostar por 2 de los 3 cócteles.");
        return;
      }

      const amount = Number(amountInput.value);
      if (!amount || amount < 50) {
        window.showToast("La apuesta mínima en Teen Patti es 50 monedas.");
        return;
      }

      window.socket.emit("teenpatti:bet", { betType: "cocktail", cocktail, amount });
    });
  });

  crownBtn.addEventListener("click", () => {
    if (myCrownBet !== null) {
      window.showToast("Ya hiciste tu apuesta Crown en esta ronda.");
      return;
    }
    const amount = Number(crownAmountInput.value);
    if (!amount || amount < 50) {
      window.showToast("La apuesta mínima en Crown es 50 monedas.");
      return;
    }
    window.socket.emit("teenpatti:bet", { betType: "crown", amount });
  });

  window.socket.on("teenpatti:bet-ack", ({ betType, cocktail, amount }) => {
    if (betType === "cocktail") {
      myCocktailBets[cocktail] = amount;
      renderActiveBets();
      const tile = document.querySelector(`.cocktail-tile[data-cocktail="${cocktail}"]`);
      if (tile) tile.classList.add("selected");
      hintEl.textContent =
        Object.keys(myCocktailBets).length >= MAX_COCKTAIL_BETS
          ? "Ya usaste tus 2 apuestas de cóctel para esta ronda."
          : "Apuesta registrada. Puedes elegir un cóctel más.";
    } else if (betType === "crown") {
      myCrownBet = amount;
      crownBtn.disabled = true;
      crownHintEl.textContent = `Apostaste ${amount} a Crown. Esperando el resultado...`;
    }
  });

  function resetCombos() {
    ["Mojito", "Margarita", "Daiquiri"].forEach((c) => {
      const el = document.getElementById(`combo-${c}`);
      if (el) el.textContent = "--";
    });
  }

  function clearWinnerHighlight() {
    tiles.forEach((t) => t.classList.remove("winner"));
  }

  function renderHistory(history) {
    historyEl.innerHTML = "";
    (history || []).forEach((entry) => {
      const chip = document.createElement("span");
      chip.className = "history-chip";
      chip.textContent = `${entry.winner} (${entry.type})`;
      historyEl.appendChild(chip);
    });
  }

  window.socket.on("teenpatti:state", (state) => {
    timerEl.textContent = `${state.timeLeft}s`;
    renderHistory(state.history);

    if (state.phase === "betting") {
      phaseEl.textContent = "Apuestas abiertas";
      phaseEl.className = "phase-badge";
      if (state.timeLeft === 15) {
        myCocktailBets = {};
        myCrownBet = null;
        crownBtn.disabled = false;
        crownHintEl.textContent = "";
        tiles.forEach((t) => t.classList.remove("selected", "winner"));
        renderActiveBets();
        resetCombos();
        cardsRowEl.innerHTML = "";
        hintEl.textContent = "Toca hasta 2 cócteles arriba para apostar por ellos.";
      }
    } else if (state.phase === "locked") {
      phaseEl.textContent = "Apuestas cerradas";
      phaseEl.className = "phase-badge locked";
      hintEl.textContent = "Apuestas cerradas. Repartiendo cartas...";
    } else if (state.phase === "dealing") {
      phaseEl.textContent = "Repartiendo";
      phaseEl.className = "phase-badge locked";
    } else if (state.phase === "result") {
      phaseEl.textContent = "Resultado";
      phaseEl.className = "phase-badge result";
    }
  });

  window.socket.on("teenpatti:dealing", ({ hands, evaluations }) => {
    Object.entries(evaluations).forEach(([cocktail, evalData]) => {
      const el = document.getElementById(`combo-${cocktail}`);
      if (el) el.textContent = evalData.type;
    });

    cardsRowEl.innerHTML = "";
    Object.entries(hands).forEach(([cocktail, cards]) => {
      const group = document.createElement("div");
      cards.forEach((card) => {
        const cardEl = document.createElement("span");
        cardEl.className = `mini-card ${card.color === "Rojo" ? "red" : "black"}`;
        cardEl.textContent = card.value;
        group.appendChild(cardEl);
      });
      cardsRowEl.appendChild(group);
    });
  });

  window.socket.on("teenpatti:result", ({ winner, type, evaluations, history }) => {
    clearWinnerHighlight();
    const winnerTile = document.querySelector(`.cocktail-tile[data-cocktail="${winner}"]`);
    if (winnerTile) winnerTile.classList.add("winner");
    renderHistory(history);

    const wonCocktail = myCocktailBets[winner] !== undefined;
    hintEl.textContent = wonCocktail
      ? `¡Ganaste! ${winner} se llevó la ronda con "${type}".`
      : `Ganó ${winner} con "${type}".`;

    if (myCrownBet !== null) {
      const crownWinTypes = [
        "Trío",
        "Escalera del mismo color",
        "Escalera",
        "Mismo color",
        "Pareja",
      ];
      crownHintEl.textContent = crownWinTypes.includes(type)
        ? `¡Crown pagó! La ronda cerró con "${type}".`
        : `Crown no pagó esta vez (cerró con "${type}").`;
    }
  });
})();
