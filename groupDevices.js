const {  DataTypes } = require('sequelize');

module.exports.groupDevices = function (sequelize) {
    return sequelize.define('device_groups', {
        id: {
            type: DataTypes.INTEGER,
          //  allowNull: true,
            primaryKey: true,
            autoIncrement: true, 
          },
          user_id: DataTypes.STRING,
          name:DataTypes.STRING,
          device_group_metadata: DataTypes.TEXT,
    });
}
