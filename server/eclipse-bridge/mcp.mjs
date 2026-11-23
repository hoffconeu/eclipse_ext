import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { decryptEnvelope, encryptEnvelope, MAX_TEXT } from './protocol.mjs';

const port = Number(process.env.ECLIPSE_BRIDGE_PORT || 8097);
const baseDir = process.env.ECLIPSE_BRIDGE_DATA_DIR || '/var/lib/oje-eclipse-bridge';
const secret = (await readFile(`${baseDir}/local-secret`, 'utf8')).trim();
const recipientKey = await readFile(`${baseDir}/recipient.key`, 'utf8');
const base = `http://127.0.0.1:${port}`;

async function api(path, body) {
  const result = await fetch(`${base}/local/${path}`, {method: body ? 'POST' : 'GET',
    headers: {Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000)});
  if (!result.ok) throw new Error(`Bridge unavailable (${result.status})`);
  return result.json();
}

async function resultFor(id) {
  const result = await api(`result/${id}`);
  if (result.status === 'pending') return {status: 'pending', request_id: id};
  if (result.status !== 'approved') return {status: result.status};
  const plain = decryptEnvelope(result.envelope, recipientKey);
  if (plain.requestId !== id || !['list', 'read', 'problems', 'error'].includes(plain.kind))
    throw new Error('Response did not match request');
  return plain;
}

async function requested(kind, editorId) {
  const created = await api('request', {kind, editorId});
  for (let i = 0; i < 12; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = await resultFor(created.id);
    if (result.status !== 'pending') return result;
  }
  return {status: 'pending', request_id: created.id};
}

const tools = [
  {name: 'eclipse_connection_status', description: 'Prueft, ob in Eclipse eine ausdruecklich freigegebene Lesesitzung aktiv ist.', inputSchema: {type: 'object', properties: {}}},
  {name: 'eclipse_list_open_editors', description: 'Listet aktuell geoeffnete lesbare Texteditoren der freigegebenen Eclipse-Sitzung; uebertraegt keinen Inhalt.', inputSchema: {type: 'object', properties: {}}},
  {name: 'eclipse_read_editor', description: 'Liest genau einen zuvor gelisteten offenen Texteditor, einschliesslich ungespeicherter Aenderungen; maximal 1 MiB.', inputSchema: {type: 'object', properties: {editor_id: {type: 'string'}}, required: ['editor_id']}},
  {name: 'eclipse_read_problems', description: 'Liest Eclipse-Problem-Marker (Fehler, Warnungen, Infos) aus dem Workspace nur nach gesonderter Bestaetigung in Eclipse. Ansichtsfilter werden nicht nachgebildet; maximal 500 Marker und 1 MiB.', inputSchema: {type: 'object', properties: {}}},
  {name: 'eclipse_get_result', description: 'Holt das Ergebnis einer noch laufenden Eclipse-Anfrage anhand ihrer request_id.', inputSchema: {type: 'object', properties: {request_id: {type: 'string'}}, required: ['request_id']}},
  {name: 'eclipse_show_proposal', description: 'Sendet einen Ende-zu-Ende-verschluesselten Textvorschlag fuer einen zuvor gelesenen Editor an Eclipse. Uebernahme in den Editorpuffer nur nach lokalem Klick und Bestaetigung; keine SAP-Speicherung.', inputSchema: {type: 'object', properties: {editor_id: {type: 'string'}, base_sha256: {type: 'string'}, proposed_text: {type: 'string'}, summary: {type: 'string'}}, required: ['editor_id', 'base_sha256', 'proposed_text']}},
  {name: 'eclipse_open_adt_link', description: 'Bietet Eclipse einen Ende-zu-Ende-verschluesselten ADT-Objektlink zum Oeffnen an. Oeffnen nur nach lokaler Bestaetigung; kein Quelltext wird dadurch an Codex uebertragen.', inputSchema: {type: 'object', properties: {adt_link: {type: 'string'}}, required: ['adt_link']}},
];

