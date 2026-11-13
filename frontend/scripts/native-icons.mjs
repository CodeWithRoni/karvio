// Copies the Karvio icon set (branding/) into the generated Capacitor projects.
// Usage: node scripts/native-icons.mjs android | ios
import { cpSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { androidCameraManifest, iosCameraPlist } from './native-camera.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const which = process.argv[2];

if (which === 'android') {
  const res = join(root, 'android/app/src/main/res');
  if (!existsSync(res)) throw new Error('Run "npx cap add android" first');
  cpSync(join(root, 'branding/android/res'), res, { recursive: true, force: true });
  // Show the app name "Karvio" under the launcher icon.
  const strings = join(res, 'values/strings.xml');
  writeFileSync(strings, readFileSync(strings, 'utf8')
    .replace(/<string name="app_name">.*?<\/string>/, '<string name="app_name">Karvio</string>')
    .replace(/<string name="title_activity_main">.*?<\/string>/, '<string name="title_activity_main">Karvio</string>'));
  const manifest = join(root, 'android/app/src/main/AndroidManifest.xml');
  writeFileSync(manifest, androidCameraManifest(readFileSync(manifest, 'utf8')));
  console.log('Android icons, name and optional camera permission set to Karvio');
} else if (which === 'ios') {
  const set = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
  if (!existsSync(join(root, 'ios/App'))) throw new Error('Run "npx cap add ios" first');
  if (!resolve(set).startsWith(resolve(root, 'ios/App') + sep)) throw new Error('Icon target is outside the generated iOS project');
  rmSync(set, { recursive: true, force: true });
  cpSync(join(root, 'branding/ios/AppIcon.appiconset'), set, { recursive: true });
  const plist = join(root, 'ios/App/App/Info.plist');
  writeFileSync(plist, iosCameraPlist(readFileSync(plist, 'utf8')));
  console.log('iOS app icon and camera usage description set to Karvio');
} else {
  console.error('Usage: node scripts/native-icons.mjs android|ios'); process.exit(1);
}
