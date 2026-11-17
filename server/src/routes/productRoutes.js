const express = require("express");

const productController = require("../controllers/productController");
const inventoryController = require("../controllers/inventoryController");
const authenticate = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/", productController.listProducts);
router.get("/:id/related", productController.getRelatedProducts);
router.get("/:id", productController.getProduct);
router.post("/", authenticate, authorize("admin"), productController.createProduct);
router.put("/:id", authenticate, authorize("admin"), productController.updateProduct);
router.patch("/:id/status", authenticate, authorize("admin"), productController.updateProductStatus);
router.patch("/:id/stock", authenticate, authorize("admin"), inventoryController.adjustStock);
router.delete("/:id", authenticate, authorize("admin"), productController.deleteProduct);

module.exports = router;
