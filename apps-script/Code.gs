const APP_NAME = 'SSG PROGRAM FLOW / TECH GUIDE BUILDER';
const DB_PROPERTY = 'TECH_GUIDE_DATABASE_ID';
const DB_NAME = 'SSG Program Flow - Tech Guide Database';
const MCGI_MEDIA_FOLDER_ID = '1-dy-CEXV13n2ELELv6EccoA9OzfmQykG';
const MCGI_SONG_DB_1_ID = '1gPtWrb5OkKmyGBBTCq4eCifMfydUBTk-tfUf5upYhhQ';
const MCGI_SONG_DB_2_ID = '1vSWuji5isEgbXrDLxtCkI2JQMlmmhXEwECHIQY5_gig';
const MCGI_LYRICS_DB_ID = '1TWuubNOiZNFE0cDTl44ux0xrgc6shHOkAhhG7NbY9po';

const SHEETS = {
  GUIDES: 'GUIDES',
  SECTIONS: 'SECTIONS',
  ITEMS: 'ITEMS',
  GUEST_ACCOUNTS: 'GUEST_ACCOUNTS',
  GUEST_SESSIONS: 'GUEST_SESSIONS',
  LYRICS_LIBRARY: 'LYRICS_LIBRARY',
  MEDIA_LIBRARY: 'MEDIA_LIBRARY',
  SONG_LIBRARY_1: 'MCGI_SONG_LIBRARY_1',
  SONG_LIBRARY_2: 'MCGI_SONG_LIBRARY_2',
  LINEUPS: 'LINEUPS',
  LIVE_SESSIONS: 'LIVE_SESSIONS',
  SSG_ACCOUNTS: 'SSG_ACCOUNTS'
};

const HEADERS = {
  GUIDES: ['Guide ID', 'Title', 'Event Date', 'Organizers Call Time', 'Formal Start', 'Main BGM', 'File Link', 'Guide Type', 'Created At', 'Updated At', 'Venue', 'Owner Username', 'Owner Name', 'Visibility', 'Public Access'],
  SECTIONS: ['Guide ID', 'Section ID', 'Sort Order', 'Section Title', 'Start Time', 'End Time', 'Notes'],
  ITEMS: ['Guide ID', 'Section ID', 'Sort Order', 'Item Number', 'Title', 'Start Time', 'End Time', 'Duration', 'Media / File', 'Media URL', 'Link', 'Participants / Details', 'Notes'],
  GUEST_ACCOUNTS: ['Email', 'First Seen', 'Last Seen', 'Visit Count', 'Status', 'Last Action'],
  GUEST_SESSIONS: ['Token Hash', 'Email', 'Role', 'Created At', 'Last Seen', 'Active', 'Expires Epoch'],
  LYRICS_LIBRARY: ['File ID', 'File Name', 'Folder Path', 'File URL', 'Modified', 'Content', 'Tags'],
  MEDIA_LIBRARY: ['File ID', 'File Name', 'Folder Path', 'File URL', 'Mime Type', 'Modified', 'Indexed At'],
  SONG_LIBRARY_1: ['Song ID', 'Title', 'Link', 'Source Sheet', 'Search Text', 'Synced At'],
  SONG_LIBRARY_2: ['Song ID', 'Title', 'Link', 'Source Sheet', 'Search Text', 'Synced At'],
  LINEUPS: ['Lineup ID', 'Name', 'Owner', 'Created At', 'Updated At', 'Payload JSON'],
  LIVE_SESSIONS: ['Session ID', 'Guide ID', 'Owner', 'Created At', 'Updated At', 'Active', 'Version', 'State JSON'],
  SSG_ACCOUNTS: ['Account ID', 'Name', 'Role / Task', 'Username', 'Password Hash', 'Password Salt', 'Status', 'Created At', 'Last Login']
};

const AUTH_CACHE_PREFIX = 'SSG_PF_SESSION_';
const ACCOUNT_CACHE_PREFIX = 'SSG_PF_ACCOUNT_';
const AUTH_TTL_SECONDS = 21600; // 6 hours
const ACCOUNT_CACHE_SECONDS = 21600; // 6 hours
const DB_READY_PROPERTY = 'TECH_GUIDE_DATABASE_READY_V2';
const OFFICER_CODE_HASH = PropertiesService.getScriptProperties().getProperty('OFFICER_CODE_HASH') || '';