function validAdtLink(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s<>"'\\]/.test(value)
    || !/^adt:\/\/[A-Za-z0-9._-]{1,128}\/sap\/bc\/adt\//.test(value)) return false;
  try {
    const link = new URL(value);
    return link.protocol === 'adt:' && !link.username && !link.password && !link.port
      && link.pathname.startsWith('/sap/bc/adt/') && !link.pathname.split('/').includes('..');
  } catch { return false; }
}

async function tool(name, args) {
  switch (name) {
    case 'eclipse_connection_status': return api('status');
    case 'eclipse_list_open_editors': return requested('list');
    case 'eclipse_read_editor':
      if (!/^[a-f0-9]{32}$/.test(args.editor_id || '')) throw new Error('Invalid editor id');
      return requested('read', args.editor_id);
    case 'eclipse_read_problems': return requested('problems');
    case 'eclipse_open_adt_link': {
      if (!validAdtLink(args.adt_link)) throw new Error('Invalid ADT link');
      const key = await api('proposal-key');
      if (!/^[A-Za-z0-9_-]{24}$/.test(key.sessionId || '')) throw new Error('Invalid session');
      const id = randomUUID();
      const plain = [id, 'OPEN_ADT_LINK', String(Date.now()),
        Buffer.from(args.adt_link, 'utf8').toString('base64')].join('\n');
      const envelope = encryptEnvelope(plain, key.publicKey);
      return api('open-link', {id, sessionId: key.sessionId, envelope});
    }
    case 'eclipse_get_result':
      if (!/^[a-f0-9-]{36}$/.test(args.request_id || '')) throw new Error('Invalid request id');
      return resultFor(args.request_id);
    case 'eclipse_show_proposal': {
      if (!/^[a-f0-9]{32}$/.test(args.editor_id || '') || !/^[a-f0-9]{64}$/.test(args.base_sha256 || '')
        || typeof args.proposed_text !== 'string' || typeof args.summary !== 'string' && args.summary !== undefined
        || (args.summary || '').length > 500) throw new Error('Invalid proposal');
      const key = await api('proposal-key');
      if (!/^[A-Za-z0-9_-]{24}$/.test(key.sessionId || '')) throw new Error('Invalid session');
      const id = randomUUID();
      const plain = [id, args.editor_id, args.base_sha256, String(Date.now()),
        Buffer.from(args.summary || '', 'utf8').toString('base64'),
        Buffer.from(args.proposed_text, 'utf8').toString('base64')].join('\n');
      if (Buffer.byteLength(plain, 'utf8') > MAX_TEXT) throw new Error('Proposal too large');
      const envelope = encryptEnvelope(plain, key.publicKey);
      return api('proposal', {id, sessionId: key.sessionId, envelope});
    }
    default: throw new Error('Unknown tool');
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  if (buffer.length > 1_000_000) { buffer = ''; return; }
  for (;;) {
    const end = buffer.indexOf('\n');
    if (end < 0) break;
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); }
    catch { continue; }
    (async () => {
      if (!Object.hasOwn(message, 'id')) return;
      let result;
      if (message.method === 'initialize') result = {protocolVersion: '2025-03-26',
        capabilities: {tools: {}}, serverInfo: {name: 'oje-eclipse-bridge', version: '1.0.0'}};
      else if (message.method === 'tools/list') result = {tools};
      else if (message.method === 'tools/call') {
        try {
          const value = await tool(message.params?.name, message.params?.arguments || {});
          result = {content: [{type: 'text', text: JSON.stringify(value)}]};
        } catch (err) {
          result = {isError: true, content: [{type: 'text', text: err.message}]};
        }
      } else throw new Error('Method not found');
      process.stdout.write(`${JSON.stringify({jsonrpc: '2.0', id: message.id, result})}\n`);
    })().catch(err => process.stdout.write(`${JSON.stringify({jsonrpc: '2.0', id: message.id,
      error: {code: -32603, message: err.message}})}\n`));
  }
});
