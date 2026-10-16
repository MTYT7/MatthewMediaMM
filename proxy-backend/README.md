# MatthewMedia Web backend (starter)

A restricted website-viewer backend for the static MatthewMediaMM site. It is not an unrestricted/open proxy.

## Deploy on Render

1. In Render, choose **New + → Web Service** and connect the GitHub repository.
2. Set **Root Directory** to `proxy-backend`, **Build Command** to `npm install`, and **Start Command** to `npm start`.
3. Add environment variable `ALLOWED_HOSTS` with comma-separated domains you are permitted to access, for example `example.com,wikipedia.org,developer.mozilla.org`.
4. Deploy. Check `https://YOUR-SERVICE.onrender.com/health`; it should return JSON with `"ok": true`.

The free tier is suitable for experimenting but may sleep or have usage limits. Render may change its free-tier terms.

## Test

```
https://YOUR-SERVICE.onrender.com/fetch?url=https%3A%2F%2Fexample.com
```

This starter validates hostnames and redirects, blocks private/reserved addresses, accepts only allowlisted hosts, supports HTML/plain text, and limits requests to 10 seconds and 2 MB.

## Connect from MatthewMediaMM

After deploying, use the real service URL:

```js
const backend = "https://YOUR-SERVICE.onrender.com/fetch?url=";
document.getElementById("webFrame").src =
  backend + encodeURIComponent(document.getElementById("webUrl").value.trim());
```

This is a starting point, not a complete browser proxy. It inserts a base URL for relative resources but does not rewrite every link, script, cookie, API call, WebSocket, or login flow. Some websites will not work. Keep the allowlist intentional and do not use this service to bypass access controls or network policies.