function doGet(e) {
  const mode = (e && e.parameter && e.parameter.mode) || 'main';
  const guideId = (e && e.parameter && e.parameter.guideId) || '';
  const liveSession = (e && e.parameter && e.parameter.liveSession) || '';
  const liveRole = (e && e.parameter && e.parameter.liveRole) || '';
  const liveMode = (e && e.parameter && e.parameter.liveMode) || '';
  const template = HtmlService.createTemplateFromFile('index');
  template.appMode = mode;
  template.initialGuideId = guideId;
  template.appUrl = ScriptApp.getService().getUrl() || '';
  template.liveSession = liveSession;
  template.liveRole = liveRole;
  template.liveMode = liveMode;
  return template.evaluate()
    .setTitle(APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/**
 * HTTP bridge for the GitHub-hosted frontend.
 * Keeps the existing google.script.run API untouched while allowing the
 * static frontend to call this Apps Script deployment through fetch().
 */
function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const request = JSON.parse(raw);
    const method = String(request.method || '').trim();
    const args = Array.isArray(request.args) ? request.args : [];

    const allowedDirect = {
      verifyOfficerCode: true,
      loginSSGAccount: true,
      createSSGAccount: true,
      validateSession: true,
      logoutSession: true
    };

    let result;
    if (method === 'apiCall') {
      result = apiCall(args[0], Array.isArray(args[1]) ? args[1] : [], args[2] || '');
    } else if (allowedDirect[method]) {
      if (method === 'verifyOfficerCode') result = verifyOfficerCode.apply(null, args);
      else if (method === 'loginSSGAccount') result = loginSSGAccount.apply(null, args);
      else if (method === 'createSSGAccount') result = createSSGAccount.apply(null, args);
      else if (method === 'validateSession') result = validateSession.apply(null, args);
      else if (method === 'logoutSession') result = logoutSession.apply(null, args);
      else throw new Error('HTTP_METHOD_NOT_ALLOWED: Unsupported backend method.');
    } else {
      throw new Error('HTTP_METHOD_NOT_ALLOWED: Unsupported backend method.');
    }

    return ContentService
      .createTextOutput(JSON.stringify({ok:true, result:result}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok:false,
        error:{
          message: String(err && err.message ? err.message : err),
          name: String(err && err.name ? err.name : 'Error')
        }
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


/* =========================================================
   AUTHENTICATION / ACCESS CONTROL
========================================================= */

function verifyOfficerCode(code) {
  const key = getAuthClientKey_();
  const attemptsKey = 'SSG_PF_ATTEMPTS_' + key;
  const cache = CacheService.getScriptCache();
  const attempts = Number(cache.get(attemptsKey) || 0);
  if (attempts >= 5) {
    throw new Error('AUTH_LOCKED: Too many incorrect SSG code attempts. Please try again later.');
  }

  const incoming = sha256Hex_(String(code || ''));
  if (!constantTimeEqual_(incoming, OFFICER_CODE_HASH)) {
    cache.put(attemptsKey, String(attempts + 1), 600);
    throw new Error('AUTH_INVALID: Incorrect SSG code.');
  }

  cache.remove(attemptsKey);
  return { success: true, gateway: true, message: 'SSG login access granted.' };
}

function loginSSGAccount(username, password) {
  const name = String(username || '').trim();
  const pass = String(password || '');
  if (!name || !pass) throw new Error('AUTH_INVALID: Enter your name/username and password.');
  const account = findSSGAccountByUsername_(name);
  if (!account) throw new Error('AUTH_INVALID: Account not found. Please sign up first.');
  if (String(account.status || '').toUpperCase() !== 'ACTIVE') throw new Error('AUTH_BLOCKED: This SSG account is not active.');
  const incoming = sha256Hex_(String(account.salt || '') + pass);
  if (!constantTimeEqual_(incoming, String(account.passwordHash || ''))) throw new Error('AUTH_INVALID: Incorrect password.');
  // Do not perform a blocking Last Login sheet write here. Authentication should
  // return first; the persistent session record is the authoritative login event.
  const token = createSession_('account', account.username || account.name || name);
  return { success: true, role: 'account', username: account.username || name, name: account.name || name, task: account.task || '', token: token, message: 'SSG account sign-in successful.' };
}

function createSSGAccount(name, task, password, verifyPassword) {
  const displayName = String(name || '').trim();
  const roleTask = String(task || '').trim();
  const pass = String(password || '');
  const verify = String(verifyPassword || '');
  if (!displayName || !roleTask || !pass || !verify) throw new Error('AUTH_INVALID: Complete all required fields.');
  if (pass !== verify) throw new Error('AUTH_INVALID: Passwords do not match.');
  if (pass.length < 6) throw new Error('AUTH_INVALID: Password must be at least 6 characters.');
  if (displayName.length > 100) throw new Error('AUTH_INVALID: Name is too long.');
  const existing = findSSGAccountByUsername_(displayName);
  if (existing) throw new Error('AUTH_EXISTS: An SSG account with that name/username already exists.');
  const salt = Utilities.getUuid().replace(/-/g, '');
  const hash = sha256Hex_(salt + pass);
  const id = generateId_('ACC');
  const now = timestampNow_();
  getSheet_(SHEETS.SSG_ACCOUNTS).appendRow([id, displayName, roleTask, displayName, hash, salt, 'ACTIVE', now, '']);
  return { success: true, account: {id:id,name:displayName,task:roleTask,username:displayName}, message: 'Your SSG account has been created. You can now sign in.' };
}

function getSSGAccount_(username) {
  const a = findSSGAccountByUsername_(username);
  if (!a) return null;
  return {id:a.id,name:a.name,task:a.task,username:a.username,status:a.status};
}

function findSSGAccountByUsername_(username) {
  const target = String(username || '').trim().toLowerCase();
  if (!target) return null;
  const cache = CacheService.getScriptCache();
  const cacheKey = ACCOUNT_CACHE_PREFIX + sha256Hex_(target).slice(0, 32);
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { cache.remove(cacheKey); }
  }

  const sheet = getFastSheet_(SHEETS.SSG_ACCOUNTS, HEADERS.SSG_ACCOUNTS);
  const values = sheet.getDataRange().getDisplayValues();
  if (!values || values.length < 2) return null;
  const headers = values[0];
  const idx = {};
  headers.forEach(function(h, i) { idx[String(h)] = i; });
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const u = String(row[idx['Username']] || row[idx['Name']] || '').trim().toLowerCase();
    if (u === target) {
      const account = {
        row: i + 1,
        id: String(row[idx['Account ID']] || ''),
        name: String(row[idx['Name']] || ''),
        task: String(row[idx['Role / Task']] || ''),
        username: String(row[idx['Username']] || row[idx['Name']] || ''),
        passwordHash: String(row[idx['Password Hash']] || ''),
        salt: String(row[idx['Password Salt']] || ''),
        status: String(row[idx['Status']] || 'ACTIVE')
      };
      cache.put(cacheKey, JSON.stringify(account), ACCOUNT_CACHE_SECONDS);
      return account;
    }
  }
  return null;
}

function startGuestSession() {
  const email = getActiveUserEmail_();
  if (!email) {
    throw new Error('AUTH_GOOGLE_UNAVAILABLE: Google account could not be identified. Open the web app while signed in to Google, and deploy it for logged-in users rather than anonymous access.');
  }
  const normalized = email.trim().toLowerCase();
  const account = getGuestAccountByEmail_(normalized);
  if (account && String(account.status).toUpperCase() === 'BLOCKED') {
    throw new Error('AUTH_BLOCKED: This Google account is blocked from the Tech Guide Builder.');
  }

  upsertGuestAccount_(normalized);
  const token = createSession_('guest', normalized);
  return { success: true, role: 'guest', email: normalized, token: token, message: 'Guest access granted.' };
}

function validateSession(token) {
  const session = authorizeSession_(token);
  if (session.role === 'account') {
    const account = findSSGAccountByUsername_(session.email);
    if (!account || String(account.status).toUpperCase() !== 'ACTIVE') throw new Error('AUTH_BLOCKED: This SSG account is not active.');
    return { success: true, role: 'account', username: account.username, name: account.name, task: account.task };
  }
  return { success: true, role: session.role, email: session.email };
}

function logoutSession(token) {
  const hash = sha256Hex_(String(token || ''));
  CacheService.getScriptCache().remove(AUTH_CACHE_PREFIX + hash);
  markSessionInactiveByHash_(hash);
  return { success: true };
}

function apiCall(method, args, token) {
  const session = authorizeSession_(token);
  const name = String(method || '').trim();
  const input = Array.isArray(args) ? args : [args];

  const routes = {
    getBootstrap: { fn: 'getBootstrap_', role: 'any' },
    getSSGAccount: { fn: 'getSSGAccount_', role: 'any' },
    getGuides: { fn: 'getGuides_', role: 'any' },
    getGuide: { fn: 'getGuide_', role: 'any' },
    getCPFCTemplate: { fn: 'getCPFCTemplate_', role: 'any' },
    saveGuide: { fn: 'saveGuide_', role: 'any' },
    deleteGuide: { fn: 'deleteGuide_', role: 'any' },
    exportGuide: { fn: 'exportGuide_', role: 'any' },
    searchMcgiMedia: { fn: 'searchMcgiMedia_', role: 'any' },
    searchMcgiSongs: { fn: 'searchMcgiSongs_', role: 'any' },
    getMcgiMediaDuration: { fn: 'getMcgiMediaDuration_', role: 'any' },
    getGuestAccounts: { fn: 'getGuestAccounts_', role: 'officer' },
    signOutGuest: { fn: 'signOutGuest_', role: 'officer' },
    blockGuest: { fn: 'blockGuest_', role: 'officer' },
    unblockGuest: { fn: 'unblockGuest_', role: 'officer' },
    searchMcgiLyrics: { fn: 'searchMcgiLyrics_', role: 'any' },
    getMcgiLyric: { fn: 'getMcgiLyric_', role: 'any' },
    refreshMcgiLyricsLibrary: { fn: 'refreshMcgiLyricsLibrary_', role: 'any' },
    refreshMcgiMediaLibrary: { fn: 'refreshMcgiMediaLibrary_', role: 'any' },
    saveLyricLineup: { fn: 'saveLyricLineup_', role: 'any' },
    getLyricLineups: { fn: 'getLyricLineups_', role: 'any' },
    loadLyricLineup: { fn: 'loadLyricLineup_', role: 'any' },
    deleteLyricLineup: { fn: 'deleteLyricLineup_', role: 'any' },
    createLiveSession: { fn: 'createLiveSession_', role: 'any' },
    joinLiveSession: { fn: 'joinLiveSession_', role: 'any' },
    getLiveSession: { fn: 'getLiveSession_', role: 'any' },
    publishLiveSession: { fn: 'publishLiveSession_', role: 'any' },
    closeLiveSession: { fn: 'closeLiveSession_', role: 'any' }
  };

  const route = routes[name];
  if (!route) throw new Error('AUTH_FORBIDDEN: Unknown or unavailable application function.');
  if (route.role !== 'any' && route.role !== session.role) {
    throw new Error('AUTH_FORBIDDEN: Officer access is required for this action.');
  }

  switch (name) {
    case 'getBootstrap': return getBootstrap_();
    case 'getSSGAccount': return getSSGAccount_(input[0]);
    case 'getGuides': return getGuides_(session);
    case 'getGuide': return getGuide_(input[0], session);
    case 'getCPFCTemplate': return getCPFCTemplate_();
    case 'saveGuide': return saveGuide_(input[0], session);
    case 'deleteGuide': return deleteGuide_(input[0], session);
    case 'exportGuide': return exportGuide_(input[0], session);
    case 'searchMcgiMedia': return searchMcgiMedia_(input[0]);
    case 'searchMcgiSongs': return searchMcgiSongs_(input[0]);
    case 'getMcgiMediaDuration': return getMcgiMediaDuration_(input[0]);
    case 'getGuestAccounts': return getGuestAccounts_();
    case 'signOutGuest': return signOutGuest_(input[0]);
    case 'blockGuest': return blockGuest_(input[0]);
    case 'unblockGuest': return unblockGuest_(input[0]);
    case 'searchMcgiLyrics': return searchMcgiLyrics_(input[0]);
    case 'getMcgiLyric': return getMcgiLyric_(input[0]);
    case 'refreshMcgiLyricsLibrary': return refreshMcgiLyricsLibrary_();
    case 'refreshMcgiMediaLibrary': return refreshMcgiMediaLibrary_();
    case 'saveLyricLineup': return saveLyricLineup_(input[0], session);
    case 'getLyricLineups': return getLyricLineups_();
    case 'loadLyricLineup': return loadLyricLineup_(input[0]);
    case 'deleteLyricLineup': return deleteLyricLineup_(input[0]);
    case 'createLiveSession': return createLiveSession_(input[0], session);
    case 'joinLiveSession': return joinLiveSession_(input[0]);
    case 'getLiveSession': return getLiveSession_(input[0]);
    case 'publishLiveSession': return publishLiveSession_(input[0], input[1]);
    case 'closeLiveSession': return closeLiveSession_(input[0]);
    default: throw new Error('AUTH_FORBIDDEN: Route unavailable.');
  }
}



/* =========================================================
   MCGI LYRIC LIBRARY
   Searches .TXT and .DOCX files recursively under the configured
   Music Department root. Original Drive files are never changed.
========================================================= */
function normalizeLyricText_(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function lyricTags_(name, path, content) {
  const hay = (String(name || '') + ' ' + String(path || '') + ' ' + String(content || '')).toUpperCase();
  const known = ['HINMARIO', 'ORIGINAL', 'ADAPTATION', 'ASOP/F', 'ASOP', 'REVISION', 'ARCHIVED'];
  const out = [];
  known.forEach(function(tag) {
    if (hay.indexOf(tag) !== -1) out.push(tag);
  });
  return out.join(', ');
}

function isLyricLibraryFile_(file) {
  const name = String(file.getName() || '');
  const mime = String(file.getMimeType() || '').toLowerCase();
  return /\.txt$/i.test(name) || /\.docx$/i.test(name) ||
    mime === 'text/plain' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function decodeXmlText_(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#([0-9]+);/g, function(_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractDocxText_(blob) {
  const parts = Utilities.unzip(blob);
  let documentXml = null;
  for (let i = 0; i < parts.length; i++) {
    const name = String(parts[i].getName() || '').replace(/\\/g, '/');
    if (/^word\/document\.xml$/i.test(name) || /\/word\/document\.xml$/i.test(name)) {
      documentXml = parts[i].getDataAsString('UTF-8');
      break;
    }
  }
  if (!documentXml) return '';

  // Reconstruct ordinary Word paragraphs, tabs and explicit line breaks
  // while preserving their original order.
  const chunks = [];
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>|<\/w:p>/gi;
  let m;
  while ((m = re.exec(documentXml)) !== null) {
    const token = m[0];
    if (/^<w:t\b/i.test(token)) chunks.push(decodeXmlText_(m[1]));
    else if (/^<w:tab\b/i.test(token)) chunks.push('\t');
    else chunks.push('\n');
  }
  return normalizeLyricText_(chunks.join(''));
}

function readLyricFileText_(file) {
  const name = String(file.getName() || '');
  const mime = String(file.getMimeType() || '').toLowerCase();
  if (/\.docx$/i.test(name) || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocxText_(file.getBlob());
  }
  return normalizeLyricText_(file.getBlob().getDataAsString('UTF-8'));
}

function collectMcgiLyricFiles_(folder, path, out, seen, depth) {
  if (depth > 40) return;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const id = file.getId();
    if (seen[id] || file.isTrashed()) continue;
    seen[id] = true;
    if (isLyricLibraryFile_(file)) {
      out.push({file:file, path:path || folder.getName()});
    }
  }
  const folders = folder.getFolders();
  while (folders.hasNext()) {
    const child = folders.next();
    collectMcgiLyricFiles_(child, path ? path + ' / ' + child.getName() : child.getName(), out, seen, depth + 1);
  }
}

function normalizeHeaderKey_(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
}
function pickHeaderIndex_(headers, candidates) {
  const norm = headers.map(normalizeHeaderKey_);
  for (const c of candidates) {
    const n = normalizeHeaderKey_(c);
    const exact = norm.indexOf(n);
    if (exact >= 0) return exact;
  }
  for (let i=0;i<norm.length;i++) {
    if (candidates.some(c => norm[i].indexOf(normalizeHeaderKey_(c)) >= 0)) return i;
  }
  return -1;
}
function sheetRowsForIndex_(ss, out, sourceName) {
  ss.getSheets().forEach(function(sh) {
    const values = sh.getDataRange().getDisplayValues();
    if (!values || values.length < 2) return;
    const headers = values[0].map(String);
    const titleIdx = pickHeaderIndex_(headers, ['SONG TITLE','TITLE','NAME','FILE NAME','SONG']);
    const lyricsIdx = pickHeaderIndex_(headers, ['LYRICS','LYRIC','TEXT','CONTENT']);
    const linkIdx = pickHeaderIndex_(headers, ['DRIVE LINK','GOOGLE DRIVE LINK','LINK','URL','DRIVE URL','FILE URL']);
    const idIdx = pickHeaderIndex_(headers, ['ID','LYRIC ID','SONG ID','FILE ID']);
    const metaIdxs = headers.map((h,i)=>i).filter(i=>i!==titleIdx && i!==lyricsIdx && i!==linkIdx && i!==idIdx);
    for (let r=1;r<values.length;r++) {
      const row=values[r];
      const title=titleIdx>=0?String(row[titleIdx]||'').trim():'';
      const lyrics=lyricsIdx>=0?String(row[lyricsIdx]||'').trim():'';
      const link=linkIdx>=0?String(row[linkIdx]||'').trim():'';
      const id=idIdx>=0?String(row[idIdx]||'').trim():'';
      const all=row.map(v=>String(v||'').trim()).filter(Boolean).join(' | ');
      if (!title && !lyrics && !link && !all) continue;
      // Avoid indexing obvious chunk-only rows when there is no title/id; chunks are handled separately below.
      if (!title && !id && lyricsIdx>=0 && /chunk/i.test(sh.getName())) continue;
      out.push({id:id || (sourceName+'-'+sh.getSheetId()+'-'+(r+1)),title:title || id || 'Untitled Song',link:link,sourceSheet:sourceName+' / '+sh.getName(),searchText:(title+' '+all).toLowerCase()});
    }
  });
}
function writeExternalIndex_(targetSheet, rows) {
  targetSheet.clearContents();
  targetSheet.getRange(1,1,1,6).setValues([HEADERS.SONG_LIBRARY_1]);
  if (!rows.length) return;
  const now=timestampNow_();
  const vals=rows.map(r=>[r.id,r.title,r.link,r.sourceSheet,r.searchText,now]);
  targetSheet.getRange(2,1,vals.length,6).setValues(vals);
  targetSheet.setFrozenRows(1);
}
function syncMcgiSongLibrary_(dbId, sheetName, headerSet) {
  const target=getFastSheet_(sheetName, headerSet);
  const ss=SpreadsheetApp.openById(dbId);
  const rows=[];
  sheetRowsForIndex_(ss,rows,String(dbId));
  writeExternalIndex_(target,rows);
  return rows.length;
}
function refreshMcgiSongLibraries_() {
  const n1=syncMcgiSongLibrary_(MCGI_SONG_DB_1_ID,SHEETS.SONG_LIBRARY_1,HEADERS.SONG_LIBRARY_1);
  const n2=syncMcgiSongLibrary_(MCGI_SONG_DB_2_ID,SHEETS.SONG_LIBRARY_2,HEADERS.SONG_LIBRARY_2);
  PropertiesService.getScriptProperties().setProperty('SSG_MCGI_SONG_SYNC_AT',String(Date.now()));
  return {success:true,library1:n1,library2:n2};
}
function searchMcgiSongs_(query) {
  const q=String(query||'').trim().toLowerCase();
  if(q.length<2)return [];
  const props=PropertiesService.getScriptProperties();
  const last=Number(props.getProperty('SSG_MCGI_SONG_SYNC_AT')||0);
  // Sync at most every 10 minutes. Normal searches are local-sheet searches and should be fast.
  if(!last || Date.now()-last>600000) {
    try { refreshMcgiSongLibraries_(); } catch(err) { if(!last) throw err; }
  }
  const terms=q.split(/\s+/).filter(Boolean);
  function read(name){
    const sh=getFastSheet_(name,HEADERS.SONG_LIBRARY_1);
    const vals=sh.getDataRange().getDisplayValues();
    if(vals.length<2)return [];
    return vals.slice(1).map(r=>({id:r[0],title:r[1],link:r[2],sourceSheet:r[3],searchText:r[4]})).filter(x=>terms.every(t=>x.searchText.indexOf(t)>=0));
  }
  let results=read(SHEETS.SONG_LIBRARY_1);
  let source='MCGI SONG DATABASE LIBRARY 1';
  // Library 2 is a true fallback: only show it when Library 1 has no matches.
  if(!results.length){results=read(SHEETS.SONG_LIBRARY_2);source='MCGI SONG DATABASE LIBRARY 2';}
  const exact=q;
  results.sort((a,b)=>{
    const score=x=>(String(x.title).toLowerCase()===exact?1000:0)+(String(x.title).toLowerCase().indexOf(exact)>=0?500:0);
    return score(b)-score(a)||String(a.title).localeCompare(String(b.title));
  });
  const seen={};
  return results.filter(r=>{const k=(String(r.title).toLowerCase()+'|'+String(r.link));if(seen[k])return false;seen[k]=1;return true;}).slice(0,25).map(r=>({id:r.id,title:r.title,link:r.link,source:source,sheet:r.sourceSheet}));
}

function refreshMcgiLyricsLibrary_() {
  const target=getSheet_(SHEETS.LYRICS_LIBRARY);
  const source=SpreadsheetApp.openById(MCGI_LYRICS_DB_ID);
  const rows=[];
  source.getSheets().forEach(function(sh){
    const values=sh.getDataRange().getDisplayValues();
    if(values.length<2)return;
    const headers=values[0].map(String);
    const titleIdx=pickHeaderIndex_(headers,['SONG TITLE','TITLE','NAME','FILE NAME','SONG']);
    const lyricsIdx=pickHeaderIndex_(headers,['LYRICS','LYRIC','TEXT','CONTENT']);
    const linkIdx=pickHeaderIndex_(headers,['DRIVE LINK','GOOGLE DRIVE LINK','LINK','URL','DRIVE URL','FILE URL']);
    const idIdx=pickHeaderIndex_(headers,['ID','LYRIC ID','SONG ID','FILE ID']);
    for(let r=1;r<values.length;r++){
      const row=values[r];
      const title=titleIdx>=0?String(row[titleIdx]||'').trim():'';
      const content=lyricsIdx>=0?String(row[lyricsIdx]||'').trim():'';
      const link=linkIdx>=0?String(row[linkIdx]||'').trim():'';
      const id=idIdx>=0?String(row[idIdx]||'').trim():'';
      const all=row.map(v=>String(v||'').trim()).filter(Boolean).join(' | ');
      if(!title&&!content&&!all)continue;
      if(!title&&/chunk/i.test(sh.getName()))continue;
      rows.push([id||('LYRIC-'+sh.getSheetId()+'-'+(r+1)),title||id||'Untitled',String(sh.getName()),link,content,all]);
    }
  });
  target.clearContents();
  target.getRange(1,1,1,7).setValues([HEADERS.LYRICS_LIBRARY]);
  if(rows.length){
    const now=timestampNow_();
    const vals=rows.map(r=>[r[0],r[1],r[2],r[3],now,r[4],r[5]]);
    target.getRange(2,1,vals.length,7).setValues(vals);
    target.setFrozenRows(1);
  }
  PropertiesService.getScriptProperties().setProperty('SSG_MCGI_LYRICS_SYNC_AT',String(Date.now()));
  return {success:true,count:rows.length,message:'MCGI Lyrics Database indexed.'};
}

function lyricSearchRowsFast_(sheet, terms) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const range = sheet.getRange(2, 1, lastRow - 1, HEADERS.LYRICS_LIBRARY.length);
  const rowSets = terms.map(function(term) {
    const found = range.createTextFinder(term).matchCase(false).matchEntireCell(false).useRegularExpression(false).findAll();
    const set = {}; found.forEach(function(cell){ set[cell.getRow()] = true; }); return set;
  });
  const rows=[];
  for(let row=2;row<=lastRow;row++){
    if(rowSets.every(s=>s[row])) rows.push(row);
    if(rows.length>=60)break;
  }
  return rows;
}
function searchMcgiLyrics_(query) {
  const q=String(query||'').trim().toLowerCase();
  if(q.length<2)return [];
  const props=PropertiesService.getScriptProperties();
  const last=Number(props.getProperty('SSG_MCGI_LYRICS_SYNC_AT')||0);
  if(!last || Date.now()-last>600000){
    try{refreshMcgiLyricsLibrary_();}catch(err){if(!last)throw err;}
  }
  const sheet=getSheet_(SHEETS.LYRICS_LIBRARY);
  if(sheet.getLastRow()<2)return [];
  const terms=q.split(/\s+/).filter(Boolean);
  const rows=lyricSearchRowsFast_(sheet,terms);
  if(!rows.length)return [];
  const vals=rows.map(r=>sheet.getRange(r,1,1,7).getDisplayValues()[0]);
  const matches=vals.map(r=>({id:r[0],name:r[1],path:r[2],url:r[3],modified:r[4],content:r[5]||'',tags:'',all:r[6]||''}));
  matches.sort((a,b)=>{const score=x=>String(x.name).toLowerCase()===q?1000:(String(x.name).toLowerCase().indexOf(q)>=0?500:0);return score(b)-score(a)||String(a.name).localeCompare(String(b.name));});
  return matches.slice(0,25).map(r=>{const content=String(r.content||'');const lower=content.toLowerCase();const at=lower.indexOf(q);let snippet=content.replace(/\s+/g,' ').trim();if(at>=0){const st=Math.max(0,at-70),en=Math.min(content.length,at+q.length+120);snippet=content.substring(st,en).replace(/\s+/g,' ').trim();if(st>0)snippet='…'+snippet;if(en<content.length)snippet+='…';}else if(snippet.length>190)snippet=snippet.substring(0,190)+'…';return {id:r.id,name:r.name,path:r.path,url:r.url,modified:r.modified,tags:'',snippet:snippet,content:content,fileType:'DATABASE'};});
}

function getMcgiLyric_(fileId) {
  const id = extractDriveFileId_(fileId);
  if (!id) throw new Error('A valid lyric file ID is required.');
  const sheet = getSheet_(SHEETS.LYRICS_LIBRARY);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length > 1) {
    const headers = values[0];
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || '') === id) {
        const row = {};
        headers.forEach(function(h, j) { row[h] = values[i][j] || ''; });
        return {
          success:true,id:id,name:row['File Name'],path:row['Folder Path'],url:row['File URL'],
          modified:row['Modified'],tags:row['Tags'] || '',content:normalizeLyricText_(row['Content'] || '')
        };
      }
    }
  }

  const file = DriveApp.getFileById(id);
  if (!isLyricLibraryFile_(file)) throw new Error('Selected file is not a supported lyric file. Use TXT or DOCX.');
  const content = readLyricFileText_(file);
  return {
    success:true,id:id,name:file.getName(),path:'',url:'https://drive.google.com/file/d/'+id+'/view',
    modified:Utilities.formatDate(file.getLastUpdated(), Session.getScriptTimeZone() || 'Asia/Manila', 'yyyy-MM-dd HH:mm'),
    tags:lyricTags_(file.getName(),' ',content),content:content
  };
}

