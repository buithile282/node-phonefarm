const crypto = require('crypto');
const si = require('systeminformation');
var md5 = require('md5');
const { appVersion } = require('./defineLocation');

// Giữ nguyên getIdDevice
module.exports.getIdDevice = async () => {
    let cpu = await getCpucore() + await getSystem();
    return md5(cpu).toUpperCase();
};

function getCpucore() {
    return new Promise((resolve) => {
        si.cpu(cb => {
            resolve(cb.cores + cb.model);
        });
    });
}

function getSystem() {
    return new Promise((resolve) => {
        si.system(cb => {
            resolve(cb.uuid);
        });
    });
}

// ✅ GIẢ LẬP license luôn hợp lệ — bỏ qua fetch & decrypt
module.exports.checkLicense = async (data) => {
    try {
        console.log("[Bypass] License check skipped.");
        return {
            success: true,
            message: "License bypassed successfully.",
            data: {
                expired: false,
                license_type: "lifetime",
                user: "local_bypass",
                device: data?.deviceId || "UNKNOWN",
                version: appVersion?.version || "1.0.0"
            }
        };
    } catch (error) {
        console.log(error);
        return { success: false, message: "Bypass error" };
    }
};
