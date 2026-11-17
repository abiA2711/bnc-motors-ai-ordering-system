const crypto = require("crypto");
const path = require("path");

const express = require("express");
const multer = require("multer");

const purchaseOrderController = require("../controllers/purchaseOrderController");
const purchaseOrderModel = require("../models/purchaseOrderModel");
const authenticate = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

const router = express.Router();
const MAX_FILE_BYTES = 10 * 1024 * 1024;

purchaseOrderModel.ensureUploadDirectory();

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    purchaseOrderModel.ensureUploadDirectory();
    callback(null, purchaseOrderModel.uploadDirectory);
  },
  filename: (req, file, callback) => {
    callback(null, `${crypto.randomBytes(16).toString("hex")}.pdf`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: 1
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const mediaType = typeof file.mimetype === "string" ? file.mimetype.toLowerCase() : "";
    const pdfType = mediaType === "application/pdf" || mediaType === "application/x-pdf";

    if (extension !== ".pdf" || !pdfType) {
      callback(new Error("Only PDF files are allowed"));
      return;
    }

    callback(null, true);
  }
});

const uploadPdf = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        success: false,
        message: "PDF must be 10 MB or smaller"
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: "Only PDF files are allowed"
    });
  });
};

router.post(
  "/upload",
  authenticate,
  authorize("customer"),
  uploadPdf,
  purchaseOrderController.uploadPurchaseOrder
);
router.patch(
  "/:id/items/:itemId/matches",
  authenticate,
  authorize("customer"),
  purchaseOrderController.reviewMatch
);
router.post(
  "/:id/confirm",
  authenticate,
  authorize("customer"),
  purchaseOrderController.confirmPurchaseOrder
);
router.get("/", authenticate, purchaseOrderController.listPurchaseOrders);
router.get("/:id/file", authenticate, purchaseOrderController.downloadPurchaseOrderFile);
router.get("/:id", authenticate, purchaseOrderController.getPurchaseOrder);

module.exports = router;
