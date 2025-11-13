function getChannelInitData(code){
    const buffer = Buffer.alloc(4);
    buffer.write(code, 'ascii');
    return buffer;
}
function getBufferData(data) {
    const buffer = Buffer.alloc(data.length);
    buffer.write(data, 'ascii');
    return buffer;
}
function createBuffer(type, channelId, data) {
    const result = Buffer.alloc(5 + (data ? data.byteLength : 0));
    result.writeUInt8(type, 0);
    result.writeUInt32LE(channelId, 1);
    if (data?.byteLength) {
        result.set(Buffer.from(data), 5);
    }
    return result;
}

module.exports={
    getChannelInitData,
    createBuffer,
    getBufferData
}