function mediaLibraryRows_() {
  return rowsAsObjects_(getSheet_(SHEETS.MEDIA_LIBRARY));
}

function refreshMcgiMediaLibrary_() {
  const root = DriveApp.getFolderById(MCGI_MEDIA_FOLDER_ID);
  const rows = [['File ID','File Name','Folder Path','File URL','Mime Type','Modified','Indexed At']];
  const seen = {};
  const now = timestampNow_();
  function walk_(folder, path, depth) {
    if (depth > 30) return;
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const id = file.getId();
      if (seen[id]) continue;
      seen[id] = true;
      rows.push([id,file.getName(),path,'https://drive.google.com/file/d/'+id+'/view',file.getMimeType(),Utilities.formatDate(file.getLastUpdated(), Session.getScriptTimeZone() || 'Asia/Manila','yyyy-MM-dd HH:mm'),now]);
    }
    const folders = folder.getFolders();
    while (folders.hasNext()) {
      const child = folders.next();
      walk_(child, path ? path + ' / ' + child.getName() : child.getName(), depth + 1);
    }
  }
  walk_(root, root.getName(), 0);
  const sh = getSheet_(SHEETS.MEDIA_LIBRARY);
  sh.clearContents();
  sh.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  return {success:true,count:Math.max(0,rows.length-1),indexedAt:now};
}

