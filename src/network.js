import { io } from "socket.io-client";

// In production, this URL should be your deployed server URL.
// For local Dev, it's localhost:3000
// Users will need to tunnel this if running essentially "serverless" on Discord Activity Proxy,
// but usually Discord Activities use a dedicated backend.
// In production, this URL should be your deployed server URL.
// IMPORTANT: For Discord Activities, this MUST be https (wss).
const SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || "http://localhost:3001";

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
