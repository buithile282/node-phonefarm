const { Sequelize } = require('sequelize');
const osPaths = require('os-paths/cjs');
const path = require('path');
const pathRoot = path.join(osPaths.home(), ".gemFamer");
// Tạo kết nối với SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(pathRoot, 'db.db'),
    username: "gemlogin",
    password: "dKlM@4r%",
   // logging: false
  });
module.exports = sequelize;
