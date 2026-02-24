#!/usr/bin/env node

/**
 * LinkedIn MCP Server
 *
 * An MCP (Model Context Protocol) server that enables Claude to publish
 * posts directly to LinkedIn using the LinkedIn API v2.
 *
 * Tools provided:
 *   - linkedin_publish_post: Publish a text post to LinkedIn
 *   - linkedin_check_auth: Verify that credentials are valid
 *
 * Requires:
 *   - LINKEDIN_ACCESS_TOKEN environment variable (OAuth 2.0 token)
 *   - LINKEDIN_PERSON_ID environment variable (your LinkedIn member URN)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// LinkedIn API helpers
// ---------------------------------------------------------------------------

const LINKEDIN_API_BASE = "https://api.linkedin.com";

/**
 * Get the authenticated user's LinkedIn profile info.
 */
async function getLinkedInProfile(accessToken) {
  const res = await fetch(`${LINKEDIN_API_BASE}/v2/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn API error (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Publish a text post to LinkedIn using the Community Management API.
 *
 * LinkedIn's v2 Posts API expects:
 *   - author: "urn:li:person:{id}"
 *   - commentary: the post text
 *   - visibility: "PUBLIC" or "CONNECTIONS"
 *   - lifecycleState: "PUBLISHED"
 *   - distribution: feed distribution settings
 */
async function publishPost(accessToken, personId, postText, visibility = "PUBLIC") {
  const payload = {
    author: `urn:li:person:${personId}`,
    commentary: postText,
    visibility: visibility,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
  };

  const res = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202402",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn publish error (${res.status}): ${body}`);
  }

  // LinkedIn returns 201 Created with an x-restli-id header containing the post URN
  const postId = res.headers.get("x-restli-id") || "unknown";
  return {
    success: true,
    postId,
    message: `Post published successfully! Post ID: ${postId}`,
    url: `https://www.linkedin.com/feed/update/${postId}/`,
  };
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "linkedin-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "linkedin_publish_post",
        description:
          "Publish a text post to LinkedIn. Takes the post content and an optional visibility setting (PUBLIC or CONNECTIONS). Returns the post URL on success. IMPORTANT: Always confirm with the user before publishing.",
        inputSchema: {
          type: "object",
          properties: {
            post_text: {
              type: "string",
              description:
                "The full text of the LinkedIn post to publish. Should be plain text with line breaks (no markdown). Maximum 3000 characters.",
            },
            visibility: {
              type: "string",
              enum: ["PUBLIC", "CONNECTIONS"],
              description:
                "Who can see the post. PUBLIC = anyone on LinkedIn. CONNECTIONS = only your connections. Defaults to PUBLIC.",
              default: "PUBLIC",
            },
          },
          required: ["post_text"],
        },
      },
      {
        name: "linkedin_check_auth",
        description:
          "Check if the LinkedIn API credentials are valid and return the authenticated user's profile info. Use this to verify setup before attempting to publish.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personId = process.env.LINKEDIN_PERSON_ID;

  if (!accessToken) {
    return {
      content: [
        {
          type: "text",
          text: "Error: LINKEDIN_ACCESS_TOKEN environment variable is not set. Please run the auth setup first (see SETUP.md).",
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case "linkedin_check_auth": {
        const profile = await getLinkedInProfile(accessToken);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "authenticated",
                  name: profile.name,
                  email: profile.email,
                  sub: profile.sub,
                  message: "LinkedIn credentials are valid and working.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "linkedin_publish_post": {
        if (!personId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: LINKEDIN_PERSON_ID environment variable is not set. Run linkedin_check_auth first and use the 'sub' field as your person ID.",
              },
            ],
            isError: true,
          };
        }

        const postText = args.post_text;
        const visibility = args.visibility || "PUBLIC";

        if (!postText || postText.trim().length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Error: post_text is required and cannot be empty.",
              },
            ],
            isError: true,
          };
        }

        if (postText.length > 3000) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Post text is ${postText.length} characters. LinkedIn's maximum is 3000 characters. Please shorten the post.`,
              },
            ],
            isError: true,
          };
        }

        const result = await publishPost(accessToken, personId, postText, visibility);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `LinkedIn API error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LinkedIn MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