function searchMcgiMedia_(query) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  let rows = mediaLibraryRows_();
  if (!rows.length) {
    refreshMcgiMediaLibrary_();
    rows = mediaLibraryRows_();
  }
  const results = rows.filter(function(r){
    const hay = [r['File Name'],r['Folder Path'],r['Mime Type']].join(' ').toLowerCase();
    return terms.every(function(t){ return hay.indexOf(t) >= 0; });
  }).slice(0,30).map(function(r){
    return {id:r['File ID'],name:r['File Name'],mimeType:r['Mime Type'],url:r['File URL'],modified:r['Modified'],folder:r['Folder Path']};
  });
  results.sort(function(a,b){return String(a.name).localeCompare(String(b.name));});
  return results;
}


function getMcgiMediaDuration_(fileId) {
  const id = extractDriveFileId_(fileId);
  if (!id) throw new Error('A valid Google Drive file ID is required.');

  try {
    const response = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,name,mimeType,webViewLink,videoMediaMetadata',
      {headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions:true}
    );
    const code = response.getResponseCode();
    const body = response.getContentText();
    if(code < 200 || code >= 300) throw new Error('Drive API HTTP ' + code + ': ' + body.substring(0,300));
    const file = JSON.parse(body);
    const millis = file && file.videoMediaMetadata && file.videoMediaMetadata.durationMillis;
    if(!millis) return {success:false,durationSeconds:null,message:'This file has no readable video duration.'};
    return {success:true,durationSeconds:Math.round(Number(millis)/1000),durationMillis:Number(millis),name:file.name||'',mimeType:file.mimeType||'',url:file.webViewLink||('https://drive.google.com/file/d/'+id+'/view')};
  } catch(err) {
    throw new Error('Unable to read the video duration: ' + err.message);
  }
}


function saveLyricLineup_(payload, session) {
  const data = payload || {};
  const name = String(data.name || '').trim();
  if (!name) throw new Error('A lineup name is required.');
  const owner = String((session && session.email) || data.owner || getActiveUserEmail_() || 'SSG Account');
  const sh = getSheet_(SHEETS.LINEUPS);
  const now = timestampNow_();
  const id = String(data.id || generateId_('LYL'));
  const values = sh.getDataRange().getValues();
  let row = -1;
  for (let i=1;i<values.length;i++) if(String(values[i][0])===id){row=i+1;break;}
  const json = JSON.stringify(data.payload || {});
  const record=[id,name,owner,row>0?values[row-1][3]||now:now,now,json];
  if(row>0) sh.getRange(row,1,1,record.length).setValues([record]);
  else sh.appendRow(record);
  return {success:true,id:id,name:name,updatedAt:now};
}
function getLyricLineups_(){
  const owner=getActiveUserEmail_()||'SSG Account';
  return rowsAsObjects_(getSheet_(SHEETS.LINEUPS)).filter(function(r){return String(r['Owner'])===String(owner) || String(r['Owner'])==='SSG Account';}).sort(function(a,b){return String(b['Updated At']).localeCompare(String(a['Updated At']));}).map(function(r){return {id:r['Lineup ID'],name:r['Name'],owner:r['Owner'],createdAt:r['Created At'],updatedAt:r['Updated At']};});
}
function loadLyricLineup_(id){
  const target=String(id||'');
  const row=rowsAsObjects_(getSheet_(SHEETS.LINEUPS)).find(function(r){return String(r['Lineup ID'])===target;});
  if(!row) throw new Error('Saved lineup not found.');
  let payload={}; try{payload=JSON.parse(row['Payload JSON']||'{}');}catch(e){}
  return {success:true,id:row['Lineup ID'],name:row['Name'],payload:payload};
}
function deleteLyricLineup_(id){
  const sh=getSheet_(SHEETS.LINEUPS); const values=sh.getDataRange().getValues(); const target=String(id||'');
  for(let i=1;i<values.length;i++){if(String(values[i][0])===target){sh.deleteRow(i+1);return {success:true};}}
  throw new Error('Saved lineup not found.');
}
function createLiveSession_(payload, session){
  const data=payload||{}; const id=String(data.sessionId||generateId_('LIVE')).toUpperCase(); const owner=String((session&&session.email)||data.owner||getActiveUserEmail_()||'SSG Account'); const now=timestampNow_();
  const sh=getSheet_(SHEETS.LIVE_SESSIONS); sh.appendRow([id,String(data.guideId||''),owner,now,now,true,1,JSON.stringify(data.state||{})]);
  return {success:true,sessionId:id,version:1,role:String(data.role||'control').toLowerCase()};
}
function joinLiveSession_(sessionId){
  const id=String(sessionId||'').trim().toUpperCase(); const rows=rowsAsObjects_(getSheet_(SHEETS.LIVE_SESSIONS)); const row=rows.find(function(r){return String(r['Session ID']).toUpperCase()===id && String(r['Active']).toUpperCase()!=='FALSE';});
  if(!row) throw new Error('Live session not found or already closed.');
  return {success:true,sessionId:id,guideId:row['Guide ID'],version:Number(row['Version']||1),state:(function(){try{return JSON.parse(row['State JSON']||'{}');}catch(e){return {};}})()};
}
function getLiveSession_(sessionId){
  const id=String(sessionId||'').trim().toUpperCase(); const row=rowsAsObjects_(getSheet_(SHEETS.LIVE_SESSIONS)).find(function(r){return String(r['Session ID']).toUpperCase()===id;});
  if(!row || String(row['Active']).toUpperCase()==='FALSE') return {success:false,closed:true};
  let state={};try{state=JSON.parse(row['State JSON']||'{}');}catch(e){}
  return {success:true,sessionId:id,guideId:row['Guide ID'],version:Number(row['Version']||1),updatedAt:row['Updated At'],state:state};
}
function publishLiveSession_(sessionId,state){
  const id=String(sessionId||'').trim().toUpperCase(); const sh=getSheet_(SHEETS.LIVE_SESSIONS); const values=sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++) if(String(values[i][0]).toUpperCase()===id && String(values[i][5]).toUpperCase()!=='FALSE'){
    const version=Number(values[i][6]||0)+1; sh.getRange(i+1,5,1,4).setValues([[timestampNow_(),true,version,JSON.stringify(state||{})]]); return {success:true,sessionId:id,version:version};
  }
  throw new Error('Live session not found.');
}
function closeLiveSession_(sessionId){
  const sh=getSheet_(SHEETS.LIVE_SESSIONS); const values=sh.getDataRange().getValues(); const id=String(sessionId||'').trim().toUpperCase();
  for(let i=1;i<values.length;i++) if(String(values[i][0]).toUpperCase()===id){sh.getRange(i+1,5,1,2).setValues([[timestampNow_(),false]]);return {success:true};}
  return {success:true};
}

