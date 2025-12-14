# Deployment Route: Vercel + Backend (Hybrid)

You requested **Vercel**. This is a great choice for the Frontend (visuals), but Vercel **cannot** host the Game Server (logic/multiplayer) because Vercel shuts down servers after 10 seconds (Serverless), and games need a permanent connection.

**The Solution:** We will split the app.
1.  **Frontend (Vercel)**: Hosts the HTML/JS/CSS.
2.  **Backend (Railway/Render)**: Hosts the `server.js` (Socket.io) that players connect to.

## Step 1: Deploy Backend (Game Server)
We need the backend running first so we can tell Vercel where to connect.

1.  **Push code to GitHub**.
2.  **Go to Railway.app** (or Render.com).
3.  **New Project** -> Deploy from GitHub Repo (`clones_and_boxes`).
4.  **Settings**:
    - **Build Command**: `npm install` (We only need dependencies for the server).
    - **Start Command**: `node server.js`
5.  **Copy the Domain**: Once active, copy the URL (e.g., `https://clones-backend.up.railway.app`).

## Step 2: Deploy Frontend to Vercel
1.  **Go to Vercel.com**.
2.  **Add New Project** -> Select the same GitHub Repo.
3.  **Environment Variables**:
    - Add a new variable named: `VITE_GAME_SERVER_URL`
    - Value: Paste your Backend URL from Step 1 (e.g., `https://clones-backend.up.railway.app`).
    - *Note: Do NOT include a trailing slash `/`.*
    - Add: `VITE_DISCORD_CLIENT_ID` -> Your Discord Application ID.
4.  **Deploy**.
5.  **Copy the Vercel Domain**: (e.g., `https://clones-and-boxes.vercel.app`).

## Step 3: Connect Discord
1.  **Go to Discord Developer Portal**.
2.  **Activities > URL Mappings**:
    - Set `/` to your **Vercel Domain** (e.g., `https://clones-and-boxes.vercel.app`).
3.  **Oauth2 > Redirects**:
    - Add your Vercel Domain.

## Why this split?
- **Vercel** gives you a super fast, global CDN for the images/site.
- **Railway/Render** keeps the socket connection open 24/7 for multiplayer.
