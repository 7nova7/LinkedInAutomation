#!/usr/bin/env node

/**
 * LinkedIn OAuth 2.0 Setup Helper
 *
 * This script walks you through getting a LinkedIn access token.
 * It starts a local server to handle the OAuth callback.
 *
 * Prerequisites:
 *   1. Create a LinkedIn App at https://www.linkedin.com/developers/apps
 *   2. Add the "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect" products
 *   3. Set redirect URL to: http://localhost:3456/callback
 *   4. Set your LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET environment variables
 *
 * Usage:
 *   LINKEDIN_CLIENT_ID=your_id LINKEDIN_CLIENT_SECRET=your_secret node auth-setup.js
 */

import express from "express";
import open from "open";

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3456/callback";
const PORT = 3456;

// Scopes needed for posting + reading profile
const SCOPES = ["openid", "profile", "email", "w_member_social"];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("\n❌ Missing credentials!\n");
  console.error("Set these environment variables before running:\n");
  console.error("  export LINKEDIN_CLIENT_ID=your_client_id");
  console.error("  export LINKEDIN_CLIENT_SECRET=your_client_secret\n");
  console.error("Get these from: https://www.linkedin.com/developers/apps\n");
  process.exit(1);
}

const app = express();

// Step 1: Redirect user to LinkedIn's authorization page
app.get("/", (req, res) => {
  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", "linkedin_mcp_setup");

  res.redirect(authUrl.toString());
});

// Step 2: Handle the callback and exchange code for token
app.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    res.send(`<h1>Authorization Failed</h1><p>${error}</p>`);
    console.error(`\n❌ Authorization failed: ${error}`);
    process.exit(1);
  }

  if (!code) {
    res.send("<h1>No authorization code received</h1>");
    console.error("\n❌ No authorization code in callback");
    process.exit(1);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      throw new Error(JSON.stringify(tokenData));
    }

    // Get user profile to find person ID
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = await profileRes.json();

    // Show success page
    res.send(`
      <html>
        <body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1 style="color: #0a66c2;">✅ LinkedIn Connected!</h1>
          <p>Hello, <strong>${profile.name}</strong>!</p>
          <p>Your credentials are ready. Add these to your environment:</p>
          <pre style="background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto;">
export LINKEDIN_ACCESS_TOKEN="${tokenData.access_token}"
export LINKEDIN_PERSON_ID="${profile.sub}"</pre>
          <p style="color: #666; font-size: 14px;">
            Token expires in ${Math.round(tokenData.expires_in / 86400)} days.
            You can close this window now.
          </p>
        </body>
      </html>
    `);

    // Print to terminal
    console.log("\n✅ Successfully authenticated with LinkedIn!\n");
    console.log(`   Name: ${profile.name}`);
    console.log(`   Person ID: ${profile.sub}\n`);
    console.log("   Add these to your environment (or .env file):\n");
    console.log(`   export LINKEDIN_ACCESS_TOKEN="${tokenData.access_token}"`);
    console.log(`   export LINKEDIN_PERSON_ID="${profile.sub}"\n`);
    console.log(`   Token expires in ${Math.round(tokenData.expires_in / 86400)} days.\n`);

    // Give time for the response to send, then exit
    setTimeout(() => process.exit(0), 2000);
  } catch (err) {
    res.send(`<h1>Token Exchange Failed</h1><pre>${err.message}</pre>`);
    console.error(`\n❌ Token exchange failed: ${err.message}`);
    process.exit(1);
  }
});

// Start server and open browser
const server = app.listen(PORT, async () => {
  console.log(`\n🔗 Opening LinkedIn authorization in your browser...\n`);
  console.log(`   If it doesn't open, visit: http://localhost:${PORT}\n`);
  await open(`http://localhost:${PORT}`);
});
