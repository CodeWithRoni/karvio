// Used after Capacitor creates its platform projects; idempotent on repeated prepares.
export function androidCameraManifest(xml) {
  if (!xml.includes('<application')) throw new Error('Android manifest has no application element');
  const additions = [];
  if (!/android:name=["']android\.permission\.CAMERA["']/.test(xml)) additions.push('    <uses-permission android:name="android.permission.CAMERA" />');
  if (!/android:name=["']android\.hardware\.camera\.any["']/.test(xml)) additions.push('    <uses-feature android:name="android.hardware.camera.any" android:required="false" />');
  return additions.length ? xml.replace(/\s*<application/, '\n' + additions.join('\n') + '\n\n    <application') : xml;
}
export function iosCameraPlist(xml) {
  if (xml.includes('<key>NSCameraUsageDescription</key>')) return xml;
  const i=xml.lastIndexOf('</dict>');if(i<0)throw new Error('iOS Info.plist has no dictionary');
  return xml.slice(0,i)+'\t<key>NSCameraUsageDescription</key>\n\t<string>Scan product barcodes and serial numbers in Karvio. No photo is saved or uploaded.</string>\n'+xml.slice(i);
}