function extractDriveFileId_(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const m = s.match(/[-\\w]{20,}/);
  return m ? m[0] : s;
}

function createSession_(role, email) {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  const hash = sha256Hex_(token);
  const nowMs = Date.now();
  const nowText = timestampNow_();
  const expiresMs = nowMs + (AUTH_TTL_SECONDS * 1000);

  const cache = CacheService.getScriptCache();
  cache.put(
    AUTH_CACHE_PREFIX + hash,
    JSON.stringify({
      role: role,
      email: email || '',
      createdAt: nowText,
      expiresAt: expiresMs
    }),
    AUTH_TTL_SECONDS
  );

  const sheet = getSheet_(SHEETS.GUEST_SESSIONS);
  sheet.appendRow([
    hash,
    email || '',
    role,
    nowText,
    nowText,
    true,
    expiresMs
  ]);

  return token;
}

function authorizeSession_(token) {
  const raw = String(token || '').trim();
  if (!raw) throw new Error('AUTH_REQUIRED: Please sign in first.');

  const hash = sha256Hex_(raw);
  const cache = CacheService.getScriptCache();
  const cachedRaw = cache.get(AUTH_CACHE_PREFIX + hash);
  let session = null;

  if (cachedRaw) {
    try { session = JSON.parse(cachedRaw); } catch (err) { session = null; }
  }

  // Fast path: valid cached session means no spreadsheet read on ordinary API calls.
  if (session) {
    if (!session.expiresAt || Date.now() >= Number(session.expiresAt)) {
      cache.remove(AUTH_CACHE_PREFIX + hash);
      throw new Error('AUTH_REQUIRED: Your session has expired. Please sign in again.');
    }
    return session;
  }

  const sessionRow = getSessionRecordByHash_(hash);
  if (!sessionRow) throw new Error('AUTH_REQUIRED: Please sign in first.');
  if (String(sessionRow.active).toUpperCase() !== 'TRUE') throw new Error('AUTH_REQUIRED: This session has been signed out.');

  let expiresMs = Number(sessionRow.expiresEpoch || 0);
  if (!expiresMs) {
    expiresMs = deriveSessionExpiry_(sessionRow.createdAtRaw);
    if (expiresMs) getFastSheet_(SHEETS.GUEST_SESSIONS, HEADERS.GUEST_SESSIONS).getRange(sessionRow.row, 7).setValue(expiresMs);
  }
  if (!expiresMs || Date.now() >= expiresMs) {
    markSessionInactiveByHash_(hash);
    cache.remove(AUTH_CACHE_PREFIX + hash);
    throw new Error('AUTH_REQUIRED: Your session has expired. Please sign in again.');
  }

  session = {
    role: String(sessionRow.role || ''),
    email: String(sessionRow.email || ''),
    createdAt: String(sessionRow.createdAtDisplay || ''),
    expiresAt: expiresMs
  };

  if (session.role === 'guest') {
    const account = getGuestAccountByEmail_(String(session.email || '').toLowerCase());
    if (!account || String(account.status).toUpperCase() === 'BLOCKED') {
      markSessionInactiveByHash_(hash);
      cache.remove(AUTH_CACHE_PREFIX + hash);
      throw new Error('AUTH_BLOCKED: This Google account is blocked from the Tech Guide Builder.');
    }
  } else if (session.role === 'account') {
    const account = findSSGAccountByUsername_(session.email);
    if (!account || String(account.status).toUpperCase() !== 'ACTIVE') {
      markSessionInactiveByHash_(hash);
      cache.remove(AUTH_CACHE_PREFIX + hash);
      throw new Error('AUTH_BLOCKED: This SSG account is not active.');
    }
  }

  cache.put(AUTH_CACHE_PREFIX + hash, JSON.stringify(session), AUTH_TTL_SECONDS);
  return session;
}

function getSessionRecordByHash_(hash) {
  const sheet = getSheet_(SHEETS.GUEST_SESSIONS);
  const values = sheet.getDataRange().getValues();
  const display = sheet.getDataRange().getDisplayValues();

  if (!values || values.length < 2) return null;

  for (let i = 1; i < values.length; i++) {
    if (String(display[i][0] || '').trim() === String(hash)) {
      return {
        row: i + 1,
        email: values[i][1] || '',
        role: values[i][2] || '',
        createdAtRaw: values[i][3] || '',
        createdAtDisplay: display[i][3] || '',
        lastSeenRaw: values[i][4] || '',
        lastSeenDisplay: display[i][4] || '',
        active: values[i][5],
        expiresEpoch: values[i].length >= 7 ? Number(values[i][6] || 0) : 0
      };
    }
  }

  return null;
}

function deriveSessionExpiry_(createdAtRaw) {
  if (!createdAtRaw) return 0;

  if (createdAtRaw instanceof Date) {
    const ms = createdAtRaw.getTime();
    return isNaN(ms) ? 0 : ms + (AUTH_TTL_SECONDS * 1000);
  }

  const text = String(createdAtRaw).trim();
  if (!text) return 0;

  const direct = new Date(text.replace(' ', 'T') + '+08:00');
  if (!isNaN(direct.getTime())) {
    return direct.getTime() + (AUTH_TTL_SECONDS * 1000);
  }

  try {
    const tz = Session.getScriptTimeZone() || 'Asia/Manila';
    const parsed = Utilities.parseDate(text, tz, 'yyyy-MM-dd HH:mm:ss');
    if (parsed && !isNaN(parsed.getTime())) {
      return parsed.getTime() + (AUTH_TTL_SECONDS * 1000);
    }
  } catch (err) {}

  return 0;
}

function getAuthClientKey_() {
  const email = getActiveUserEmail_();
  if (email) return email.toLowerCase();
  try {
    return Session.getTemporaryActiveUserKey() || 'anonymous';
  } catch (e) {
    return 'anonymous';
  }
}

function getActiveUserEmail_() {
  try {
    return String(Session.getActiveUser().getEmail() || '').trim();
  } catch (e) {
    return '';
  }
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function constantTimeEqual_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function timestampNow_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Manila',
    'yyyy-MM-dd HH:mm:ss'
  );
}

function findSessionRowByHash_(hash) {
  return getSessionRecordByHash_(hash);
}

function markSessionInactiveByHash_(hash) {
  const sheet = getSheet_(SHEETS.GUEST_SESSIONS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(hash)) {
      sheet.getRange(i + 1, 6).setValue(false);
      sheet.getRange(i + 1, 5).setValue(timestampNow_());
      break;
    }
  }
}

function getGuestAccountByEmail_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const rows = rowsAsObjects_(getSheet_(SHEETS.GUEST_ACCOUNTS));
  return rows.find(function(r) { return String(r['Email'] || '').trim().toLowerCase() === normalized; }) || null;
}

function upsertGuestAccount_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const sheet = getSheet_(SHEETS.GUEST_ACCOUNTS);
  const rows = sheet.getDataRange().getValues();
  const now = timestampNow_();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === normalized) {
      const count = Number(rows[i][3] || 0) + 1;
      sheet.getRange(i + 1, 3, 1, 4).setValues([[now, count, 'ACTIVE', 'Guest login']]);
      return;
    }
  }
  sheet.appendRow([normalized, now, now, 1, 'ACTIVE', 'Guest login']);
}

function getGuestAccounts_() {
  return rowsAsObjects_(getSheet_(SHEETS.GUEST_ACCOUNTS)).map(function(r) {
    return {
      email: r['Email'] || '',
      firstSeen: r['First Seen'] || '',
      lastSeen: r['Last Seen'] || '',
      visits: Number(r['Visit Count'] || 0),
      status: r['Status'] || 'ACTIVE',
      lastAction: r['Last Action'] || ''
    };
  }).sort(function(a, b) { return String(b.lastSeen).localeCompare(String(a.lastSeen)); });
}

function setGuestStatus_(email, status, action) {
  const normalized = String(email || '').trim().toLowerCase();
  const sheet = getSheet_(SHEETS.GUEST_ACCOUNTS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toLowerCase() === normalized) {
      sheet.getRange(i + 1, 5, 1, 2).setValues([[status, action]]);
      return true;
    }
  }
  return false;
}

function signOutGuest_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const sheet = getSheet_(SHEETS.GUEST_SESSIONS);
  const data = sheet.getDataRange().getValues();
  const cache = CacheService.getScriptCache();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || '').trim().toLowerCase() === normalized && String(data[i][5]).toUpperCase() === 'TRUE') {
      cache.remove(AUTH_CACHE_PREFIX + String(data[i][0]));
      sheet.getRange(i + 1, 6).setValue(false);
      sheet.getRange(i + 1, 5).setValue(timestampNow_());
    }
  }
  setGuestStatus_(normalized, 'ACTIVE', 'Signed out by SSG Officer');
  return { success: true, message: normalized + ' has been signed out from active sessions.' };
}

function blockGuest_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const sheet = getSheet_(SHEETS.GUEST_SESSIONS);
  const data = sheet.getDataRange().getValues();
  const cache = CacheService.getScriptCache();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || '').trim().toLowerCase() === normalized && String(data[i][5]).toUpperCase() === 'TRUE') {
      cache.remove(AUTH_CACHE_PREFIX + String(data[i][0]));
      sheet.getRange(i + 1, 6).setValue(false);
      sheet.getRange(i + 1, 5).setValue(timestampNow_());
    }
  }
  if (!setGuestStatus_(normalized, 'BLOCKED', 'Blocked by SSG Officer')) throw new Error('Guest account not found.');
  return { success: true, message: normalized + ' has been blocked.' };
}

function unblockGuest_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!setGuestStatus_(normalized, 'ACTIVE', 'Unblocked by SSG Officer')) throw new Error('Guest account not found.');
  return { success: true, message: normalized + ' has been unblocked.' };
}

function getBootstrap_() {
  const db = ensureDatabase_();
  return {
    appName: APP_NAME,
    appUrl: ScriptApp.getService().getUrl() || '',
    databaseId: db.getId(),
    timezone: Session.getScriptTimeZone() || 'Asia/Manila'
  };
}

function setupDatabase_() {
  const db = ensureDatabase_();
  return { success: true, databaseId: db.getId(), url: db.getUrl() };
}

