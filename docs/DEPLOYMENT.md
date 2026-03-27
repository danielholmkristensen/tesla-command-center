# Deployment

## Railway (Recommended)

1. Connect GitHub repo at [railway.app](https://railway.app)
2. Add environment variables:
   ```
   TESLA_CLIENT_ID=xxx
   TESLA_CLIENT_SECRET=xxx
   TESLA_API_REGION=eu
   ```
3. Add custom domain: `commandcenter.agency`
4. Railway provides DNS records → add to Porkbun

## DNS (Porkbun)

| Type | Name | Value |
|------|------|-------|
| CNAME | @ | `<railway-provided>.up.railway.app` |

## Tesla Developer Setup

1. Register at [developer.tesla.com](https://developer.tesla.com)
2. Create app with:
   - **Redirect URI:** `https://commandcenter.agency/callback`
   - **Origin:** `https://commandcenter.agency`
   - **Public Key URL:** `https://commandcenter.agency/.well-known/appspecific/com.tesla.3p.public-key.pem`
3. Copy CLIENT_ID and CLIENT_SECRET to Railway

## Local Development

```bash
npm install
export TESLA_CLIENT_ID=xxx
export TESLA_CLIENT_SECRET=xxx
npm start
```

Use ngrok for OAuth callback testing:
```bash
ngrok http 3000
```
