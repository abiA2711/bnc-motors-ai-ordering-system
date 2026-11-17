const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token || !process.env.JWT_SECRET) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.id === undefined || payload.id === null || !payload.role) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }

    req.user = {
      id: payload.id,
      role: payload.role
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
};

const readRequestUser = (req) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ") || !process.env.JWT_SECRET) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.id === undefined || payload.id === null || !payload.role) {
      return null;
    }

    return {
      id: payload.id,
      role: payload.role
    };
  } catch (error) {
    return null;
  }
};

module.exports = authenticate;
module.exports.readRequestUser = readRequestUser;
