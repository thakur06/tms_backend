const express = require('express');
const router = express.Router();
const {seedProjectsFromExcel} = require("../seeds/projectSeedings");
const {seedUsersFromExcel}=require("../seeds/userSeedings");
const {seedTasksFromExcel}=require("../seeds/taskSeedings");
const {seedClientsFromExcel}=require("../seeds/clientSeedings");

router.post("/projects/seed", async (req, res) => {
  try {
    await seedProjectsFromExcel();
    await seedUsersFromExcel();
    await seedTasksFromExcel();
    await seedClientsFromExcel();
    res.json({ message: "✅ Projects seeded successfully" });
  } catch (err) {
    res.status(500).json({ message: "❌ Seeding failed" });
  }
});

module.exports = router;
