import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const env = await loadEnvFile(path.join(root, '.env.local'));
const facebookAppId = env.FACEBOOK_APP_ID || env.META_APP_ID || process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || '';

const dist = path.join(root, 'dist');
const landingSource = path.join(root, 'index.html');
const dashboardSource = path.join(root, 'preview.html');
const landingTarget = path.join(dist, 'index.html');
const dashboardTarget = path.join(dist, 'dashboard', 'index.html');
const previewTarget = path.join(dist, 'preview.html');
const runtimeConfigTarget = path.join(dist, 'runtime-config.js');
const sourceDir = path.join(root, 'src');
const targetSourceDir = path.join(dist, 'src');
const assetsDir = path.join(root, 'assets');
const targetAssetsDir = path.join(dist, 'assets');
const staticPages = [
  ['privacy.html', 'privacy.html'],
  ['data-deletion.html', 'data-deletion.html'],
];

await fs.mkdir(dist, { recursive: true });
await fs.mkdir(path.dirname(dashboardTarget), { recursive: true });
await fs.writeFile(landingTarget, await fs.readFile(landingSource, 'utf8'));
const dashboardHtml = await fs.readFile(dashboardSource, 'utf8');
await fs.writeFile(dashboardTarget, dashboardHtml);
await fs.writeFile(previewTarget, dashboardHtml);
await copyDirectory(sourceDir, targetSourceDir);
await copyDirectory(assetsDir, targetAssetsDir).catch((error) => {
  if (error?.code !== 'ENOENT') throw error;
});
await copyStaticPages();

const runtimeConfig = `window.__AURAFLOW_CONFIG__ = {
  supabaseUrl: ${JSON.stringify(env.SUPABASE_URL || process.env.SUPABASE_URL || '')},
  supabaseAnonKey: ${JSON.stringify(env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '')},
  supabaseSchema: ${JSON.stringify(env.SUPABASE_SCHEMA || process.env.SUPABASE_SCHEMA || 'public')},
  supabaseTables: {},
  nangoBaseUrl: ${JSON.stringify(env.NANGO_BASE_URL || process.env.NANGO_BASE_URL || '')},
  nangoConnectUrl: ${JSON.stringify(env.NANGO_CONNECT_URL || process.env.NANGO_CONNECT_URL || '')},
  twilioVoiceSdkUrl: ${JSON.stringify(env.TWILIO_VOICE_SDK_URL || process.env.TWILIO_VOICE_SDK_URL || '')},
  auraflowVoiceBaseUrl: ${JSON.stringify(env.AURAFLOW_PUBLIC_BASE_URL || process.env.AURAFLOW_PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || env.URL || process.env.URL || '')},
  auraflowMediaStreamWssUrl: ${JSON.stringify(env.TWILIO_MEDIA_STREAM_WSS_URL || process.env.TWILIO_MEDIA_STREAM_WSS_URL || env.AURAFLOW_MEDIA_STREAM_WSS_URL || process.env.AURAFLOW_MEDIA_STREAM_WSS_URL || '')}
};
`;
await fs.writeFile(runtimeConfigTarget, runtimeConfig);

console.log('Synced landing + dashboard HTML, copied src/assets, and generated dist/runtime-config.js');

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return parseEnv(text);
  } catch {
    return {};
  }
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function copyDirectory(sourcePath, destinationPath) {
  await fs.mkdir(destinationPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const sourceEntry = path.join(sourcePath, entry.name);
    const destinationEntry = path.join(destinationPath, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourceEntry, destinationEntry);
      continue;
    }

    await copyFileWithRetry(sourceEntry, destinationEntry);
  }
}

async function copyStaticPages() {
  for (const [sourceName, targetName] of staticPages) {
    const sourcePath = path.join(root, sourceName);
    const targetPath = path.join(dist, targetName);

    try {
      let page = await fs.readFile(sourcePath, 'utf8');
      page = page.replaceAll('__AURAFLOW_FACEBOOK_APP_ID__', facebookAppId);
      await fs.writeFile(targetPath, page);
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
}

async function copyFileWithRetry(sourcePath, destinationPath, attempts = 4) {
  try {
    const fileBuffer = await fs.readFile(sourcePath);
    await fs.writeFile(destinationPath, fileBuffer);
  } catch (error) {
    if (attempts > 0 && ['UNKNOWN', 'EPERM', 'EBUSY'].includes(error?.code)) {
      await fs.unlink(destinationPath).catch((unlinkError) => {
        if (unlinkError?.code !== 'ENOENT') throw unlinkError;
      });
      await new Promise((resolve) => setTimeout(resolve, 60));
      await copyFileWithRetry(sourcePath, destinationPath, attempts - 1);
      return;
    }
    throw error;
  }
}
