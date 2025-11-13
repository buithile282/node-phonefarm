const gplay = require('google-play-scraper');
const apkpureCrawler = require('apkpure-crawler');
const path = require('path');
const os = require('os');

async function downloadAPK(appId, version) {
    try {
        const downloadDir = path.join(os.homedir(), 'Downloads');
        const data = await apkpureCrawler.downloadApk(appId, version, downloadDir);

        if (data) {
            console.log('Downloaded APK successfully');
            return { success: true, message: "Downloaded APK successfully", data: data };
        } else {
            throw new Error('Failed to download APK');
        }

    } catch (error) {
        console.error(error.message);
        return { success: false, message: error.message };
    } finally {
        apkpureCrawler.closeBrowser();
    }
}

// Hàm chung để xử lý phân trang
const paginateResults = (res, page, limit) => {
    const totalRecords = res.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const startRecord = (page - 1) * limit;
    const endRecord = startRecord + limit;
    const data = res.slice(startRecord, endRecord);

    return {
        data,
        totalRecords,
        totalPages,
        currentPage: page
    };
};

const listApp = async (page = 1, limit = 10) => {
    try {
        const res = await gplay.list({
            category: gplay.category.APPLICATION,
            collection: gplay.collection.TOP_FREE,
        });
        const paginatedData = paginateResults(res, page, limit);
        console.log(paginatedData);
        return { success: true, message: "Fetched apps successfully", data: paginatedData };
    } catch (error) {
        console.error(error.message);
        return { success: false, message: error.message };
    }
};

const searchApp = async (key, page = 1, limit = 10) => {
    try {
        const res = await gplay.search({
            term: key
        });
        const paginatedData = paginateResults(res, page, limit);
        console.log(paginatedData);
        return { success: true, message: "Search completed successfully", data: paginatedData };
    } catch (error) {
        console.error(error.message);
        return { success: false, message: error.message };
    }
};

module.exports = {
    listApp,
    searchApp,
    downloadAPK
}
