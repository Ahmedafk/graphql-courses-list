// Load environment variables from .env file
import "dotenv/config";

// Import required modules
import express from "express";
import { createHandler } from "graphql-http/lib/use/express";
import schema from "./db/schema.js";
import { authenticate } from "./auth/auth.js";

import pg from "pg";
const { Client } = pg;
const client = new Client();

const app = express();


/**
 * Set up a single route for all incoming GraphQL requests
 * using the createHandler from graphql-http.
 */
app.all(
  "/graphql",
  createHandler({
    schema: schema, // The GraphQL schema to be used
    /**
     * Define the context passed to each GraphQL resolver, providing
     * database client and user information for authenticated access.
     *
     * @param {Object} req - The incoming HTTP request.
     * @returns {Object} - Context containing the PostgreSQL client and authenticated user data.
     */
    context: (req) => ({
      client,                  // PostgreSQL client instance for database operations
      user: authenticate(req), // User authentication based on JWT token from request headers
    }),
  })
);

/**
 * Connect to the PostgreSQL database and start the Express server.
 */
client
  .connect()
  .then(() => {
    console.log("Connected to PostgreSQL");
    app
      .listen(9000)
      .on("listening", () =>
        console.log(`listening on http://localhost:9000/graphql`)
      );
  })
  .catch((err) => {
    console.error("Connection error", err.stack);
  });
