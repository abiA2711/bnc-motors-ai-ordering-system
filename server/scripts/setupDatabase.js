require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const databaseDirectory = path.resolve(__dirname, "..", "..", "database");
const applicationName = "bnc-motors-db-setup";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const relationKind = {
  r: "table",
  p: "partitioned table",
  v: "view",
  m: "materialized view",
  f: "foreign table",
  i: "index",
  I: "partitioned index",
  S: "sequence"
};

const isIdentifierChar = (character) => {
  return typeof character === "string" && /[A-Za-z0-9_]/.test(character);
};

const scanTransactionKeywords = (sql) => {
  const keywords = [];
  let index = 0;

  while (index < sql.length) {
    if (sql.startsWith("--", index)) {
      const lineEnd = sql.indexOf("\n", index);
      index = lineEnd === -1 ? sql.length : lineEnd + 1;
      continue;
    }

    if (sql.startsWith("/*", index)) {
      const commentEnd = sql.indexOf("*/", index + 2);
      index = commentEnd === -1 ? sql.length : commentEnd + 2;
      continue;
    }

    const quote = sql[index];

    if (quote === "'" || quote === "\"") {
      index += 1;

      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            index += 2;
            continue;
          }

          index += 1;
          break;
        }

        index += 1;
      }

      continue;
    }

    if (quote === "$") {
      const tag = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/);

      if (tag) {
        const bodyEnd = sql.indexOf(tag[0], index + tag[0].length);
        index = bodyEnd === -1 ? sql.length : bodyEnd + tag[0].length;
        continue;
      }
    }

    const word = sql.slice(index).match(/^[A-Za-z]+/);

    if (word) {
      const keyword = word[0].toUpperCase();

      if (
        (keyword === "BEGIN" || keyword === "COMMIT" || keyword === "ROLLBACK")
        && !isIdentifierChar(sql[index - 1])
        && !isIdentifierChar(sql[index + word[0].length])
      ) {
        keywords.push({
          keyword,
          index,
          end: index + word[0].length
        });
      }

      index += word[0].length;
      continue;
    }

    index += 1;
  }

  return keywords;
};

const stripOuterTransaction = (sql, label) => {
  const text = sql.replace(/^\uFEFF/, "");
  const keywords = scanTransactionKeywords(text);
  const shape = keywords.map((item) => item.keyword).join(", ");

  if (shape !== "BEGIN, COMMIT") {
    throw new Error(`${label} must contain one outer BEGIN and one outer COMMIT.`);
  }

  const begin = keywords[0];
  const commit = keywords[1];
  const before = text.slice(0, begin.index);
  const after = text.slice(commit.end);

  if (!/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*$/.test(before) || !/^\s*;?\s*$/.test(after)) {
    throw new Error(`${label} must contain one outer BEGIN and one outer COMMIT.`);
  }

  return text.slice(begin.end, commit.index);
};

const existingObjects = async (client) => {
  const result = await client.query(
    `SELECT c.relkind, c.relname
     FROM pg_class AS c
     JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'i', 'I', 'S')
     ORDER BY c.relname`
  );

  return result.rows;
};

const occupiedDatabaseMessage = (objects) => {
  const shown = objects.slice(0, 8).map((object) => {
    return `public.${object.relname} (${relationKind[object.relkind] || "object"})`;
  });
  const remainder = objects.length > shown.length ? `; ${objects.length - shown.length} more` : "";

  return [
    "db:setup is intended for a fresh, empty database.",
    `It found existing objects and stopped: ${shown.join(", ")}${remainder}.`,
    "It does not drop, truncate, or modify existing objects.",
    "Create an empty database, or use the migrations documented in the README for an existing database."
  ].join(" ");
};

const setupDatabase = async (connectionString, options = {}) => {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Create server/.env before running db:setup.");
  }

  const client = new Client({
    connectionString,
    application_name: applicationName
  });
  await client.connect();
  let transactionOpen = false;

  try {
    const objects = await existingObjects(client);

    if (objects.length > 0) {
      throw new Error(occupiedDatabaseMessage(objects));
    }

    const schema = stripOuterTransaction(
      fs.readFileSync(path.join(databaseDirectory, "schema.sql"), "utf8"),
      "database/schema.sql"
    );
    const seed = stripOuterTransaction(
      fs.readFileSync(path.join(databaseDirectory, "seed.sql"), "utf8"),
      "database/seed.sql"
    );

    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(schema);
    await client.query(seed);

    if (options.beforeCommit) {
      await client.query(options.beforeCommit);
    }

    await client.query("COMMIT");
    transactionOpen = false;
    console.log("Applied database/schema.sql and database/seed.sql.");
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Database setup rollback failed");
      }
    }

    throw error;
  } finally {
    await client.end();
  }
};

if (require.main === module) {
  setupDatabase(process.env.DATABASE_URL).catch((error) => {
    fail(error && error.message ? error.message : "Database setup failed");
  });
}

module.exports = {
  setupDatabase,
  stripOuterTransaction,
  applicationName
};
