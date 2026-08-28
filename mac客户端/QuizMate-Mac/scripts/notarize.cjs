'use strict';

const { notarize } = require('@electron/notarize');

exports.default = async function notarizeQuizMate(context) {
  if (process.platform !== 'darwin') return;
  if (process.env.MAC_NOTARIZE !== 'true') {
    console.warn('[notarize] skipped: isolated test build, not eligible for production');
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    throw new Error('Production notarization requires APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID');
  }

  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  await notarize({
    appBundleId: 'vip.quizmate.mac',
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
};
