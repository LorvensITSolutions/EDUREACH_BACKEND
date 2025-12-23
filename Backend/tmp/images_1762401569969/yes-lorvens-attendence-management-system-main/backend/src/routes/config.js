const express = require("express");
const { getConfig } = require("../controllers/configController");
const { mobileAccess } = require("../middlewares/auth");

const router = express.Router();

// Public config endpoint (allow mobile access)
router.get("/", mobileAccess(true), getConfig);

module.exports = router;
