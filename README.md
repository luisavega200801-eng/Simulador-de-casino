# 🎰 Casino Neón Multijugador

Simulador de casino multijugador en tiempo real, optimizado para celular, con estética neón
(fondo oscuro + bordes con degradado azul/morado/verde).

## Estructura del proyecto

```
casino-simulator/
├── server/
│   ├── server.js          # Backend: Express + Socket.io, lógica de los 3 juegos
│   └── package.json
└── public/                # Frontend servido como archivos estáticos
    ├── index.html          # Estructura HTML de las 3 pantallas de juego
    ├── css/
    │   └── styles.css      # Estética neón (tarjetas, chips, rueda, rodillos)
    └── js/
        ├── main.js         # Conexión Socket.io compartida, saldo, navegación, toasts
        ├── roulette.js      # Cliente Juego 1: Ruleta
        ├── teenpatti.js     # Cliente Juego 2: Teen Patti (cócteles)
        └── slots.js         # Cliente Juego 3: Tragamonedas
```

## Cómo ejecutarlo

```bash
cd server
npm install
npm start
```

Luego abre `http://localhost:3000` en el navegador (o en varias pestañas/celulares
en la misma red para probar el multijugador: todos verán la misma ruleta girar,
el mismo reparto de Teen Patti y el mismo saldo actualizado en tiempo real).

Para probar desde otro celular en la misma red Wi-Fi, reemplaza `localhost` por la
IP local de tu computador (ej: `http://192.168.1.5:3000`).

## Cómo funciona la sincronización multijugador

El **servidor es la única autoridad**: corre dos bucles infinitos (`rouletteLoop` y
`teenpattiLoop` en `server.js`) que avanzan fases (apuestas → giro/reparto → resultado)
con `setTimeout`/`await sleep()`, y en cada segundo transmite el estado (`io.emit`) a
**todos** los sockets conectados. Ningún jugador tiene su propio temporizador local:
todos reciben el mismo `timeLeft` y el mismo resultado en el mismo instante.

El saldo se guarda en el servidor (`Map` en memoria, `players`). Cuando un jugador
apuesta, el servidor descuenta el monto de inmediato y valida el mínimo; cuando la
ronda se resuelve, el servidor calcula el pago y emite `balance:update` únicamente
al socket del jugador afectado.

## Resumen de reglas implementadas

**Ruleta (mín. 100):** 13 casillas (0 blanco + 1-12 en amarillo/azul/rojo, 4 c/u).
Color 3 a 1, número directo 12 a 1, par/impar 2 a 1, el 0 blanco pierde todas las apuestas.

**Teen Patti (mín. 50):** mazo de 40 cartas (1-10, rojo/negro, 2 de c/u). 3 cartas por
cóctel (Mojito, Margarita, Daiquiri), gana la suma mayor, paga 2 a 1. Ciclo: 15s apuestas
→ bloqueo → reparto → resolución. Historial de últimos 5 ganadores.

**Tragamonedas (mín. 100):** tirada aleatoria 1-1000 mapeada exactamente a la tabla de
premios (7-7-7 x300, BAR x30, Campana x10, Cereza x5, Doble 7 x3, Doble Cereza x1, resto x0).

## Notas para producción

- El saldo actualmente vive en memoria (`Map`) y se reinicia si el servidor se reinicia.
  Para persistencia real, conecta una base de datos (Redis/Postgres) en su lugar.
- No hay autenticación: cada conexión de socket es un "jugador" nuevo con 10.000 monedas
  iniciales. Agrega login/sesión si necesitas identidad persistente entre reconexiones.
