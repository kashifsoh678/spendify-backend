const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");
const sendEmail = require("../utils/sendEmail");

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, "Please add all fields");
  }

  // Check if user exists
  const userExists = await User.findOne({ email });

  if (userExists) {
    throw new ApiError(400, "User already exists");
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    // settings and categories will take default values defined in schema
  });

  if (user) {
    res.status(201).json(
      new ApiResponse(
        201,
        {
          _id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          settings: user.settings,
          categories: user.categories,
          token: generateToken(user._id),
        },
        "User registered successfully"
      )
    );
  } else {
    throw new ApiError(400, "Invalid user data");
  }
});

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Please add email and password");
  }

  // Check for user email
  const user = await User.findOne({ email }).select("+password");

  if (user && (await user.matchPassword(password))) {
    res.json(
      new ApiResponse(
        200,
        {
          _id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          settings: user.settings,
          categories: user.categories,
          token: generateToken(user._id),
        },
        "User logged in successfully"
      )
    );
  } else {
    throw new ApiError(401, "Invalid credentials");
  }
});

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = {
    _id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    avatar: req.user.avatar,
    settings: req.user.settings,
    categories: req.user.categories,
  };

  res
    .status(200)
    .json(new ApiResponse(200, user, "User profile fetched successfully"));
});

// @desc    Forgot Password
// @route   POST /api/auth/forgotpassword
// @access  Public
const forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    throw new ApiError(404, "There is no user with that email");
  }

  // Get reset token
  const resetToken = user.getResetPasswordToken();

  await user.save({ validateBeforeSave: false });

  // Create reset URL
  const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

  const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;

  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>You satisfy the reset of a password. Please click the button below to reset your password:</p>
        <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-align: center; text-decoration: none; display: inline-block; border-radius: 4px; font-size: 16px; margin: 20px 0;">Reset Password</a>
        <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">Spendify Inc.</p>
      </div>
    `;

  try {
    await sendEmail({
      email: user.email,
      subject: "Password reset token",
      message, // Fallback plain text
      html, // HTML content
    });

    res.status(200).json(new ApiResponse(200, {}, "Email sent"));
  } catch (error) {
    console.log(error);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save({ validateBeforeSave: false });

    throw new ApiError(500, "Email could not be sent");
  }
});

// @desc    Reset Password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
const resetPassword = asyncHandler(async (req, res, next) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.resettoken)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    throw new ApiError(400, "Invalid token");
  }

  // Set new password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  res.status(200).json(
    new ApiResponse(
      200,
      {
        token: generateToken(user._id),
      },
      "Password updated successfully"
    )
  );
});

module.exports = {
  registerUser,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
};
