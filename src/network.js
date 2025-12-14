import { io } from "socket.io-client";

// In production, the backend serves the frontend, so we connect to the same origin.
// In local dev (Vite), we need to point to the backend port 3001.
// 1. If VITE_GAME_SERVER_URL is set in .env (or Vercel Dashboard), use it (Cross-Origin Split).
// 2. If not set, but in Production, assume Single-Server (Frontend served by Backend).
// 3. Fallback to localhost for dev.
const SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || (import.meta.env.PROD ? "/" : "http://localhost:3001");

export class NetworkManager {
    constructor(onEvent) {
        this.socket = io(SERVER_URL);
        this.onEvent = onEvent;

        this.setupListeners();
    }

    setupListeners() {
        this.socket.on("connect", () => {
            console.log("Connected to Game Server");
            this.onEvent("connected");
        });

        this.socket.on("lobby_created", (data) => this.onEvent("lobby_created", data));
        this.socket.on("room_list", (data) => this.onEvent("room_list", data));
        this.socket.on("game_start", (data) => this.onEvent("game_start", data));
        this.socket.on("state_update", (data) => this.onEvent("state_update", data));
        this.socket.on("game_over", (data) => this.onEvent("game_over", data));
        this.socket.on("spectator_update", (data) => this.onEvent("spectator_update", data));
        this.socket.on("player_left", (data) => this.onEvent("player_left", data));
        this.socket.on("error", (msg) => console.error("Socket Error:", msg));
    }

    createLobby(userData) {
        this.socket.emit("create_lobby", userData);
    }

    joinLobby(roomId, userData) {
        this.socket.emit("join_lobby", { roomId, userData });
    }

    makeMove(roomId, move) {
        this.socket.emit("make_move", { roomId, move });
    }
}