function ensureDatabase_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(DB_PROPERTY);
  let ss = null;

  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; }
  }

  if (!ss) {
    ss = SpreadsheetApp.create(DB_NAME);
    props.setProperty(DB_PROPERTY, ss.getId());
    props.deleteProperty(DB_READY_PROPERTY);
  }

  // The full sheet/header setup is expensive. Do it once, not on every API call.
  if (props.getProperty(DB_READY_PROPERTY) !== '1') {
    Object.keys(HEADERS).forEach(function(key) { ensureSheet_(ss, SHEETS[key], HEADERS[key]); });
    seedHeadSSGAccount_(ss);
    props.setProperty(DB_READY_PROPERTY, '1');
  }

  return ss;
}

function getFastSheet_(name, headers) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(DB_PROPERTY);
  if (!id) {
    const ss = ensureDatabase_();
    return ensureSheet_(ss, name, headers);
  }
  let ss;
  try { ss = SpreadsheetApp.openById(id); } catch (err) {
    ss = ensureDatabase_();
  }
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ensureSheet_(ss, name, headers);
  return sheet;
}

function seedHeadSSGAccount_(ss) {
  const sh = ss.getSheetByName(SHEETS.SSG_ACCOUNTS);
  if (!sh) return;
  const values = sh.getDataRange().getValues();
  const target = 'nathan gabriel protestades';
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][3] || values[i][1] || '').trim().toLowerCase() === target) return;
  }
  const salt = 'SSG_HEAD_2026_2027';
  const hash = sha256Hex_(salt + 'nathan.9235');
  const now = timestampNow_();
  sh.appendRow(['ACC-HEAD-SSG2627', 'Nathan Gabriel Protestades', 'SSG Chairperson', 'Nathan Gabriel Protestades', hash, salt, 'ACTIVE', now, '']);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getDisplayValues()[0];
    const needsWrite = headers.some(function(h, i) { return String(current[i] || '') !== h; });
    if (needsWrite) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function getSpreadsheet_() {
  return ensureDatabase_();
}

function getSheet_(name) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function rowsAsObjects_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (!values || values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(function(row, index) {
    const obj = { _row: index + 2 };
    headers.forEach(function(h, i) { obj[h] = row[i] || ''; });
    return obj;
  });
}

