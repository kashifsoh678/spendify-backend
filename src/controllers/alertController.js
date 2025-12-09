const Alert = require("../models/Alert");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiResponse } = require("../utils/ApiResponse");
const { ApiError } = require("../utils/ApiError");
const { generateAllAlerts } = require("../services/alertService");

// @desc    Get All Alerts
// @route   GET /api/alerts
// @access  Private
const getAlerts = asyncHandler(async (req, res) => {
  const { type, severity, isRead, limit = 10 } = req.query;

  // Build query
  const query = { user: req.user.id };

  if (type) query.type = type;
  if (severity) query.severity = severity;
  if (isRead !== undefined) query.isRead = isRead === "true";

  const alerts = await Alert.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

  res
    .status(200)
    .json(new ApiResponse(200, { alerts }, "Alerts retrieved successfully"));
});

// @desc    Mark Single Alert as Read
// @route   PATCH /api/alerts/:id/read
// @access  Private
const markAlertAsRead = asyncHandler(async (req, res) => {
  const alert = await Alert.findOne({
    _id: req.params.id,
    user: req.user.id,
  });

  if (!alert) {
    throw new ApiError(404, "Alert not found");
  }

  alert.isRead = true;
  await alert.save();

  res.status(200).json(new ApiResponse(200, { alert }, "Alert marked as read"));
});

// @desc    Mark All Alerts as Read
// @route   PATCH /api/alerts/read-all
// @access  Private
const markAllAlertsAsRead = asyncHandler(async (req, res) => {
  const result = await Alert.updateMany(
    { user: req.user.id, isRead: false },
    { isRead: true }
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { modifiedCount: result.modifiedCount },
        "All alerts marked as read"
      )
    );
});

// @desc    Generate Alerts (Trigger alert generation)
// @route   POST /api/alerts/generate
// @access  Private
const triggerAlertGeneration = asyncHandler(async (req, res) => {
  await generateAllAlerts(req.user.id);

  res
    .status(200)
    .json(new ApiResponse(200, {}, "Alerts generated successfully"));
});

module.exports = {
  getAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  triggerAlertGeneration,
};
