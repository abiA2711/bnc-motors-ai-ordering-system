const pool = require("../config/db");

const SAFE_USER_FIELDS = `
  id,
  name,
  email,
  phone,
  company_name,
  country,
  country_code,
  state,
  district,
  role,
  is_active,
  created_at,
  updated_at
`;

const toSafeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    company_name: user.company_name,
    country: user.country,
    country_code: user.country_code,
    state: user.state,
    district: user.district,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
};

const findByEmail = async (email) => {
  const result = await pool.query(
    `SELECT ${SAFE_USER_FIELDS}, password_hash
     FROM users
     WHERE email = $1`,
    [email]
  );

  return result.rows[0] || null;
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT ${SAFE_USER_FIELDS}
     FROM users
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
};

const createCustomer = async ({
  name,
  email,
  phone,
  companyName,
  passwordHash,
  country,
  countryCode,
  state,
  district
}) => {
  const result = await pool.query(
    `INSERT INTO users (
       name,
       email,
       phone,
       company_name,
       password_hash,
       country,
       country_code,
       state,
       district,
       role
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'customer')
     RETURNING ${SAFE_USER_FIELDS}`,
    [name, email, phone, companyName, passwordHash, country, countryCode, state, district]
  );

  return result.rows[0];
};

module.exports = {
  toSafeUser,
  findByEmail,
  findById,
  createCustomer
};