function currentAccountIdentity_(session) {
  const sessionUsername = String((session && session.email) || '').trim();
  if (!sessionUsername) return { username: '', name: '' };
  const account = findSSGAccountByUsername_(sessionUsername);
  // Always use the canonical username stored in SSG_ACCOUNTS. This prevents
  // ownership mismatches caused by casing/legacy display-name values in GUIDES.
  if (account) {
    return {
      username: String(account.username || account.name || sessionUsername).trim(),
      name: String(account.name || account.username || sessionUsername).trim()
    };
  }
  return { username: sessionUsername, name: sessionUsername };
}
function normalizeIdentityValue_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function guideOwnerMatchesIdentity_(ownerUsername, ownerName, identity) {
  const ou = normalizeIdentityValue_(ownerUsername);
  const on = normalizeIdentityValue_(ownerName);
  const iu = normalizeIdentityValue_(identity && identity.username);
  const iname = normalizeIdentityValue_(identity && identity.name);
  if (!iu && !iname) return false;

  // Account username is the primary identity. Also accept the canonical
  // account name because older GUIDE rows may have stored the display name
  // (or a different legacy username) in the owner columns.
  const ownerValues = [ou, on].filter(Boolean);
  const identityValues = [iu, iname].filter(Boolean);
  for (let i = 0; i < ownerValues.length; i++) {
    for (let j = 0; j < identityValues.length; j++) {
      if (ownerValues[i] === identityValues[j]) return true;
    }
  }
  return false;
}
function guideVisibility_(value) {
  return String(value || 'PRIVATE').trim().toUpperCase() === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
}
function guidePublicAccess_(value) {
  return String(value || 'VIEW').trim().toUpperCase() === 'EDIT' ? 'EDIT' : 'VIEW';
}
function guideSummaryFromRow_(r, identity) {
  const visibility = guideVisibility_(r['Visibility']);
  const publicAccess = guidePublicAccess_(r['Public Access']);
  const ownerUsername = String(r['Owner Username'] || '').trim();
  const ownerName = String(r['Owner Name'] || ownerUsername || '').trim();
  const isOwner = guideOwnerMatchesIdentity_(ownerUsername, ownerName, identity);
  const canEdit = isOwner || (visibility === 'PUBLIC' && publicAccess === 'EDIT');
  return { id:r['Guide ID'], title:r['Title'], eventDate:r['Event Date'], venue:r['Venue'], organizersCallTime:r['Organizers Call Time'], formalStart:r['Formal Start'], mainBgm:r['Main BGM'], fileLink:r['File Link'], createdAt:r['Created At'], updatedAt:r['Updated At'], type:String(r['Guide Type']||'PROGRAM_FLOW').toUpperCase(), ownerUsername:ownerUsername, ownerName:ownerName, visibility:visibility, publicAccess:publicAccess, isOwner:isOwner, canEdit:canEdit, isLegacy:!ownerUsername };
}
function getGuides_(session) {
  const sheet = getSheet_(SHEETS.GUIDES);
  const identity = currentAccountIdentity_(session);
  const grouped = {};
  rowsAsObjects_(sheet).forEach(function(r) {
    const id = String(r['Guide ID'] || '').trim();
    if (!id) return;
    const summary = guideSummaryFromRow_(r, identity);
    const existing = grouped[id];
    // If duplicate/legacy rows exist, always prefer the row owned by the
    // currently signed-in account. Otherwise prefer a public row. This prevents
    // My Saved Guides from pointing Edit at a different row with the same ID.
    if (!existing || (summary.isOwner && !existing.isOwner) || (summary.visibility === 'PUBLIC' && existing.visibility !== 'PUBLIC')) {
      grouped[id] = summary;
    }
  });
  return Object.keys(grouped).map(function(id){ return grouped[id]; })
    .filter(function(g) { return g.isOwner || g.visibility === 'PUBLIC' || !g.ownerUsername; })
    .sort(function(a,b) { return String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')); });
}
function getGuide_(guideId, session) {
  if (!guideId) return null;
  const guideRows=rowsAsObjects_(getSheet_(SHEETS.GUIDES)).filter(function(r){return String(r['Guide ID'])===String(guideId);});
  if(!guideRows.length)return null;
  const identity=currentAccountIdentity_(session);
  // Prefer the row owned by the current account when duplicate/legacy rows
  // share the same Guide ID. This is critical for private-guide Edit.
  let g=guideRows.find(function(r){return guideOwnerMatchesIdentity_(r['Owner Username'], r['Owner Name'], identity);});
  if(!g) g=guideRows.find(function(r){return guideVisibility_(r['Visibility'])==='PUBLIC';}) || guideRows[0];
  const visibility=guideVisibility_(g['Visibility']);
  const publicAccess=guidePublicAccess_(g['Public Access']);
  const ownerUsername=String(g['Owner Username']||'').trim();
  const ownerName=String(g['Owner Name']||ownerUsername||'').trim();
  const isOwner=guideOwnerMatchesIdentity_(ownerUsername, ownerName, identity);
  if(visibility==='PRIVATE'&&!isOwner)throw new Error('AUTH_FORBIDDEN: This guide is private to its owner.');
  const sectionRows=rowsAsObjects_(getSheet_(SHEETS.SECTIONS)).filter(function(r){return String(r['Guide ID'])===String(guideId);}).sort(function(a,b){return Number(a['Sort Order']||0)-Number(b['Sort Order']||0);});
  const itemRows=rowsAsObjects_(getSheet_(SHEETS.ITEMS)).filter(function(r){return String(r['Guide ID'])===String(guideId);}).sort(function(a,b){const sa=Number(a['Sort Order']||0),sb=Number(b['Sort Order']||0);if(sa!==sb)return sa-sb;return Number(a['Item Number']||0)-Number(b['Item Number']||0);});
  return {id:g['Guide ID'],title:g['Title'],eventDate:g['Event Date'],venue:g['Venue'],organizersCallTime:g['Organizers Call Time'],formalStart:g['Formal Start'],mainBgm:g['Main BGM'],fileLink:g['File Link'],createdAt:g['Created At'],updatedAt:g['Updated At'],type:String(g['Guide Type']||'PROGRAM_FLOW').toUpperCase(),ownerUsername:ownerUsername,ownerName:ownerName,visibility:visibility,publicAccess:publicAccess,isOwner:isOwner,canEdit:(isOwner || (visibility==='PUBLIC' && publicAccess==='EDIT')),sections:sectionRows.map(function(sec){return {id:sec['Section ID'],title:sec['Section Title'],startTime:sec['Start Time'],endTime:sec['End Time'],notes:sec['Notes'],items:itemRows.filter(function(i){return String(i['Section ID'])===String(sec['Section ID']);}).map(function(i,itemIndex){return {id:'ITEM_'+guideId+'_'+sec['Section ID']+'_'+(itemIndex+1),number:i['Item Number'],title:i['Title'],startTime:i['Start Time'],endTime:i['End Time'],trt:i['Duration'],duration:i['Duration'],media:i['Media / File'],mediaUrl:i['Media URL']||'',link:i['Link'],participants:i['Participants / Details'],notes:i['Notes']};})};})};
}

function getCPFCTemplate_() {
  return {
    id: '',
    title: 'COMMUNITY PRAYER & FLAG CEREMONY TECH GUIDE',
    eventDate: '2026-09-21',
    organizersCallTime: '6:30 AM',
    formalStart: '7:30 AM',
    mainBgm: '',
    fileLink: '',
    sections: [
      {
        id: generateId_('SEC'),
        title: 'A. COMMUNITY PRAYER — I. AWITAN',
        startTime: '7:30 AM',
        endTime: '8:00 AM',
        notes: '',
        items: [
          { id: generateId_('ITM'), number: '1', title: 'MCGI Symphony Orchestra - Awit Ng MMC', startTime: '7:30 AM', endTime: '7:36 AM', media: '', link: 'https://drive.google.com/file/d/1Qakhg6QHiC7r40IFu8egpp4UtUEKE1c9/view?usp=drive_link', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '2', title: 'Paanyaya Sa Pormal Na Awitan', startTime: '7:36 AM', endTime: '7:39 AM', media: 'LVCC CP PAALALA NEW.mp4', link: '', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '3', title: 'Special Song - Dakila Ka', startTime: '7:38 AM', endTime: '7:43 AM', media: '', link: 'https://drive.google.com/file/d/1Wihg8V-xfBPuj9OK5ZiThl0yTl_df7jcv/view?usp=drive_link', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '4', title: 'MCGI Servant', startTime: '7:43 AM', endTime: '7:45 AM', media: '', link: '', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '5', title: 'Himnario - 36 Kami Ingatan Mo', startTime: '7:45 AM', endTime: '7:54 AM', media: 'HIMNO 36', link: 'https://drive.google.com/file/d/1qvXEgBhPHGwvRkARoZVNAvyv4xTG7oz/view?usp=drive_link', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '6', title: 'Prayer', startTime: '7:54 AM', endTime: '7:59 AM', media: '', link: '', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '7', title: 'Doxology', startTime: '7:59 AM', endTime: '8:00 AM', media: 'DOXOLOGIA_TAG-MULTILANGUAGE+1_REV_WHITE.mp4', link: '', participants: '', notes: '' }
        ]
      },
      {
        id: generateId_('SEC'),
        title: 'II. BREAK (PROGRAM INTERVAL)',
        startTime: '8:00 AM',
        endTime: '8:30 AM',
        notes: '',
        items: [
          { id: generateId_('ITM'), number: '1', title: 'Chorale de La Verdad & LV Dance Troupe - We Will Sing Forever 247', startTime: '8:00 AM', endTime: '8:05 AM', media: '', link: 'https://drive.google.com/file/d/1eWaRtRSwPQM cq4Rv6Wgx565hlUWBja_/view?usp=drive_link'.replace('PQM ', 'PQM'), participants: '', notes: '' },
          { id: generateId_('ITM'), number: '2', title: '[REVISED] Countdown', startTime: '8:05 AM', endTime: '8:06 AM', media: '', link: 'https://drive.google.com/file/d/1NTCMI7aqfwFmGLYB9Hb4AgZd4yvN-YC/view?usp=drivesdk', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '3', title: 'Playables (if there is any)', startTime: '8:06 AM', endTime: '8:15 AM', media: '', link: '', participants: '', notes: '' }
        ]
      },
      {
        id: generateId_('SEC'),
        title: 'III. FLAG CEREMONY',
        startTime: '8:15 AM',
        endTime: '8:30 AM',
        notes: '',
        items: [
          { id: generateId_('ITM'), number: '1', title: 'LVCC Caloocan Community Prayer and Flag Ceremony Primer AVP', startTime: '8:15 AM', endTime: '8:15 AM', media: '', link: 'https://drive.google.com/file/d/1ori0QEO7vmTPCdJXeKJVNuZsnvJfl6uA/view?usp=sharing', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '2', title: 'Invocation Primer AVP', startTime: '8:15 AM', endTime: '8:16 AM', media: '', link: 'https://drive.google.com/file/d/18kfJU_eyFnBKhySpNH2MoBkkVxts6iD/view?usp=sharing', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '3', title: 'Invocation - Kung Kasama Ka', startTime: '8:16 AM', endTime: '8:22 AM', media: '', link: 'https://drive.google.com/file/d/1kZ-bXbKaTGSA_XqxZCSskddR-FNf4PRv/view?usp=sharing', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '4', title: 'Flag Ceremony Primer VO [Optional. Can be done LIVE]', startTime: '8:22 AM', endTime: '8:23 AM', media: '', link: 'https://drive.google.com/file/d/1kDxEg-5Ee03wRhjFb4W4AUGZbfsGZfXV/view?usp=sharing', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '5', title: 'National Anthem', startTime: '8:23 AM', endTime: '8:24 AM', media: 'NATIONAL ANTHEM.mp4', link: '', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '6', title: 'LVCC Hymn [Subject to change: may be used to end the event instead]', startTime: '8:24 AM', endTime: '8:26 AM', media: 'LVCC HYMN.mp4', link: '', participants: '', notes: '' },
          { id: generateId_('ITM'), number: '7', title: "Christian Habit - Kung Ika’y May Katulong (Jamaican Farewell Adapt.)", startTime: '8:26 AM', endTime: '8:30 AM', media: '', link: 'https://drive.google.com/file/d/1zdf721P1rtT7qWzKd5EvTu-92326PMWR/view?usp=sharing', participants: '', notes: 'Lyrics only and with choreo references are both available.' }
        ]
      }
    ]
  };
}

function saveGuide_(guide, session) {
  const clean = normalizeGuide_(guide);
  if (!clean.title) throw new Error('Guide/Event Title is required.');
  const identity=currentAccountIdentity_(session);
  if(!identity.username) throw new Error('AUTH_REQUIRED: An SSG account is required to save a guide.');

  const ss = getSpreadsheet_();
  const guideSheet = ss.getSheetByName(SHEETS.GUIDES);
  const sectionSheet = ss.getSheetByName(SHEETS.SECTIONS);
  const itemSheet = ss.getSheetByName(SHEETS.ITEMS);

  let id = clean.id || generateId_('GUIDE');
  const now = new Date();
  const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Manila', 'yyyy-MM-dd HH:mm:ss');
  let createdAt = timestamp;
  const guideType = clean.type === 'PROGRAM_SEQUENCE' ? 'PROGRAM_SEQUENCE' : 'PROGRAM_FLOW';

  const rows = guideSheet.getDataRange().getDisplayValues();
  let guideRow = -1;
  let existingOwner = '';
  let existingVisibility = '';
  let matchingGuideRows = [];
  if (rows.length > 1) {
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) matchingGuideRows.push(i + 1);
    }
  }
  // For an existing guide, update the row owned by the current account first.
  // This avoids editing a stale duplicate row that would later look private to
  // the same owner. If no owner row exists, fall back to the first matching row.
  for (let k = 0; k < matchingGuideRows.length; k++) {
    const rr = matchingGuideRows[k];
    if (guideOwnerMatchesIdentity_(rows[rr - 1][11], rows[rr - 1][12], identity)) { guideRow = rr; break; }
  }
  if (guideRow < 0 && matchingGuideRows.length) guideRow = matchingGuideRows[0];
  if (guideRow >= 0) {
    createdAt = rows[guideRow - 1][8] || createdAt;
    existingOwner = String(rows[guideRow - 1][11] || '').trim();
    existingVisibility = guideVisibility_(rows[guideRow - 1][13]);
  }
  const existingVisibilityForSave = guideRow >= 0 ? guideVisibility_(rows[guideRow - 1][13]) : 'PRIVATE';
  const existingPublicAccessForSave = guideRow >= 0 ? guidePublicAccess_(rows[guideRow - 1][14]) : 'VIEW';
  const existingOwnerName = guideRow >= 0 ? String(rows[guideRow - 1][12] || '').trim() : '';
  const isOwnerForSave = guideRow >= 0 ? guideOwnerMatchesIdentity_(existingOwner, existingOwnerName, identity) : true;
  const publicEditAllowedForSave = existingVisibilityForSave === 'PUBLIC' && existingPublicAccessForSave === 'EDIT';
  if (guideRow >= 0 && existingOwner && !isOwnerForSave && !publicEditAllowedForSave) {
    throw new Error('AUTH_FORBIDDEN: This guide is view-only. Use it as a copy instead.');
  }

  // Visibility is explicit. A new guide defaults to PRIVATE; an existing guide
  // keeps its stored visibility unless the owner deliberately supplies another
  // valid value. Never let an empty/unknown value fall through to PUBLIC.
  const rawVisibility = String(clean.visibility || '').trim().toUpperCase();
  const visibility = rawVisibility === 'PRIVATE' || rawVisibility === 'PUBLIC'
    ? rawVisibility
    : (guideRow >= 0 ? existingVisibilityForSave : 'PRIVATE');
  const existingPublicAccess = guideRow >= 0 ? guidePublicAccess_(rows[guideRow - 1][14]) : 'VIEW';
  const rawPublicAccess = String(clean.publicAccess || '').trim().toUpperCase();
  const requestedPublicAccess = rawPublicAccess === 'EDIT' || rawPublicAccess === 'VIEW'
    ? rawPublicAccess
    : existingPublicAccess;
  const publicAccess = visibility === 'PUBLIC' ? requestedPublicAccess : 'VIEW';
  // If this account is the owner, always rewrite the canonical owner identity.
  // This also repairs older private guides that were saved with a generic
  // 'SSG Account' owner marker.
  const ownerUsername = (guideRow >= 0 && !isOwnerForSave) ? existingOwner : identity.username;
  const ownerName = (guideRow >= 0 && !isOwnerForSave) ? String(rows[guideRow - 1][12] || '') : identity.name;
  const guideValues = [id, clean.title, clean.eventDate, clean.organizersCallTime, clean.formalStart, clean.mainBgm, clean.fileLink, guideType, createdAt, timestamp, clean.venue, ownerUsername, ownerName, visibility, publicAccess];
  if (guideRow < 0) {
    guideSheet.appendRow(guideValues);
  } else {
    guideSheet.getRange(guideRow, 1, 1, HEADERS.GUIDES.length).setValues([guideValues]);
  }

  deleteRowsByGuide_(sectionSheet, id);
  deleteRowsByGuide_(itemSheet, id);

  const sectionRows = [];
  const itemRows = [];
  (clean.sections || []).forEach(function(section, sIndex) {
    const sectionId = section.id || generateId_('SEC');
    sectionRows.push([id, sectionId, sIndex + 1, section.title, section.startTime, section.endTime, section.notes]);
    (section.items || []).forEach(function(item, iIndex) {
      const itemId = item.id || generateId_('ITM');
      const duration = String(item.trt || item.duration || calculateDuration_(item.startTime, item.endTime) || '').trim();
      itemRows.push([id, sectionId, iIndex + 1, item.number || String(iIndex + 1), item.title, item.startTime, item.endTime, duration, item.media, item.mediaUrl, item.link, item.participants, item.notes]);
    });
  });

  if (sectionRows.length) sectionSheet.getRange(sectionSheet.getLastRow() + 1, 1, sectionRows.length, HEADERS.SECTIONS.length).setValues(sectionRows);
  if (itemRows.length) itemSheet.getRange(itemSheet.getLastRow() + 1, 1, itemRows.length, HEADERS.ITEMS.length).setValues(itemRows);

  // Return the just-saved guide directly instead of re-authorizing and re-reading
  // the whole guide immediately. This avoids a second session/cache dependency
  // right after a write and makes Save Guide much more reliable.
  const savedGuide = {
    id: id,
    title: clean.title,
    eventDate: clean.eventDate,
    venue: clean.venue,
    organizersCallTime: clean.organizersCallTime,
    formalStart: clean.formalStart,
    mainBgm: clean.mainBgm,
    fileLink: clean.fileLink,
    createdAt: createdAt,
    updatedAt: timestamp,
    type: guideType,
    ownerUsername: ownerUsername,
    ownerName: ownerName,
    visibility: visibility,
    publicAccess: publicAccess,
    isOwner: guideOwnerMatchesIdentity_(ownerUsername, ownerName, identity),
    canEdit: true,
    sections: clean.sections || []
  };
  return { success: true, message: 'Guide saved successfully.', guide: savedGuide };
}

