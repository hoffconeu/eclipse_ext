#!/usr/bin/env node
// Run from the root-owned /opt/oje-private-chat copy, never from a writable checkout.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifyIdentityToken } from './siwc-login.mjs';

const directory = '/var/lib/oje-private-chat';
const target = path.join(directory, 'credentials.json');
const hostFile = path.join(directory, 'host.json');
const source = process.argv[2];

async function readFileLimited(file, minimum = 100) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size > 65536 || stat.size < minimum) throw new Error('Ungueltige Datei');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function main() {
  if (process.getuid?.() !== 0) throw new Error('Import muss als root ausgefuehrt werden');
  if (!source || source.startsWith('-')) throw new Error('Aufruf: sudo node /opt/oje-private-chat/import-siwc.mjs /pfad/credentials.json');
  const file = path.resolve(source);
  if (file.startsWith(`${directory}/`) || file === target) throw new Error('Quelldatei muss ausserhalb des Dienstverzeichnisses liegen');
  const sourceDirectory = await fs.stat(path.dirname(file));
  if (!sourceDirectory.isDirectory() || (sourceDirectory.mode & 0o077)) throw new Error('Transferverzeichnis muss privat sein (0700)');
  const c = await readFileLimited(file);
  if (typeof c.client_id !== 'string' || !/^[A-Za-z0-9._-]{8,128}$/.test(c.client_id) || c.client_id === 'dynamic_agent_client' || typeof c.id_token !== 'string' || typeof c.access_token !== 'string' || typeof c.refresh_token !== 'string' || typeof c.nonce !== 'string' || !Array.isArray(c.scopes) || !c.scopes.includes('chatgpt.tokens.use.direct') || !Number.isFinite(Number(c.expires_in)) || !Number.isFinite(Date.parse(c.saved_at))) {
    throw new Error('Unvollstaendige oder nicht freigegebene ChatGPT-Verbindung');
  }
  const response = await fetch('https://auth.openai.com/.well-known/jwks.json', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('OpenAI-Signaturschluessel nicht erreichbar');
  const identity = verifyIdentityToken(c.id_token, await response.json(), c.client_id, c.nonce);
  if (identity.sub !== c.subject || identity.iss !== c.issuer) throw new Error('Identitaet stimmt nicht mit der Datei ueberein');
  const directoryStat = await fs.stat(directory);
  if (!directoryStat.isDirectory() || (directoryStat.mode & 0o077)) throw new Error('Dienstverzeichnis ist nicht privat');
  let host;
  try { host = await readFileLimited(hostFile, 30); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    host = { ext_agent_host_id: `urn:uuid:${randomUUID()}` };
    await fs.writeFile(hostFile, JSON.stringify(host), { mode: 0o600, flag: 'wx' });
    await fs.chown(hostFile, directoryStat.uid, directoryStat.gid);
  }
  if (typeof host.ext_agent_host_id !== 'string' || !host.ext_agent_host_id.startsWith('urn:uuid:')) throw new Error('Ungueltige VM-Host-ID');
  const record = { ...c, ext_agent_host_id: host.ext_agent_host_id };
  const temp = path.join(directory, `.credentials.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(record), { mode: 0o600, flag: 'wx' });
    await fs.chown(temp, directoryStat.uid, directoryStat.gid);
    await fs.rename(temp, target);
  } finally { await fs.rm(temp, { force: true }); }
  await fs.unlink(file);
  console.log('Signierte ChatGPT-Verbindung importiert. Server-Transferkopie entfernt.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
