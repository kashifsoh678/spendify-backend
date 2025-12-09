const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const connectDB = require("./src/config/db");

// Route files
const authRoutes = require("./src/routes/authRoutes");
const transactionRoutes = require("./src/routes/transactionRoutes");
const budgetRoutes = require("./src/routes/budgetRoutes");
const billRoutes = require("./src/routes/billRoutes");
const aiRoutes = require("./src/routes/aiRoutes");
const reportRoutes = require("./src/routes/reportRoutes");
const alertRoutes = require("./src/routes/alertRoutes");
const settingsRoutes = require("./src/routes/settingsRoutes");
const dashboardRoutes = require("./src/routes/dashboardRoutes");

dotenv.config();

connectDB();

const app = express();

app.use(express.json());

const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:3000"], // Allow frontend ports
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet());
app.use("/uploads", express.static("uploads"));

// Custom morgan format for better visibility
morgan.token("timestamp", () => new Date().toLocaleTimeString());
app.use(
  morgan(
    ":timestamp :method :url :status :response-time ms - :res[content-length]"
  )
);

// Mount routers
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/budget", budgetRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api", settingsRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Error Handling Middleware
const { errorHandler } = require("./src/middleware/errorMiddleware");
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
