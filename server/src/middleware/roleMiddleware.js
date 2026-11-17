const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    const role = req.user && req.user.role;

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to perform this action"
      });
    }

    return next();
  };
};

module.exports = authorize;
