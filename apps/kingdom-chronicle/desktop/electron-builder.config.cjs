const path = require('node:path');
const lab = process.env.KINGDOM_RELEASE_LAB === '1';
module.exports = {
  appId: lab ? 'com.kingdomchronicle.UpdateLab' : 'com.squirrel.KingdomChronicle.KingdomChronicle',
  productName: lab ? 'Kingdom Chronicle Update Lab' : 'Kingdom Chronicle',
  executableName: lab ? 'KingdomChronicleLab' : 'KingdomChronicle',
  asar: true,
  compression: 'normal',
  electronVersion: '42.7.0',
  electronDist: path.dirname(require('electron')),
  electronLanguages: ['en-US'],
  npmRebuild: false,
  extraResources: lab ? [] : [{ from: 'scripts/Finalize-LegacyMigration.ps1', to: 'Finalize-LegacyMigration.ps1' }],
  directories: { output: 'release' },
  files: ['.vite/**/*', 'assets/kingdom-chronicle.ico', 'package.json', '!**/*.map', '!**/.env*'],
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'assets/kingdom-chronicle.ico',
    artifactName: `${lab ? 'KingdomChronicleLab' : 'KingdomChronicle'}-\${version}-Setup.exe`,
    signAndEditExecutable: true },
  nsis: { oneClick: true, perMachine: false, allowElevation: false,
    differentialPackage: true, deleteAppDataOnUninstall: false,
    runAfterFinish: true, createDesktopShortcut: 'always', createStartMenuShortcut: true,
    include: lab ? undefined : path.join(__dirname, 'scripts/installer.nsh') },
  publish: { provider: 'generic', url: lab ? 'http://127.0.0.1:5195/stable' :
    'https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-updates/stable', useMultipleRangeRequest: false },
};
