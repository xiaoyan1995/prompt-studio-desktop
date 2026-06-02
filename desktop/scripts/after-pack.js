const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const serverPath = path.join(
    context.appOutDir,
    appName,
    'Contents',
    'Resources',
    'server',
    'prompt-studio-server'
  );

  if (fs.existsSync(serverPath)) {
    fs.chmodSync(serverPath, 0o755);
  }
};
