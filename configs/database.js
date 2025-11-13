const { Sequelize } = require('sequelize');
const osPaths = require('os-paths/cjs');
const pathRoot = osPaths.home() + "\\.gemFamer";
// Tạo kết nối với SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage:  pathRoot+'\\db.db',
    username: "gemlogin",
    password: "dKlM@4r%",
   // logging: false
  });
module.exports = sequelize;
