const express = require("express");

const dashboardController = require("../controllers/dashboardController");
const authenticate = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/stats", authenticate, authorize("admin"), dashboardController.getStats);

module.exports = router;
