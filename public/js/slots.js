/**
 * slots.js
 * -----------------------------------------------------------------
 * Juego 3: TRAGA-ALMAS 666
 *  - El resultado exacto (según la tabla de premios 1-1000) siempre lo
 *    decide el servidor; el cliente solo anima los 3 rodillos.
 *  - Cada rodillo es una "tira" (.reel-strip) mas larga que la ventana
 *    visible (.reel): mientras se espera al servidor gira en bucle
 *    infinito (loop perfecto por duplicado al 50%); al llegar el
 *    resultado, se cambia por una tira que termina justo en el simbolo
 *    ganador y se frena con una curva de desaceleracion, un rodillo
 *    despues del otro (como una tragamonedas real).
 * -----------------------------------------------------------------
 */

(function () {
  const spinBtn = document.getElementById("slots-spin-btn");
  const amountInput = document.getElementById("slots-amount");
  const reels = [
    document.getElementById("reel-0"),
    document.getElementById("reel-1"),
    document.getElementById("reel-2"),
  ];
  const strips = [
    document.getElementById("strip-0"),
    document.getElementById("strip-1"),
    document.getElementById("strip-2"),
  ];
  const resultBanner = document.getElementById("slots-result-banner");
  const resultLabelEl = document.getElementById("slots-result-label");
  const resultPrizeEl = document.getElementById("slots-result-prize");

  // Tematica TRAGA-ALMAS 666: los simbolos que manda el servidor son los
  // mismos de siempre (7, BAR, Campana, Cereza, Estrella, Diamante,
  // Herradura, Limon); aqui solo se pintan con iconos de terror + neon.
  const SYMBOL_ICON = {
    "7": "7",
    BAR: "BAR",
    Campana: "💀",
    Cereza: "🩸",
    Estrella: "🔥",
    Diamante: "🕷️",
    Herradura: "🦇",
    Limón: "🎃",
  };
  const LOOP_SYMBOLS = Object.values(SYMBOL_ICON);

  let spinning = false;

  function cell(text) {
    const div = document.createElement("div");
    div.className = "reel-cell";
    div.textContent = text;
    return div;
  }

  function randomLoopSymbol() {
    return LOOP_SYMBOLS[Math.floor(Math.random() * LOOP_SYMBOLS.length)];
  }

  // -------------------- Fase 1: giro en bucle (mientras llega el server) --------------------
  function startLoopSpin() {
    resultBanner.hidden = true;

    reels.forEach((reel, i) => {
      reel.classList.remove("win");
      const strip = strips[i];
      strip.style.transition = "none";
      strip.innerHTML = "";

      // Una tanda de simbolos aleatorios, duplicada, para loop perfecto:
      // al llegar a -50% se ve identico al inicio (0%), asi el bucle
      // CSS "spinning-loop" (infinite linear) no se nota al reiniciar.
      const batch = Array.from({ length: 8 }, randomLoopSymbol);
      [...batch, ...batch].forEach((sym) => strip.appendChild(cell(sym)));

      // Reflow para que el "transition:none" surta efecto antes de animar.
      void strip.offsetHeight;
      strip.classList.add("spinning-loop");
    });
  }

  // -------------------- Fase 2: aterrizaje en el resultado real --------------------
  function landReel(i, finalSymbolKey, delayMs, durationMs) {
    return new Promise((resolve) => {
      const reel = reels[i];
      const strip = strips[i];

      setTimeout(() => {
        strip.classList.remove("spinning-loop");

        const cellHeight = reel.clientHeight;
        const extraTurns = 3; // vueltas completas antes de frenar, solo efecto visual
        const filler = Array.from({ length: extraTurns * 8 }, randomLoopSymbol);
        const finalIcon = SYMBOL_ICON[finalSymbolKey] || finalSymbolKey;

        strip.style.transition = "none";
        strip.style.transform = "translateY(0)";
        strip.innerHTML = "";
        filler.forEach((sym) => strip.appendChild(cell(sym)));
        strip.appendChild(cell(finalIcon)); // ultima celda = resultado del servidor

        const totalCells = filler.length + 1;
        void strip.offsetHeight; // reflow: aplica el "sin transicion" antes de animar

        strip.style.transition = `transform ${durationMs}ms cubic-bezier(0.12, 0.8, 0.2, 1)`;
        strip.style.transform = `translateY(-${(totalCells - 1) * cellHeight}px)`;

        const onDone = () => {
          strip.removeEventListener("transitionend", onDone);
          // Deja la tira ya "en reposo" mostrando solo el simbolo final,
          // lista para el proximo giro.
          strip.style.transition = "none";
          strip.innerHTML = "";
          strip.appendChild(cell(finalIcon));
          strip.style.transform = "translateY(0)";
          resolve();
        };
        strip.addEventListener("transitionend", onDone);
      }, delayMs);
    });
  }

  spinBtn.addEventListener("click", () => {
    if (spinning) return;
    const amount = Number(amountInput.value);
    if (!amount || amount < 100) {
      window.showToast("La apuesta minima en Traga-Almas 666 es 100 monedas.");
      return;
    }
    spinning = true;
    spinBtn.disabled = true;
    startLoopSpin();
    window.socket.emit("slots:spin", { amount });
  });

  window.socket.on("slots:result", ({ reels: reelsResult, prize, label, multiplier }) => {
    const isWin = multiplier > 0;

    // Los 3 rodillos frenan uno despues del otro, como en una maquina real.
    Promise.all([
      landReel(0, reelsResult[0], 0, 1100),
      landReel(1, reelsResult[1], 350, 1300),
      landReel(2, reelsResult[2], 700, 1500),
    ]).then(() => {
      if (isWin) reels.forEach((reel) => reel.classList.add("win"));

      resultBanner.hidden = false;
      resultLabelEl.textContent = label;
      resultPrizeEl.textContent =
        prize > 0 ? `+${prize.toLocaleString("es-CO")} monedas` : "Sin premio esta vez";

      spinning = false;
      spinBtn.disabled = false;
    });
  });
})();
