let auth0Client = null;

async function initAuth() {
    try {
        // 1. Fetch the Auth0 configuration from your Flask backend
        const configResponse = await fetch("/api/config");
        const config = await configResponse.json();

        // 2. Initialize Auth0 using the globally loaded CDN script (from index.html)
        auth0Client = await auth0.createAuth0Client({
            domain: config.domain, 
            clientId: config.clientId, 
            cacheLocation: 'localstorage',
            authorizationParams: {
                redirect_uri: window.location.origin + "/dashboard"
            }
        });

        // 3. Handle redirect from Auth0
        const query = window.location.search;
        if (query.includes("code=") && query.includes("state=")) {
            try {
                await auth0Client.handleRedirectCallback();
            } catch (err) {
                console.warn("Invalid state or redirect callback error:", err);
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        const isAuthenticated = await auth0Client.isAuthenticated();
        if (isAuthenticated) {
            try {
                // Get the ID token instead of an API access token so we avoid the "Service not found" error
                const claims = await auth0Client.getIdTokenClaims();
                const token = claims.__raw;
                const user = await auth0Client.getUser();
                await fetch("/api/users/sync", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email: user.email,
                        name: user.name || user.nickname
                    })
                });
            } catch (syncError) {
                console.error("Failed to sync user to Snowflake:", syncError);
            }
        }

        return auth0Client;
    } catch (e) {
        console.error("Auth0 Init Error:", e);
    }
}
