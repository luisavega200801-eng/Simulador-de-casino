const { io } = require("socket.io-client");
const socket = io("http://localhost:3000");
let placed = false;

socket.on("connect", () => console.log("Conectado:", socket.id));
socket.on("balance:update", (d) => console.log("Saldo:", d.balance));
socket.on("error", (d) => console.log("ERROR (esperado para la 3ra apuesta):", d.message));
socket.on("teenpatti:bet-ack", (d) => console.log("BET-ACK:", d));

socket.on("teenpatti:state", (state) => {
  if (state.phase === "betting" && !placed) {
    placed = true;
    console.log("Apostando 100 a Mojito, 50 a Daiquiri, 60 a Crown, e intentando un 3er cóctel (debe fallar)...");
    socket.emit("teenpatti:bet", { betType: "cocktail", cocktail: "Mojito", amount: 100 });
    socket.emit("teenpatti:bet", { betType: "cocktail", cocktail: "Daiquiri", amount: 50 });
    socket.emit("teenpatti:bet", { betType: "crown", amount: 60 });
    setTimeout(() => socket.emit("teenpatti:bet", { betType: "cocktail", cocktail: "Margarita", amount: 50 }), 200);
  }
});

socket.on("teenpatti:result", (r) => {
  console.log("RESULTADO:", r.winner, "-", r.type);
  setTimeout(() => process.exit(0), 300);
});

setTimeout(() => { console.log("timeout de seguridad"); process.exit(1); }, 45000);
