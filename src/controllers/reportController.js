const Transaction = require("../models/Transaction");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");
const PDFDocument = require("pdfkit");
const { Parser } = require("json2csv");

// --- HELPER FUNCTIONS ---

const getMonthDateRange = (monthStr) => {
  // monthStr format: YYYY-MM
  const [year, month] = monthStr.split("-");
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59); // Last day of month
  return { startDate, endDate };
};

// --- CONTROLLERS ---

// @desc    Get Monthly Report JSON Data
// @route   GET /api/reports/monthly?month=YYYY-MM&page=1&limit=10
const getMonthlyReport = asyncHandler(async (req, res) => {
  const { month, page = 1, limit = 10 } = req.query;
  if (!month) throw new ApiError(400, "Month is required (YYYY-MM)");

  const { startDate, endDate } = getMonthDateRange(month);

  // Filter for the specific user and date range
  const matchStage = {
    user: req.user._id,
    date: { $gte: startDate, $lte: endDate },
  };

  // PARALLEL EXECUTION:
  // 1. Aggregation for Stats (Global for Month) - KEEPS SUMMARY CONSISTENT
  // 2. Paginated Query for Transactions List - SUPPORTS FILTERS

  const statsPromise = Transaction.aggregate([
    {
      $match: { user: req.user._id, date: { $gte: startDate, $lte: endDate } },
    },
    {
      $facet: {
        // Total Income/Expense
        totals: [
          {
            $group: {
              _id: null,
              totalIncome: {
                $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] },
              },
              totalExpenses: {
                $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] },
              },
            },
          },
        ],
        // Category Breakdown (Expenses Only)
        categories: [
          { $match: { type: "expense" } },
          { $group: { _id: "$category", amount: { $sum: "$amount" } } },
          { $sort: { amount: -1 } },
        ],
        // Daily Trend (Expenses Only)
        trend: [
          { $match: { type: "expense" } },
          {
            $group: {
              _id: { $dayOfMonth: "$date" },
              amount: { $sum: "$amount" },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  // Build List Query with Filters
  const listQuery = {
    user: req.user.id,
    date: { $gte: startDate, $lte: endDate },
  };

  if (req.query.type) listQuery.type = req.query.type;
  if (req.query.category) listQuery.category = req.query.category;

  // Optional: Search by note or category
  if (req.query.search) {
    const searchRegex = { $regex: req.query.search, $options: "i" };
    listQuery.$or = [{ category: searchRegex }, { note: searchRegex }];
  }

  const listPromise = Transaction.find(listQuery)
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const countPromise = Transaction.countDocuments(listQuery);

  const [statsResult, transactions, totalTransactions] = await Promise.all([
    statsPromise,
    listPromise,
    countPromise,
  ]);

  // --- Process Stats ---
  const stats = statsResult[0];
  const totals = stats.totals[0] || { totalIncome: 0, totalExpenses: 0 };
  const totalIncome = totals.totalIncome;
  const totalExpenses = totals.totalExpenses;
  const savings = totalIncome - totalExpenses;

  // Category Breakdown formatting
  const categoryBreakdown = stats.categories.map((c) => ({
    category: c._id,
    amount: c.amount,
    percentage:
      totalExpenses > 0 ? Math.round((c.amount / totalExpenses) * 100) : 0,
  }));

  const topCategory =
    categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

  // Trend formatting
  const trend = stats.trend.map((t) => ({
    day: t._id,
    amount: t.amount,
  }));

  res.status(200).json(
    new ApiResponse(
      200,
      {
        summary: { totalIncome, totalExpenses, savings, topCategory },
        categoryBreakdown,
        trend,
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalTransactions,
          pages: Math.ceil(totalTransactions / limit),
        },
      },
      "Monthly report generated"
    )
  );
});

// @desc    Export Monthly Report as PDF
// @route   GET /api/reports/monthly/pdf?month=YYYY-MM
const exportReportPDF = asyncHandler(async (req, res) => {
  const { month } = req.query;
  if (!month) throw new ApiError(400, "Month is required (YYYY-MM)");

  const { startDate, endDate } = getMonthDateRange(month);

  const transactions = await Transaction.find({
    user: req.user.id,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });

  // Calculate Totals and Category Breakdown
  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryMap = {};

  transactions.forEach((txn) => {
    if (txn.type === "income") {
      totalIncome += txn.amount;
    } else {
      totalExpenses += txn.amount;
      categoryMap[txn.category] = (categoryMap[txn.category] || 0) + txn.amount;
    }
  });

  const savings = totalIncome - totalExpenses;
  const categoryBreakdown = Object.entries(categoryMap)
    .map(([cat, amt]) => ({ category: cat, amount: amt }))
    .sort((a, b) => b.amount - a.amount);

  // Create PDF with margins
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=spendify-report-${month}.pdf`
  );

  doc.pipe(res);

  // Colors
  const primaryColor = "#4F46E5"; // Indigo
  const successColor = "#10B981"; // Green
  const dangerColor = "#EF4444"; // Red
  const grayColor = "#6B7280";
  const lightGray = "#F3F4F6";

  // === HEADER ===
  doc
    .fillColor(primaryColor)
    .fontSize(28)
    .font("Helvetica-Bold")
    .text("SPENDIFY", { align: "center" });

  doc
    .fillColor(grayColor)
    .fontSize(12)
    .font("Helvetica")
    .text("Monthly Financial Report", { align: "center" });

  doc.fontSize(16).fillColor("#111827").text(month, { align: "center" });

  doc.moveDown(2);

  // === SUMMARY CARDS ===
  const cardY = doc.y;
  const cardWidth = 150;
  const cardHeight = 80;
  const cardSpacing = 20;

  // Helper function to draw card
  const drawCard = (x, y, title, value, color) => {
    doc.rect(x, y, cardWidth, cardHeight).fillAndStroke(lightGray, "#E5E7EB");
    doc
      .fillColor(grayColor)
      .fontSize(10)
      .text(title, x + 15, y + 15, { width: cardWidth - 30 });
    doc
      .fillColor(color)
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(value, x + 15, y + 40, { width: cardWidth - 30 });
  };

  drawCard(
    50,
    cardY,
    "Total Income",
    `$${totalIncome.toLocaleString()}`,
    successColor
  );
  drawCard(
    50 + cardWidth + cardSpacing,
    cardY,
    "Total Expenses",
    `$${totalExpenses.toLocaleString()}`,
    dangerColor
  );
  drawCard(
    50 + (cardWidth + cardSpacing) * 2,
    cardY,
    "Net Savings",
    `$${savings.toLocaleString()}`,
    savings >= 0 ? successColor : dangerColor
  );

  // Move cursor below cards
  doc.y = cardY + cardHeight + 40;

  // === CATEGORY BREAKDOWN ===
  if (categoryBreakdown.length > 0) {
    doc.fillColor("#111827").fontSize(14).font("Helvetica-Bold");
    doc.text("Category Breakdown", 50, doc.y);
    doc.moveDown(0.8);

    categoryBreakdown.forEach((cat) => {
      const percentage =
        totalExpenses > 0 ? Math.round((cat.amount / totalExpenses) * 100) : 0;
      doc.fillColor(grayColor).fontSize(10).font("Helvetica");
      doc.text(
        `  ${cat.category}: $${cat.amount.toLocaleString()} (${percentage}%)`,
        50,
        doc.y
      );
      doc.moveDown(0.5);
    });

    doc.moveDown(1.5);
  }

  // === TRANSACTIONS TABLE ===
  doc.fillColor("#111827").fontSize(14).font("Helvetica-Bold");
  doc.text("Transaction History", 50, doc.y);
  doc.moveDown(1);

  if (transactions.length === 0) {
    doc
      .fillColor(grayColor)
      .fontSize(10)
      .font("Helvetica")
      .text("No transactions found for this month.");
  } else {
    // Table Header
    const tableTop = doc.y;
    const colWidths = { date: 85, category: 95, note: 170, amount: 90 };
    let xPos = 50;

    doc.fillColor("#111827").fontSize(9).font("Helvetica-Bold");
    doc.text("Date", xPos, tableTop, { width: colWidths.date });
    xPos += colWidths.date;
    doc.text("Category", xPos, tableTop, { width: colWidths.category });
    xPos += colWidths.category;
    doc.text("Description", xPos, tableTop, { width: colWidths.note });
    xPos += colWidths.note;
    doc.text("Amount", xPos, tableTop, {
      width: colWidths.amount,
      align: "right",
    });

    // Line under header
    doc
      .moveTo(50, tableTop + 15)
      .lineTo(530, tableTop + 15)
      .stroke("#E5E7EB");

    let rowY = tableTop + 25;

    transactions.forEach((txn, index) => {
      // Check if we need a new page (leave space for footer)
      if (rowY > 680) {
        doc.addPage({ margin: 50 });
        rowY = 50;

        // Redraw table header on new page
        const newTableTop = rowY;
        xPos = 50;
        doc.fillColor("#111827").fontSize(9).font("Helvetica-Bold");
        doc.text("Date", xPos, newTableTop, { width: colWidths.date });
        xPos += colWidths.date;
        doc.text("Category", xPos, newTableTop, { width: colWidths.category });
        xPos += colWidths.category;
        doc.text("Description", xPos, newTableTop, { width: colWidths.note });
        xPos += colWidths.note;
        doc.text("Amount", xPos, newTableTop, {
          width: colWidths.amount,
          align: "right",
        });
        doc
          .moveTo(50, newTableTop + 15)
          .lineTo(530, newTableTop + 15)
          .stroke("#E5E7EB");
        rowY = newTableTop + 25;
      }

      const dateStr = new Date(txn.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const amountStr =
        txn.type === "income"
          ? `+$${txn.amount.toLocaleString()}`
          : `-$${txn.amount.toLocaleString()}`;
      const amountColor = txn.type === "income" ? successColor : dangerColor;

      xPos = 50;
      doc.fillColor(grayColor).fontSize(8).font("Helvetica");
      doc.text(dateStr, xPos, rowY, { width: colWidths.date });
      xPos += colWidths.date;
      doc.text(txn.category, xPos, rowY, { width: colWidths.category });
      xPos += colWidths.category;
      doc.text(txn.note || "-", xPos, rowY, {
        width: colWidths.note,
        ellipsis: true,
      });
      xPos += colWidths.note;
      doc
        .fillColor(amountColor)
        .font("Helvetica-Bold")
        .text(amountStr, xPos, rowY, {
          width: colWidths.amount,
          align: "right",
        });

      rowY += 18;

      // Subtle separator line
      if (index < transactions.length - 1) {
        doc
          .moveTo(50, rowY - 4)
          .lineTo(530, rowY - 4)
          .stroke("#F9FAFB");
      }
    });
  }

  // === FOOTER === (Only add to existing pages, don't create new ones)
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 50;
    doc
      .fillColor(grayColor)
      .fontSize(8)
      .font("Helvetica")
      .text(
        `Generated on ${new Date().toLocaleDateString()} | Page ${i + 1} of ${
          pages.count
        }`,
        50,
        bottom,
        { align: "center", width: doc.page.width - 100 }
      );
  }

  doc.end();
});

// @desc    Export Monthly Report as CSV
// @route   GET /api/reports/monthly/csv?month=YYYY-MM
const exportReportCSV = asyncHandler(async (req, res) => {
  const { month } = req.query;
  if (!month) throw new ApiError(400, "Month is required (YYYY-MM)");

  const { startDate, endDate } = getMonthDateRange(month);
  const transactions = await Transaction.find({
    user: req.user.id,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: -1 });

  const fields = ["date", "type", "category", "amount", "note"];
  const opts = { fields };

  const data = transactions.map((t) => ({
    date: new Date(t.date).toLocaleDateString(),
    type: t.type,
    category: t.category,
    amount: t.amount,
    note: t.note || "",
  }));

  const parser = new Parser(opts);
  const csv = parser.parse(data);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=report-${month}.csv`
  );

  res.status(200).send(csv);
});

module.exports = {
  getMonthlyReport,
  exportReportPDF,
  exportReportCSV,
};
