const express = require("express");

const inventoryController = require("../controllers/inventoryController");
const authenticate = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/movements", authenticate, authorize("admin"), inventoryController.listMovements);
router.get("/", authenticate, authorize("admin"), inventoryController.getInventory);

module.exports = router;
