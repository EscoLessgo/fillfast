import { DiscordSDK } from "@discord/embedded-app-sdk";

// Mock ID for development if not provided or environment var
const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || "123456789012345678";

export class DiscordManager {
    constructor() {
        this.sdk = null;
        try {
            // Attempt to instantiate SDK. This might fail if query params are missing.
            // We check for window.location search presence as a heuristic too.
            if (window.location.search.includes('frame_id')) {
                this.sdk = new DiscordSDK(CLIENT_ID);
            }
        } catch (e) {
            console.warn("Discord SDK failed to construct (likely local dev):", e);
        }

        this.ready = false;
        this.user = null;
    }

    async init() {
        // If SDK didn't construct, or we are not embedded, use Mock.
        const isEmbedded = window.parent !== window && this.sdk;

        if (!isEmbedded) {
            console.warn("Not running in Discord iframe or SDK failed. Creating Mock User.");
            this.user = {
                id: "mock_" + Math.floor(Math.random() * 1000),
                username: "LocalDevUser",
                discriminator: "0000",
                avatar: null
            };
            return;
        }

        try {
            await this.sdk.ready();
            this.ready = true;

            // 0. Try Cached Token first (Avoid Rate Limits)
            const cachedToken = sessionStorage.getItem("discord_access_token");
            if (cachedToken) {
                try {
                    const auth = await this.sdk.commands.authenticate({ access_token: cachedToken });
                    if (auth && auth.user) {
                        this.setUser(auth.user);
                        console.log("Discord Authenticated (Cached):", this.user.username);
                        return;
                    }
                } catch (e) {
                    console.log("Cached token invalid/expired, getting new one.");
                    sessionStorage.removeItem("discord_access_token");
                }
            }

            // 1. Authorize to get code
            const { code } = await this.sdk.commands.authorize({
                client_id: CLIENT_ID,
                response_type: "code",
                state: "",
                prompt: "none",
                scope: ["identify", "guilds"],
            });

            // 2. Exchange Code for Token (via Backend)
            const response = await fetch("/api/token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
            });

            if (!response.ok) {
                console.warn("Backend Token Exchange Failed. Ensure DISCORD_CLIENT_SECRET is set.");
                throw new Error("Token Exchange Failed");
            }

            const { access_token } = await response.json();

            // 3. Authenticate with Discord SDK
            const auth = await this.sdk.commands.authenticate({ access_token });

            if (!auth || !auth.user) {
                throw new Error("Authentication failed, no user returned.");
            }

            // 4. Success! Save Token & User
            sessionStorage.setItem("discord_access_token", access_token);
            this.setUser(auth.user);

            console.log("Discord Authenticated to:", this.user.username);

        } catch (error) {
            console.error("Discord Auth Failed/SDK Error (Using Guest):", error);
            // Fallback
            this.user = {
                id: "guest_" + Math.floor(Math.random() * 10000),
                username: "Guest Player",
                discriminator: "0000"
            };
        }
    }

    setUser(discordUser) {
        this.user = {
            id: discordUser.id,
            username: discordUser.global_name || discordUser.username,
            discriminator: discordUser.discriminator,
            avatar: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        };
    }

    getUser() {
        return this.user;
    }
}
