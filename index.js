import "dotenv/config";
import express from "express";
import { createHandler } from "graphql-http/lib/use/express";
import schema from "./db/schema.js";
import { authenticate } from "./auth/auth.js";

import pg from "pg";
const { Client } = pg;
const client = new Client();

const app = express();
app.all(
  "/graphql",
  createHandler({
    schema: schema,
    context: (req) => ({
      client,
      user: authenticate(req),
    }),
  })
);

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
