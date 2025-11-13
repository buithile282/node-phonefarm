const Downloader = require("nodejs-file-downloader");
var AdmZip = require("adm-zip");
//const fs=require('fs');
module.exports.DownloadFile = async function (url, pathSave, fileName, mainWindow, eventName) {
  // if(fs.existsSync(`${pathSave}\\${fileName}`)){
  //   fs.truncate(`${pathSave}\\${fileName}`,()=>{})
  // }
  const downloader = new Downloader({
    url: url,
    directory: pathSave,
    fileName: fileName,
    cloneFiles: false,
    //  skipExistingFileName:true,
    onError: (err) => { console.log(err) },
    onProgress: function (percentage, chunk, remainingSize) {
      // console.log({percentage:percentage,fileName:fileName})
      if (mainWindow) {
        mainWindow.webContents.send(eventName, { percentage: percentage, fileName: fileName });
      }

      if (percentage * 1 == 100) {
        if (getExtension(fileName) == ".zip") {
          setTimeout(() => {
            const zip = new AdmZip(`${pathSave}\\${fileName}`);
            zip.extractAllTo(pathSave, true);
            // setTimeout(()=>{fs.unlinkSync(`${pathSave}\\${fileName}`)},5000) 
          }, 1000)
        }

      }
    },
  });

  try {
    await downloader.download();
  } catch (error) {
    console.log(error)
  }
}
function getExtension(filename) {
  var i = filename.lastIndexOf('.');
  return (i < 0) ? '' : filename.substr(i);
}