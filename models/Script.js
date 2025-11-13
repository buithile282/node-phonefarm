const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');
const Scripts = sequelize.define('apps', {
    id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        primaryKey: true
    },
    user_id: DataTypes.STRING,
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
    version: DataTypes.TEXT,
    script: DataTypes.TEXT,
    table: DataTypes.TEXT,
    input: DataTypes.TEXT,
    enabale_input: DataTypes.TEXT,
    metadata: DataTypes.TEXT,
    expired_at: DataTypes.TEXT,
    type: DataTypes.TEXT,
});
module.exports=Scripts;
