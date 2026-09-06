const { io } = require("socket.io-client");
const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Conectado:", socket.id);
});

socket.on("balance:update", (d) => console.log("Saldo:", d.balance));
socket.on("error", (d) => console.log("ERROR:", d.message));

socket.on("teenpatti:state", (state) => {
  if (state.phase === "betting" && state.timeLeft === 15) {
    console.log("Apostando 100 a Mojito, 50 a Daiquiri, 60 a Crown...");
    socket.emit("teenpatti:bet", { betType: "cocktail", cocktail: "Mojito", amount: 100 });
    socket.emit("teenpatti:bet", { betType: "cocktail", cocktail: "Daiquiri", amount: 50 });
    socket.emit("teenpatti:bet", { betType: "crown", amount: 60 });
    // Probar que rechaza un tercer cóctel
    setTimeout(() => socket.emit("teenpatti:bet", { betType: "cocktail", cocktail: "Margarita", amount: 50 }), 300);
  }
});

socket.on("teenpatti:result", (r) => {
  console.log("RESULTADO:", r.winner, "-", r.type);
  setTimeout(() => process.exit(0), 500);
});

setTimeout(() => { console.log("timeout de seguridad"); process.exit(1); }, 40000);
