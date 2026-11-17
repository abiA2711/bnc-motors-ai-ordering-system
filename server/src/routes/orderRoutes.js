const express = require("express");

const orderController = require("../controllers/orderController");
const authenticate = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", authenticate, authorize("customer"), orderController.createOrder);
router.get("/my", authenticate, authorize("customer"), orderController.listMyOrders);
router.get("/", authenticate, authorize("admin"), orderController.listOrders);
router.get("/:id", authenticate, orderController.getOrder);
router.patch("/:id/status", authenticate, authorize("admin"), orderController.updateStatus);

module.exports = router;
