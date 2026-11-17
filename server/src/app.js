
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const healthRoutes = require("./routes/healthRoutes");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const purchaseOrderRoutes = require("./routes/purchaseOrderRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");

const app = express();

// Security headers
app.use(helmet());

// Allow our React frontend to communicate
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173"
  })
);

// Parse incoming JSON request bodies
app.use(express.json());

// API routes
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/inventory", inventoryRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found"
  });
});

// Keep unexpected failures as JSON, without stack traces or secrets
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body"
    });
  }

  console.error("Unhandled API error");
  return res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

module.exports = app;
