const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');


// Định nghĩa model Device
const Device = sequelize.define('devices', {
    id: {
        type: DataTypes.INTEGER,  // Sử dụng INTEGER cho id tự động tăng
        autoIncrement: true,     // Tự động tăng giá trị
        primaryKey: true,        // Đặt là khóa chính
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    manufacturer:{
        type: DataTypes.STRING,
        allowNull: true,
    },
    device_group_id:{
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    resource:{
        type: DataTypes.TEXT,
        allowNull: true,
    },
    proxy:{
        type: DataTypes.TEXT,
        allowNull: true,
    },
    version:{
        type: DataTypes.STRING,
        allowNull: true,
    },
    cpu:{
        type: DataTypes.STRING,
        allowNull: true,
    },
    device_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,  // Đảm bảo tên thiết bị là duy nhất
    },
    status: {
        type: DataTypes.ENUM('online', 'offline'),
        defaultValue: 'offline',
    },
}, {
    timestamps: true,  // Thêm cột createdAt và updatedAt tự động
});

module.exports = Device;
