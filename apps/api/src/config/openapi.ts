import type { GenerateSpecOptions } from "hono-openapi";

export const openApiSpec: GenerateSpecOptions["documentation"] = {
  info: {
    title: "Dragons API",
    version: "0.1.0",
    description: "Basketball club management API for the Dragons",
  },
  servers: [
    { url: "http://localhost:3001", description: "Local development" },
  ],
  tags: [
    { name: "Health", description: "Health check endpoints" },
    { name: "Sync", description: "Data sync operations and history" },
    { name: "Matches", description: "Match management" },
    { name: "Teams", description: "Team management" },
    { name: "Settings", description: "Application settings" },
    { name: "Leagues", description: "League tracking configuration" },
    { name: "Venues", description: "Venue management" },
    { name: "Referees", description: "Referee listings" },
    { name: "Standings", description: "League standings" },
    { name: "Boards", description: "Kanban board management" },
    { name: "Tasks", description: "Task management within boards" },
    { name: "Bookings", description: "Venue booking management" },
    { name: "Notifications", description: "User notifications" },
    { name: "Devices", description: "Push notification device registration" },
    { name: "Public", description: "Public endpoints (no auth required)" },
  ],
  security: [{ cookieAuth: [] }],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description: "Session cookie set by Better Auth",
      },
    },
  },
};
