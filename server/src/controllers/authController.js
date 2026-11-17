const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { isValidPhoneNumber } = require("libphonenumber-js");
const {
  getCountryByCode,
  getSubdivisions,
  getSubdivisionChildren
} = require("world-country-state-district");

const userModel = require("../models/userModel");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 10;

const sendError = (res, status, message) => {
  return res.status(status).json({
    success: false,
    message
  });
};

const readText = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const sameName = (left, right) => left.toLowerCase() === right.toLowerCase();

const validateRegistration = (body) => {
  const name = readText(body.name);
  const email = readText(body.email).toLowerCase();
  const companyName = readText(body.company_name);
  const countryName = readText(body.country);
  const countryCode = readText(body.country_code).toUpperCase();
  const stateName = readText(body.state);
  const districtName = body.district === undefined || body.district === null || body.district === ""
    ? null
    : readText(body.district);
  const password = typeof body.password === "string" ? body.password : "";

  if (typeof body.phone !== "string") {
    return { error: "Phone must be text" };
  }

  const phone = body.phone.trim();

  if (!name || !email || !password || !phone || !companyName) {
    return { error: "Name, email, password, phone, and company name are required" };
  }

  if (name.length > 100) {
    return { error: "Name must be 100 characters or fewer" };
  }

  if (email.length > 150 || !EMAIL_PATTERN.test(email)) {
    return { error: "A valid email address is required" };
  }

  if (companyName.length > 150) {
    return { error: "Company name must be 150 characters or fewer" };
  }

  if (!countryName || countryName.length > 100 || !/^[A-Z]{2}$/.test(countryCode)) {
    return { error: "A valid country is required" };
  }

  const country = getCountryByCode(countryCode);

  if (!country || !sameName(country.name, countryName)) {
    return { error: "A valid country is required" };
  }

  if (!stateName || stateName.length > 150) {
    return { error: "A valid state is required" };
  }

  const state = getSubdivisions(country.isoCode).find((item) => sameName(item.name, stateName));

  if (!state) {
    return { error: "State is not valid for the selected country" };
  }

  const districts = getSubdivisionChildren(country.isoCode, state.name);
  let district = null;

  if (districts.length > 0) {
    if (!districtName || districtName.length > 150) {
      return { error: "A valid district is required" };
    }

    const match = districts.find((item) => sameName(item.name, districtName));

    if (!match) {
      return { error: "District is not valid for the selected state" };
    }

    district = match.name;
  } else if (districtName) {
    return { error: "District is not valid for the selected state" };
  }

  if (phone.length > 20 || !phone.startsWith(country.phoneCode) || !/^\+\d+$/.test(phone)) {
    return { error: "A valid mobile number is required" };
  }

  if (!isValidPhoneNumber(phone, country.isoCode)) {
    return { error: "A valid mobile number is required" };
  }

  if (password.length < 8 || password.length > 72) {
    return { error: "Password must be between 8 and 72 characters" };
  }

  return {
    value: {
      name,
      email,
      phone,
      companyName,
      country: country.name,
      countryCode: country.isoCode,
      state: state.name,
      district,
      password
    }
  };
};

const validateLogin = (body) => {
  const email = readText(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  return {
    value: {
      email,
      password
    }
  };
};

const register = async (req, res) => {
  try {
    const validation = validateRegistration(req.body || {});

    if (validation.error) {
      return sendError(res, 400, validation.error);
    }

    const { name, email, phone, companyName, country, countryCode, state, district, password } = validation.value;
    const existingUser = await userModel.findByEmail(email);

    if (existingUser) {
      return sendError(res, 409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userModel.createCustomer({
      name,
      email,
      phone,
      companyName,
      passwordHash,
      country,
      countryCode,
      state,
      district
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: {
        user: userModel.toSafeUser(user)
      }
    });
  } catch (error) {
    if (error.code === "23505") {
      return sendError(res, 409, "An account with this email already exists");
    }

    console.error("Registration failed");
    return sendError(res, 500, "Internal server error");
  }
};

const login = async (req, res) => {
  try {
    const validation = validateLogin(req.body || {});

    if (validation.error) {
      return sendError(res, 400, validation.error);
    }

    const { email, password } = validation.value;
    const user = await userModel.findByEmail(email);
    const passwordMatches = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !passwordMatches) {
      return sendError(res, 401, "Invalid email or password");
    }

    if (!user.is_active) {
      return sendError(res, 403, "Account is inactive");
    }

    if (!process.env.JWT_SECRET) {
      console.error("Login failed because JWT_SECRET is not configured");
      return sendError(res, 500, "Internal server error");
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: userModel.toSafeUser(user)
      }
    });
  } catch (error) {
    console.error("Login failed");
    return sendError(res, 500, "Internal server error");
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);

    if (!user) {
      return sendError(res, 401, "Authentication required");
    }

    if (!user.is_active) {
      return sendError(res, 403, "Account is inactive");
    }

    return res.status(200).json({
      success: true,
      data: {
        user: userModel.toSafeUser(user)
      }
    });
  } catch (error) {
    console.error("Profile lookup failed");
    return sendError(res, 500, "Internal server error");
  }
};

module.exports = {
  register,
  login,
  getProfile
};
