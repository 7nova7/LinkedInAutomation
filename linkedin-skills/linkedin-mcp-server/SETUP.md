# LinkedIn MCP Server — Setup Guide

This MCP server lets Claude publish posts directly to LinkedIn. Here's how to set it up.

## Step 1: Create a LinkedIn App

1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)
2. Click **Create App**
3. Fill in the details (app name, company page, logo)
4. Under the **Products** tab, request access to:
   - **Share on LinkedIn** (required for posting)
   - **Sign In with LinkedIn using OpenID Connect** (required for auth)
5. Under **Auth** tab:
   - Copy your **Client ID** and **Client Secret**
   - Add `http://localhost:3456/callback` as an **Authorized Redirect URL**

## Step 2: Get Your Access Token

Run the auth setup script:

```bash
cd linkedin-mcp-server
npm install
LINKEDIN_CLIENT_ID=your_id LINKEDIN_CLIENT_SECRET=your_secret npm run auth
```

This opens your browser, you log into LinkedIn, and it gives you:
- `LINKEDIN_ACCESS_TOKEN` — your OAuth token
- `LINKEDIN_PERSON_ID` — your LinkedIn member ID

Save these somewhere safe (e.g., a `.env` file).

## Step 3: Configure Claude to Use This MCP Server

### For Claude Code (terminal)

Add this to your `~/.claude/claude_desktop_config.json` or project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "node",
      "args": ["/path/to/linkedin-mcp-server/index.js"],
      "env": {
        "LINKEDIN_ACCESS_TOKEN": "your_token_here",
        "LINKEDIN_PERSON_ID": "your_person_id_here"
      }
    }
  }
}
```

### For Claude Desktop App

Go to Settings → Developer → Edit Config, and add the same block above.

## Step 4: Test It

In Claude, say:
- "Check my LinkedIn auth" — should return your profile info
- "Publish this post to LinkedIn: [your text]" — publishes to your feed

## Token Refresh

LinkedIn access tokens expire after 60 days. When yours expires, run `npm run auth` again to get a new one.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "401 Unauthorized" | Token expired — run auth setup again |
| "403 Forbidden" | Your LinkedIn app doesn't have "Share on LinkedIn" product approved |
| "LINKEDIN_PERSON_ID not set" | Run `linkedin_check_auth` first, then use the `sub` field |
| Post doesn't appear | Check visibility setting (PUBLIC vs CONNECTIONS) |
