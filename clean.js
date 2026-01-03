const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, 'dist');

function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file, index) => {
      const curPath = path.join(directoryPath, file);
      try {
        if (fs.lstatSync(curPath).isDirectory()) {
          deleteFolderRecursive(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      } catch (e) {
        console.warn(`Failed to delete ${curPath}: ${e.message}`);
      }
    });
    try {
        fs.rmdirSync(directoryPath);
    } catch (e) {
        console.warn(`Failed to delete dir ${directoryPath}: ${e.message}`);
    }
  }
}

deleteFolderRecursive(distPath);