
### How to Enable Real Usernames

To display actual Discord usernames instead of "Guest Player", the game needs to perform a secure "Token Exchange" with a backend server. **However**, you can enable a simpler "Client-Only" mode for your deployed app if you configure the Discord Developer Portal correctly.

1.  **Open your project in the Discord Developer Portal.**
2.  **Go to `OAuth2` settings.**
3.  **Add the Redirect**:
    *   Add your production URL (e.g., `https://your-game.vercel.app` or similar) to the Redirects list.
    *   Also ensure `http://localhost:5173` is there for local testing.
4.  **Set Your Client ID**:
    *   Create a file named `.env` in the root of your project folder.
    *   Add this line:
        ```env
        VITE_DISCORD_CLIENT_ID=your_actual_client_id_here
        ```
    *   Restart your server (`start-server.bat`).

### Terms & Privacy
I have added the **Terms of Service** and **Privacy Policy** to your game.
- Links are now visible at the bottom of the Lobby screen.
- The files `terms.html` and `privacy.html` are generated and ready for deployment.

### Deployment Note
To deploy this so others can play:
1.  **Frontend**: You can deploy the `index.html` and `src` files to Vercel, Netlify, or similar.
2.  **Backend**: The `server.js` file (Socket server) MUST be hosted on a service that supports Node.js processes, like **Railway**, **Render**, or **Glitch**.
3.  **Connection**: You must update `src/network.js` to point to your *deployed* backend URL instead of `localhost:3001`.
