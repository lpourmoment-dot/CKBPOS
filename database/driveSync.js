const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const Store = require('electron-store');

const store = new Store();
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const FOLDER_NAME = 'CKBPOS_BACKUP';
const DB_FILENAME = 'ckbpos.db';

let oauth2Client = null;
let folderId = null;

function getOAuth2Client() {
  if (oauth2Client) return oauth2Client;

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('credentials.json introuvable. Placez-le dans le dossier racine du projet.');
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;

  oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Charger le token sauvegardé automatiquement
  const savedToken = store.get('google_token');
  if (savedToken) {
    oauth2Client.setCredentials(savedToken);
  }

  return oauth2Client;
}

async function getAuthUrl() {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
}

async function setToken(code) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  store.set('google_token', tokens);
  store.set('drive_connected', true);
}

// FIX: isConnected vérifie uniquement le token dans le store
// oauth2Client peut être null au démarrage mais le token existe déjà
function isConnected() {
  const token = store.get('google_token');
  if (!token) return false;

  // Initialiser le client si pas encore fait (pour les prochains appels)
  try {
    getOAuth2Client();
  } catch(e) {
    return false;
  }

  // Vérifier que le token a les champs essentiels
  return !!(token.access_token || token.refresh_token);
}

function disconnect() {
  oauth2Client = null;
  folderId = null;
  store.delete('google_token');
  store.delete('drive_connected');
}

async function getOrCreateFolder(drive) {
  if (folderId) return folderId;

  const res = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)'
  });

  if (res.data.files.length > 0) {
    folderId = res.data.files[0].id;
    return folderId;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id'
  });

  folderId = folder.data.id;
  return folderId;
}

async function syncDatabase() {
  if (!isConnected()) throw new Error('Non connecté à Google Drive');

  const client = getOAuth2Client();

  // Rafraîchir le token si expiré
  if (client.credentials.expiry_date && client.credentials.expiry_date < Date.now()) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    store.set('google_token', credentials);
  }

  const drive = google.drive({ version: 'v3', auth: client });
  const folId = await getOrCreateFolder(drive);

  const dbPath = path.join(app.getPath('userData'), DB_FILENAME);

  if (!fs.existsSync(dbPath)) {
    throw new Error('Base de données introuvable');
  }

  const existing = await drive.files.list({
    q: `name='${DB_FILENAME}' and '${folId}' in parents and trashed=false`,
    fields: 'files(id, name, modifiedTime)'
  });

  const timestamp = new Date().toISOString();

  if (existing.data.files.length > 0) {
    await drive.files.update({
      fileId: existing.data.files[0].id,
      requestBody: { name: DB_FILENAME, description: `Sync: ${timestamp}` },
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(dbPath)
      }
    });
  } else {
    await drive.files.create({
      requestBody: {
        name: DB_FILENAME,
        parents: [folId],
        description: `Sync: ${timestamp}`
      },
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(dbPath)
      }
    });
  }

  store.set('last_sync', timestamp);
  console.log('✅ Sync Google Drive réussie:', timestamp);
}

module.exports = { getAuthUrl, setToken, isConnected, syncDatabase, disconnect };
