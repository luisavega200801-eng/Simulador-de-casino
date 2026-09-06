/**
 * roulette.js
 * -----------------------------------------------------------------
 * Juego 1: Ruleta Aleatoria (13 casillas: 0 blanco + 1-12 tricolor)
 *  - Dibuja las 13 casillas alrededor de la rueda según el orden
 *    que define el servidor (ROULETTE_WHEEL_ORDER).
 *  - Escucha el estado global (fase + temporizador) para que todos
 *    los jugadores vean exactamente la misma cuenta regresiva.
 *  - Al recibir "roulette:spin" gira la rueda con CSS de forma
 *    sincronizada.
 *  - Los números permanecen SIEMPRE DERECHOS mientras la rueda gira.
 * -----------------------------------------------------------------
 */

(function () {
  const wheelEl = document.getElementById("roulette-wheel");
  const phaseEl = document.getElementById("roulette-phase");
  const timerEl = document.getElementById("roulette-timer");
  const numberGrid = document.getElementById("roulette-number-grid");
  const amountInput = document.getElementById("roulette-amount");
  const hintEl = document.getElementById("roulette-hint");
  const activeBetsEl = document.getElementById("roulette-active-bets");
  const resultBanner = document.getElementById("roulette-result-banner");
  const resultNumberEl = document.getElementById("roulette-result-number");
  const resultColorEl = document.getElementById("roulette-result-color");

  const COLOR_HEX = {
    amarillo: "#ffd23f",
    azul: "#3b82f6",
    rojo: "#ff4d6d",
    blanco: "#f4f4fb"
  };

  let wheelOrder = [];
  let wheelBuilt = false;
  let currentRotation = 0;
  let myBetsThisRound = [];

  // ================================================================
  // MANTENER LOS NÚMEROS DERECHOS
  // ================================================================
  //
  // La rueda completa gira mediante:
  //
  //     transform: rotate(...)
  //
  // Por eso los números también girarían.
  //
  // Para evitarlo, cada número recibe una contra-rotación igual
  // al giro de la rueda, pero alrededor de su propio centro.
  //
  // De esta manera:
  //   - el número sigue en su gajo
  //   - el gajo gira
  //   - el número permanece derecho
  // ================================================================

  function setupNumberOrientation() {
    if (document.getElementById("roulette-number-orientation-style")) {
      return;
    }

    const style = document.createElement("style");

    style.id = "roulette-number-orientation-style";

    style.textContent = `
      .wheel-number-text {
        transform: rotate(
          var(--roulette-number-counter-rotation, 0deg)
        );

        transform-box: fill-box;
        transform-origin: center;

        transition:
          transform 4.5s cubic-bezier(0.15, 0.85, 0.25, 1);
      }
    `;

    document.head.appendChild(style);

    wheelEl.style.setProperty(
      "--roulette-number-counter-rotation",
      "0deg"
    );
  }

  setupNumberOrientation();

  function updateNumberOrientation() {
    wheelEl.style.setProperty(
      "--roulette-number-counter-rotation",
      `${-currentRotation}deg`
    );
  }

  // ================================================================
  // COLOR DE CADA NÚMERO
  // ================================================================

  function numberColorClient(n, order, colorsMap) {
    if (n === 0) {
      return "blanco";
    }

    if ([1, 2, 3, 4].includes(n)) {
      return "amarillo";
    }

    if ([5, 6, 7, 8].includes(n)) {
      return "azul";
    }

    return "rojo";
  }

  // ================================================================
  // DIBUJO DE LA RULETA
  // ================================================================

  const WHEEL_CX = 100;
  const WHEEL_CY = 100;

  const WHEEL_R_OUTER = 92;
  const WHEEL_R_INNER = 46;
  const WHEEL_R_NUMBER = 70;
  const WHEEL_R_BOLT = 44;

  const WEDGE_GRADIENT = {
    blanco: "url(#grad-blanco)",
    amarillo: "url(#grad-amarillo)",
    azul: "url(#grad-azul)",
    rojo: "url(#grad-rojo)"
  };

  const NUMBER_TEXT_COLOR = {
    blanco: "#0a0a12",
    amarillo: "#0a0a12",
    azul: "#ffffff",
    rojo: "#ffffff"
  };

  // ================================================================
  // CONVERTIR POLAR A CARTESIANO
  // ================================================================

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;

    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  }

  // ================================================================
  // CREAR GAJO DE LA RULETA
  // ================================================================

  function describeWedge(
    cx,
    cy,
    rOuter,
    rInner,
    startAngle,
    endAngle
  ) {
    const p1 = polarToCartesian(
      cx,
      cy,
      rOuter,
      startAngle
    );

    const p2 = polarToCartesian(
      cx,
      cy,
      rOuter,
      endAngle
    );

    const p3 = polarToCartesian(
      cx,
      cy,
      rInner,
      endAngle
    );

    const p4 = polarToCartesian(
      cx,
      cy,
      rInner,
      startAngle
    );

    const largeArc =
      endAngle - startAngle > 180 ? 1 : 0;

    return [
      `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,

      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ` +
        `${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,

      `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,

      `A ${rInner} ${rInner} 0 ${largeArc} 0 ` +
        `${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,

      "Z"
    ].join(" ");
  }

  // ================================================================
  // CONSTRUIR RULETA
  // ================================================================

  function buildWheel(order) {
    const total = order.length;

    const sliceAngle = 360 / total;

    let wedges = "";
    let separators = "";
    let numbers = "";
    let bolts = "";

    order.forEach((num, index) => {
      /*
       * -90 grados hace que el primer número quede arriba,
       * justo debajo del puntero.
       */

      const midAngle =
        index * sliceAngle - 90;

      const startAngle =
        midAngle - sliceAngle / 2;

      const endAngle =
        midAngle + sliceAngle / 2;

      const color =
        numberColorClient(num);

      // ------------------------------------------------------------
      // GAJO
      // ------------------------------------------------------------

      wedges += `
        <path
          class="wheel-wedge"
          d="${describeWedge(
            WHEEL_CX,
            WHEEL_CY,
            WHEEL_R_OUTER,
            WHEEL_R_INNER,
            startAngle,
            endAngle
          )}"
          fill="${WEDGE_GRADIENT[color]}"
        />
      `;

      // ------------------------------------------------------------
      // SEPARADORES
      // ------------------------------------------------------------

      const sepOuter =
        polarToCartesian(
          WHEEL_CX,
          WHEEL_CY,
          WHEEL_R_OUTER,
          startAngle
        );

      const sepInner =
        polarToCartesian(
          WHEEL_CX,
          WHEEL_CY,
          WHEEL_R_INNER,
          startAngle
        );

      separators += `
        <line
          x1="${sepInner.x.toFixed(2)}"
          y1="${sepInner.y.toFixed(2)}"
          x2="${sepOuter.x.toFixed(2)}"
          y2="${sepOuter.y.toFixed(2)}"
          class="wheel-separator"
        />
      `;

      // ------------------------------------------------------------
      // POSICIÓN DEL NÚMERO
      // ------------------------------------------------------------

      const numPos =
        polarToCartesian(
          WHEEL_CX,
          WHEEL_CY,
          WHEEL_R_NUMBER,
          midAngle
        );

      /*
       * IMPORTANTE:
       *
       * El texto NO recibe una rotación radial.
       *
       * Se mantiene horizontal inicialmente.
       *
       * Cuando la rueda gira, CSS aplica automáticamente
       * la contra-rotación.
       */

      numbers += `
        <text
          x="${numPos.x.toFixed(2)}"
          y="${numPos.y.toFixed(2)}"
          class="wheel-number-text"
          fill="${NUMBER_TEXT_COLOR[color]}"
        >${num}</text>
      `;
    });

    // ================================================================
    // TORNILLOS DECORATIVOS
    // ================================================================

    const boltCount = 12;

    for (let i = 0; i < boltCount; i++) {
      const angle =
        (360 / boltCount) * i;

      const p =
        polarToCartesian(
          WHEEL_CX,
          WHEEL_CY,
          WHEEL_R_BOLT,
          angle
        );

      bolts += `
        <circle
          cx="${p.x.toFixed(2)}"
          cy="${p.y.toFixed(2)}"
          r="1.6"
          class="wheel-bolt"
        />
      `;
    }

    // ================================================================
    // SVG COMPLETO
    // ================================================================

    wheelEl.innerHTML = `
      <svg
        viewBox="0 0 200 200"
        class="wheel-svg"
        preserveAspectRatio="xMidYMid meet"
      >

        <defs>

          <radialGradient
            id="grad-amarillo"
            cx="35%"
            cy="30%"
            r="80%"
          >
            <stop
              offset="0%"
              stop-color="#fff3b0"
            />

            <stop
              offset="55%"
              stop-color="#ffd23f"
            />

            <stop
              offset="100%"
              stop-color="#d9a300"
            />
          </radialGradient>


          <radialGradient
            id="grad-azul"
            cx="35%"
            cy="30%"
            r="80%"
          >
            <stop
              offset="0%"
              stop-color="#a9c8ff"
            />

            <stop
              offset="55%"
              stop-color="#3b82f6"
            />

            <stop
              offset="100%"
              stop-color="#1a4fb4"
            />
          </radialGradient>


          <radialGradient
            id="grad-rojo"
            cx="35%"
            cy="30%"
            r="80%"
          >
            <stop
              offset="0%"
              stop-color="#ffb0bf"
            />

            <stop
              offset="55%"
              stop-color="#ff4d6d"
            />

            <stop
              offset="100%"
              stop-color="#c4183a"
            />
          </radialGradient>


          <radialGradient
            id="grad-blanco"
            cx="35%"
            cy="30%"
            r="80%"
          >
            <stop
              offset="0%"
              stop-color="#ffffff"
            />

            <stop
              offset="60%"
              stop-color="#f4f4fb"
            />

            <stop
              offset="100%"
              stop-color="#c7c7db"
            />
          </radialGradient>


          <radialGradient
            id="grad-hub"
            cx="40%"
            cy="35%"
            r="75%"
          >
            <stop
              offset="0%"
              stop-color="#22233f"
            />

            <stop
              offset="70%"
              stop-color="#12122a"
            />

            <stop
              offset="100%"
              stop-color="#05050f"
            />
          </radialGradient>

        </defs>


        <!-- BORDE EXTERIOR -->

        <circle
          cx="100"
          cy="100"
          r="97"
          class="wheel-bezel-outer"
        />


        <!-- GAJOS -->

        ${wedges}


        <!-- SEPARADORES -->

        ${separators}


        <!-- BORDE DEL CENTRO -->

        <circle
          cx="100"
          cy="100"
          r="${WHEEL_R_INNER}"
          class="wheel-hub-ring"
        />


        <!-- CENTRO -->

        <circle
          cx="100"
          cy="100"
          r="${WHEEL_R_INNER - 4}"
          fill="url(#grad-hub)"
        />


        <!-- TORNILLOS -->

        ${bolts}


        <!-- ICONO DEL CENTRO -->
        <!-- Este grupo tendrá una contrarrotación para que
            el icono permanezca completamente inmóvil -->

        <g
          id="roulette-center-icon"
          class="roulette-center-icon"
        >
          <text
            x="100"
            y="104"
            class="wheel-hub-icon"
          >♠</text>
        </g>


        <!-- NÚMEROS -->

        <g class="wheel-numbers-group">
          ${numbers}
        </g>

      </svg>
    `;

    wheelBuilt = true;

    // Aseguramos que los números comiencen derechos.
    updateNumberOrientation();
  }

  // ================================================================
  // BOTONES DE NÚMEROS
  // ================================================================

  function buildNumberGrid() {
    numberGrid.innerHTML = "";

    for (let n = 1; n <= 12; n++) {
      const color =
        numberColorClient(n);

      const btn =
        document.createElement("button");

      btn.className =
        `number-chip ${color}`;

      btn.textContent = n;

      btn.dataset.betType =
        "number";

      btn.dataset.betValue =
        n;

      numberGrid.appendChild(btn);
    }
  }

  buildNumberGrid();

  // ================================================================
  // SELECCIÓN DE APUESTA
  // ================================================================

  let selectedBet = null;

  function clearSelection() {
    document
      .querySelectorAll(
        ".color-chip, .option-chip, .number-chip"
      )
      .forEach((el) => {
        el.classList.remove("selected");
      });
  }

  document
    .querySelectorAll(
      ".color-chip, .option-chip, #roulette-number-grid .number-chip"
    )
    .forEach((el) => {
      // Los chips se manejan mediante attachChipHandlers().
    });

  function attachChipHandlers() {
    document
      .querySelectorAll("[data-bet-type]")
      .forEach((el) => {

        el.addEventListener("click", () => {

          clearSelection();

          el.classList.add("selected");

          selectedBet = {
            type: el.dataset.betType,
            value: el.dataset.betValue
          };

          confirmBet();
        });
      });
  }

  attachChipHandlers();

  // ================================================================
  // CONFIRMAR APUESTA
  // ================================================================

  function confirmBet() {
    if (!selectedBet) {
      return;
    }

    const amount =
      Number(amountInput.value);

    if (!amount || amount < 100) {
      window.showToast(
        "La apuesta mínima en Ruleta es 100 monedas."
      );

      return;
    }

    window.socket.emit(
      "roulette:bet",
      {
        type: selectedBet.type,
        value: selectedBet.value,
        amount
      }
    );
  }

  // ================================================================
  // APUESTA REGISTRADA
  // ================================================================

  window.socket.on(
    "roulette:bet-ack",
    (bet) => {

      myBetsThisRound.push(bet);

      renderActiveBets();

      hintEl.textContent =
        "Apuesta registrada. Puedes agregar más antes de que cierre la ronda.";
    }
  );

  // ================================================================
  // MOSTRAR APUESTAS
  // ================================================================

  function renderActiveBets() {
    activeBetsEl.innerHTML = "";

    myBetsThisRound.forEach((bet) => {

      const tag =
        document.createElement("span");

      tag.className =
        "active-bet-tag";

      const label =
        bet.type === "color"
          ? bet.value
          : bet.type === "number"
            ? `Número ${bet.value}`
            : bet.value;

      tag.textContent =
        `${label} · ${bet.amount}`;

      activeBetsEl.appendChild(tag);
    });
  }

  // ================================================================
  // ESTADO GLOBAL
  // ================================================================

  window.socket.on(
    "roulette:state",
    (state) => {

      // Construir rueda cuando llega el orden del servidor.

      if (
        !wheelBuilt &&
        state.wheelOrder?.length
      ) {
        wheelOrder =
          state.wheelOrder;

        buildWheel(wheelOrder);
      }

      timerEl.textContent =
        `${state.timeLeft}s`;

      // ------------------------------------------------------------
      // APUESTAS
      // ------------------------------------------------------------

      if (state.phase === "betting") {

        phaseEl.textContent =
          "Apuestas abiertas";

        phaseEl.className =
          "phase-badge";

        resultBanner.hidden =
          true;

        if (state.timeLeft === 15) {

          myBetsThisRound = [];

          renderActiveBets();

          clearSelection();

          selectedBet = null;

          hintEl.textContent =
            "Selecciona un tipo de apuesta arriba, luego confirma.";
        }
      }

      // ------------------------------------------------------------
      // GIRANDO
      // ------------------------------------------------------------

      else if (state.phase === "spinning") {

        phaseEl.textContent =
          "Girando...";

        phaseEl.className =
          "phase-badge locked";

        hintEl.textContent =
          "La rueda está girando. ¡Suerte!";
      }

      // ------------------------------------------------------------
      // RESULTADO
      // ------------------------------------------------------------

      else if (state.phase === "result") {

        phaseEl.textContent =
          "Resultado";

        phaseEl.className =
          "phase-badge result";
      }
    }
  );

  // ================================================================
  // GIRO SINCRONIZADO
  // ================================================================

  window.socket.on(
    "roulette:spin",
    ({ number, wheelOrder: order }) => {

      // ------------------------------------------------------------
      // Si todavía no existe la rueda, construirla.
      // ------------------------------------------------------------

      if (
        !wheelBuilt &&
        order?.length
      ) {
        wheelOrder = order;

        buildWheel(wheelOrder);
      }

      // ------------------------------------------------------------
      // Buscar posición del número ganador.
      // ------------------------------------------------------------

      const index =
        wheelOrder.indexOf(number);

      if (index === -1) {
        return;
      }

      const sliceAngle =
        360 / wheelOrder.length;

      // ------------------------------------------------------------
      // Ángulo donde debe terminar el ganador.
      // ------------------------------------------------------------

      const targetMod =
        (
          360 -
          (
            (index * sliceAngle) % 360
          )
        ) % 360;

      // ------------------------------------------------------------
      // Vueltas extra para efecto visual.
      // ------------------------------------------------------------

      const extraSpins =
        5 * 360;

      let newRotation =
        currentRotation +
        extraSpins;

      // ------------------------------------------------------------
      // Calcular diferencia hasta el número ganador.
      // ------------------------------------------------------------

      const diff =
        (
          targetMod -
          (newRotation % 360) +
          360
        ) % 360;

      newRotation += diff;

      // ------------------------------------------------------------
      // Guardar nueva rotación.
      // ------------------------------------------------------------

      currentRotation =
        newRotation;

      // ------------------------------------------------------------
      // IMPORTANTE:
      //
      // La rueda gira +currentRotation.
      //
      // Los números giran -currentRotation.
      //
      // Así quedan siempre derechos.
      // ------------------------------------------------------------

      wheelEl.style.setProperty(
        "--roulette-number-counter-rotation",
        `${-currentRotation}deg`
      );

      // ------------------------------------------------------------
      // Girar rueda.
      // ------------------------------------------------------------

      wheelEl.style.transform =
        `rotate(${currentRotation}deg)`;

      // Mantener el icono central completamente inmóvil.
      const centerIcon =
        document.getElementById("roulette-center-icon");

      if (centerIcon) {
        centerIcon.setAttribute(
          "transform",
          `rotate(${-currentRotation} 100 100)`
        );
      }
    }
  );

  // ================================================================
  // RESULTADO FINAL
  // ================================================================

  window.socket.on(
    "roulette:result",
    ({ number, color }) => {

      resultBanner.hidden =
        false;

      resultNumberEl.textContent =
        number;

      resultColorEl.textContent =
        color;

      resultColorEl.style.color =
        COLOR_HEX[color] || "#fff";
    }
  );

})();