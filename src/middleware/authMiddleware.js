const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      const parts = req.headers.authorization.split(" ");
      if (parts.length === 2) {
        token = parts[1];
      } else {
        throw new ApiError(401, "Not authorized, token format incorrect");
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        throw new ApiError(401, "Not authorized, user not found");
      }

      next();
    } catch (error) {
      console.error("Auth Middleware Error:===>", error);
      const message = error.message || "Not authorized, token failed";
      throw new ApiError(401, message);
    }
  }

  if (!token) {
    throw new ApiError(401, "Not authorized, no token");
  }
});

module.exports = { protect };
