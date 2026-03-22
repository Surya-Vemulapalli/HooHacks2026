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
            authorizationParams: {
                redirect_uri: window.location.origin + "/dashboard"
            }
        });

        // 3. Handle redirect from Auth0
        const query = window.location.search;
        if (query.includes("code=") && query.includes("state=")) {
            await auth0Client.handleRedirectCallback();
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        return auth0Client;
    } catch (e) {
        console.error("Auth0 Init Error:", e);
    }
}