function normalizeGuide_(guide) {
  guide = guide || {};
  const out = {
    id: String(guide.id || '').trim(),
    title: String(guide.title || '').trim(),
    eventDate: String(guide.eventDate || '').trim(),
    venue: String(guide.venue || '').trim(),
    organizersCallTime: String(guide.organizersCallTime || '').trim(),
    formalStart: String(guide.formalStart || '').trim(),
    mainBgm: String(guide.mainBgm || '').trim(),
    fileLink: String(guide.fileLink || '').trim(),
    type: String(guide.type || 'PROGRAM_FLOW').trim().toUpperCase() === 'PROGRAM_SEQUENCE' ? 'PROGRAM_SEQUENCE' : 'PROGRAM_FLOW',
    visibility: guideVisibility_(guide.visibility || 'PRIVATE'),
    publicAccess: guidePublicAccess_(guide.publicAccess || 'VIEW'),
    sections: []
  };

  (guide.sections || []).forEach(function(s, si) {
    const sec = {
      id: String(s.id || generateId_('SEC')).trim(),
      title: String(s.title || '').trim() || ('Section ' + (si + 1)),
      startTime: String(s.startTime || '').trim(),
      endTime: String(s.endTime || '').trim(),
      notes: String(s.notes || '').trim(),
      items: []
    };
    (s.items || []).forEach(function(it, ii) {
      sec.items.push({
        id: String(it.id || generateId_('ITM')).trim(),
        number: String(it.number || (ii + 1)).trim(),
        title: String(it.title || '').trim() || ('Program Item ' + (ii + 1)),
        startTime: String(it.startTime || '').trim(),
        endTime: String(it.endTime || '').trim(),
        trt: String(it.trt || it.duration || '').trim(),
        media: String(it.media || '').trim(),
        mediaUrl: String(it.mediaUrl || '').trim(),
        link: String(it.link || '').trim(),
        participants: String(it.participants || '').trim(),
        notes: String(it.notes || '').trim()
      });
    });
    out.sections.push(sec);
  });
  return out;
}

function deleteRowsByGuide_(sheet, guideId) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  for (let r = data.length - 1; r >= 1; r--) {
    if (String(data[r][0]) === String(guideId)) sheet.deleteRow(r + 1);
  }
}

function deleteGuide_(guideId, session) {
  const id = String(guideId || '').trim();
  if (!id) throw new Error('Guide ID is required.');
  const guide = getGuide_(id, session);
  if (!guide) throw new Error('Guide not found.');
  if (!guide.isOwner) throw new Error('AUTH_FORBIDDEN: Only the guide owner can delete this saved guide.');

  const ss = getSpreadsheet_();
  deleteRowsByGuide_(ss.getSheetByName(SHEETS.GUIDES), id);
  deleteRowsByGuide_(ss.getSheetByName(SHEETS.SECTIONS), id);
  deleteRowsByGuide_(ss.getSheetByName(SHEETS.ITEMS), id);
  return { success: true, message: 'Guide deleted successfully.' };
}

function exportGuide_(guideId, session) {
  const guide = getGuide_(guideId, session);
  if (!guide) throw new Error('Guide not found.');

  const text = buildGuideText_(guide);
  const baseName = sanitizeFileName_(guide.title || 'Tech Guide');
  const folder = getSpreadsheet_().getParents().hasNext() ? getSpreadsheet_().getParents().next() : DriveApp.getRootFolder();

  const txtFile = folder.createFile(baseName + '.txt', text, MimeType.PLAIN_TEXT);
  const doc = DocumentApp.create(baseName + ' - Google Doc');
  const body = doc.getBody();
  body.clear();
  buildDoc_(body, guide);
  doc.saveAndClose();

  const docFile = DriveApp.getFileById(doc.getId());
  const docxBlob = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(doc.getId()) + '/export?mimeType=' + encodeURIComponent('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
  ).getBlob().setName(baseName + '.docx');
  const docxFile = folder.createFile(docxBlob);

  return {
    success: true,
    text: text,
    txtUrl: txtFile.getUrl(),
    docsUrl: docFile.getUrl(),
    docxUrl: docxFile.getUrl()
  };
}

function buildDoc_(body, guide) {
  body.appendParagraph(guide.title || 'TECH GUIDE').setHeading(DocumentApp.ParagraphHeading.TITLE);
  if (guide.eventDate) body.appendParagraph('Event Date: ' + guide.eventDate);
  if (guide.organizersCallTime) body.appendParagraph('Organizers’ Call Time: ' + guide.organizersCallTime);
  if (guide.formalStart) body.appendParagraph('Formal Start: ' + guide.formalStart);
  if (guide.mainBgm) body.appendParagraph('Main BGM: ' + guide.mainBgm);
  if (guide.fileLink) body.appendParagraph('General File Link: ' + guide.fileLink);

  (guide.sections || []).forEach(function(section, si) {
    body.appendParagraph((si + 1) + '. ' + section.title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (section.startTime || section.endTime) body.appendParagraph('TIME: ' + ((section.startTime || '—') + ' – ' + (section.endTime || '—')));
    (section.items || []).forEach(function(item, ii) {
      body.appendParagraph('#' + (item.number || (ii + 1)) + ' ' + item.title).setBold(true);
      if (item.startTime || item.endTime) body.appendParagraph('TIME: ' + ((item.startTime || '—') + ' – ' + (item.endTime || '—')));
      const d = String(item.trt || item.duration || calculateDuration_(item.startTime, item.endTime) || '').trim();
      if (d) body.appendParagraph('TRT: ' + d);
      if (item.media) body.appendParagraph('MEDIA / FILE: ' + item.media);
      if (item.link) body.appendParagraph('LINK: ' + item.link);
      if (item.participants) body.appendParagraph('PARTICIPANTS / DETAILS: ' + item.participants);
      if (item.notes) body.appendParagraph('NOTES: ' + item.notes);
    });
  });
}

function buildGuideText_(guide) {
  const lines = [];
  lines.push(guide.title || 'TECH GUIDE');
  lines.push('');
  if (guide.eventDate) lines.push('Event Date: ' + guide.eventDate);
  if (guide.organizersCallTime) lines.push('Organizers’ Call Time: ' + guide.organizersCallTime);
  if (guide.formalStart) lines.push('Formal Start: ' + guide.formalStart);
  if (guide.mainBgm) lines.push('Main BGM: ' + guide.mainBgm);
  if (guide.fileLink) lines.push('General File Link: ' + guide.fileLink);
  lines.push('');

  (guide.sections || []).forEach(function(section, si) {
    lines.push((si + 1) + '. ' + section.title);
    if (section.startTime || section.endTime) lines.push('TIME: ' + ((section.startTime || '—') + ' – ' + (section.endTime || '—')));
    if (section.notes) lines.push('NOTE: ' + section.notes);
    lines.push('');

    (section.items || []).forEach(function(item, ii) {
      lines.push('#' + (item.number || (ii + 1)) + ' ' + item.title);
      if (item.startTime || item.endTime) lines.push('TIME: ' + ((item.startTime || '—') + ' – ' + (item.endTime || '—')));
      const d = String(item.trt || item.duration || calculateDuration_(item.startTime, item.endTime) || '').trim();
      if (d) lines.push('TRT: ' + d);
      if (item.media) lines.push('MEDIA / FILE: ' + item.media);
      if (item.link) lines.push('LINK: ' + item.link);
      if (item.participants) lines.push('PARTICIPANTS / DETAILS: ' + item.participants);
      if (item.notes) lines.push('NOTES: ' + item.notes);
      lines.push('');
    });
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sanitizeFileName_(name) {
  return String(name || 'Tech Guide').replace(/[\\/:*?"<>|#%]/g, '-').replace(/\s+/g, ' ').trim().substring(0, 120) || 'Tech Guide';
}

function generateId_(prefix) {
  return (prefix || 'ID') + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 14).toUpperCase();
}

function parseTimeMinutes_(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toUpperCase();
  if (!s) return null;
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;
  let h = Number(match[1]);
  const m = Number(match[2] || 0);
  const ap = match[3] || '';
  if (m < 0 || m > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'AM' && h === 12) h = 0;
    if (ap === 'PM' && h !== 12) h += 12;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + m;
}

function calculateDuration_(start, end) {
  const a = parseTimeMinutes_(start);
  const b = parseTimeMinutes_(end);
  if (a === null || b === null) return '';
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  if (diff < 0) return '';
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours === 0) return mins + ' MINUTES';
  return hours + ' HR' + (hours > 1 ? 'S' : '') + (mins ? ' ' + mins + ' MINUTES' : '');
}
