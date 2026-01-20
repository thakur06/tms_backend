const { seedUsersFromExcel } = require("./userSeedings");
const { seedClientsFromExcel } = require("./clientSeedings");
const { seedProjectsFromExcel } = require("./projectSeedings");
const { seedTasksFromExcel } = require("./taskSeedings");
const { seedManagersFromExcel } = require("./managerSeedings");

module.exports = {
  seedUsersFromExcel,
  seedClientsFromExcel,
  seedProjectsFromExcel,
  seedTasksFromExcel,
  seedManagersFromExcel
};
