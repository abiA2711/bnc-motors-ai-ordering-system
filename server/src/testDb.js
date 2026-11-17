
require("dotenv").config();

const pool = require("./config/db");

const testDatabaseConnection = async () => {
  try {
    const result = await pool.query(`
      SELECT
        NOW() AS current_time,
        current_database() AS database_name
    `);

    console.log("PostgreSQL connected successfully!");
    console.log("Database:", result.rows[0].database_name);
    console.log("Database time:", result.rows[0].current_time);

  } catch (error) {
    console.error("PostgreSQL connection failed!");
    console.error(error.message);

  } finally {
    await pool.end();
  }
};

testDatabaseConnection();
