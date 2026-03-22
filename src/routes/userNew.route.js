const express = require("express");
const router = express.Router();
const controller = require("../controllers/userNew.controller");

router.get("/", controller.getAll);

module.exports = router;
