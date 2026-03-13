/**
 * GOOGLE APPS SCRIPT FOR COUNTTHINGS APP - VERSI LENGKAP & SINKRON
 * (Diperbarui: robust parsing, Gemini 1.5 Flash tuned prompt, deleteData)
 */

const SPREADSHEET_ID = '1audwZ-_kusPpKZ4JvUOj5-IE0EOpnCaKbEJos6FKNTw';
const FOLDER_ID = '1hxYHUgBvFORzhqm8govhNivb_e34gDVE';
const SHEET_NAME = 'Record';
const BACKUP_SHEET_NAME = 'Backup';

/**
 * JALANKAN INI SEKALI (Manual) untuk memaksa permintaan izin Drive/Sheets.
 */
function triggerPermissions() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const dummyFile = folder.createFile('izin_test.txt', 'test');
  dummyFile.setTrashed(true);
  Logger.log('Izin BACA & TULIS diberikan untuk Folder: ' + folder.getName());
  Logger.log('Izin diberikan untuk Spreadsheet: ' + ss.getName());
}

/**
 * DO GET : untuk GET_HISTORY
 */
function doGet(e) {
  if (!e || !e.parameter) {
    return JSON_RESPONSE({
      status: 'error',
      message: 'Fungsi ini tidak bisa dijalankan manual dari editor. Silakan akses melalui URL Web App.'
    });
  }

  const action = e.parameter.action;
  if (action === 'GET_HISTORY') {
    return getHistory();
  }

  return JSON_RESPONSE({ status: 'error', message: 'Invalid action' });
}

/**
 * DO POST : robust parsing (JSON, form-urlencoded, or e.parameter)
 */
function doPost(e) {
  try {
    // parse request body robustly
    let data = {};
    // If postData exists and looks like JSON
    if (e.postData && e.postData.contents) {
      const contentType = (e.postData.type || '').toLowerCase();
      const body = e.postData.contents;

      if (contentType.indexOf('application/json') !== -1 || looksLikeJson(body)) {
        try {
          data = JSON.parse(body);
        } catch (err) {
          // fallback to treat body as raw string -> attempt to parse
          data = { rawBody: body };
        }
      } else if (contentType.indexOf('application/x-www-form-urlencoded') !== -1 || body.indexOf('=') !== -1) {
        // parse form encoded body
        const params = {};
        body.split('&').forEach(pair => {
          const kv = pair.split('=');
          if (kv.length >= 2) {
            const k = decodeURIComponent(kv[0]);
            const v = decodeURIComponent(kv.slice(1).join('='));
            params[k] = v;
          }
        });
        data = params;
      } else {
        // unknown content-type — try JSON parse anyway
        try { data = JSON.parse(body); } catch (err) { data = { rawBody: body }; }
      }
    } else if (e.parameter && Object.keys(e.parameter).length) {
      data = e.parameter;
    } else {
      data = {};
    }

    const action = data.action || data.actionType || '';

    if (action === 'SAVE_DATA') {
      return saveData(data);
    } else if (action === 'SCAN_PHOTO') {
      // accept multiple field names from client
      const img = data.image || data.photoBase64 || data.photo || data.imgData || data.base64 || null;
      if (!img) {
        return JSON_RESPONSE({ status: 'error', message: 'Image tidak ditemukan di request' });
      }
      return scanPhoto(img);
    } else if (action === 'DELETE_DATA') {
      return deleteData(data);
    }

    return JSON_RESPONSE({ status: 'error', message: 'Invalid action' });

  } catch (error) {
    return JSON_RESPONSE({ status: 'error', message: String(error) });
  }
}

/**
 * SAVE DATA ke Spreadsheet & Drive
 */
function saveData(data) {
  try {
    const id = data.ID || data.id;
    if (!id) {
      throw new Error('ID tidak ditemukan. Pastikan data dikirim dengan benar.');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // upload photo (simpan di Drive)
    const photoUrl = saveFileToDrive(data.photoBase64 || data.photo || '', id);

    const timestamp = new Date();
    const formattedDate = Utilities.formatDate(timestamp, "Asia/Jakarta", "MM/dd/yyyy HH:mm:ss");

    const rowData = [
      id,
      formattedDate,
      photoUrl,
      data.ResultScan || data.resultScan || '',
      data.Notes || data.notes || ''
    ];

    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['ID', 'Timestamp', 'photoBase64', 'ResultScan', 'Notes']);
    }
    sheet.appendRow(rowData);

    let backupSheet = ss.getSheetByName(BACKUP_SHEET_NAME);
    if (!backupSheet) {
      backupSheet = ss.insertSheet(BACKUP_SHEET_NAME);
      backupSheet.appendRow(['ID', 'Timestamp', 'photoBase64', 'ResultScan', 'Notes']);
    }
    backupSheet.appendRow(rowData);

    return JSON_RESPONSE({
      status: 'success',
      message: 'Data berhasil disimpan ke Record & Backup',
      data: { id: id, photoUrl: photoUrl }
    });
  } catch (error) {
    console.error('Error in saveData:', error);
    return JSON_RESPONSE({ status: 'error', message: 'Gagal simpan: ' + String(error) });
  }
}

/**
 * Simpan file base64 ke Drive. Jika input kosong / URL, kembalikan input langsung (tidak diupload).
 */
function saveFileToDrive(base64Data, fileName) {
  try {
    if (!base64Data || typeof base64Data !== 'string') return base64Data || '';

    // Jika sudah merupakan URL Drive (lh3...) kembalikan apa adanya
    if (base64Data.indexOf('https://') === 0) {
      return base64Data;
    }

    const parts = base64Data.split(',');
    let contentType = 'image/jpeg';
    let rawData = base64Data;

    if (parts.length > 1) {
      const header = parts[0];
      rawData = parts[1];
      const m = header.match(/data:([^;]+);/);
      if (m && m[1]) contentType = m[1];
    }

    const timestamp = new Date().getTime();
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const blob = Utilities.newBlob(Utilities.base64Decode(rawData), contentType, `Count_${fileName}_${timestamp}.jpg`);
    const file = folder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      console.warn("Gagal set sharing: " + e.toString());
    }

    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (err) {
    console.error('saveFileToDrive error:', err);
    return '';
  }
}

/**
 * Ambil 20 riwayat terakhir (Record)
 */
function getHistory() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return JSON_RESPONSE({ status: 'success', data: [] });

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return JSON_RESPONSE({ status: 'success', data: [] });

    const headers = values[0];
    const rows = values.slice(1);

    const history = rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    }).reverse();

    return JSON_RESPONSE({ status: 'success', data: history.slice(0, 20) });
  } catch (error) {
    return JSON_RESPONSE({ status: 'error', message: String(error) });
  }
}

/**
 * SCAN PHOTO: tuned prompt untuk akurasi tinggi + parse robust
 * Menggunakan model gemini-1.5-flash-001 via v1beta (umumnya tersedia)
 */
/**
 * scanPhoto - gunakan gemini-2.5-flash (fallback gemini-flash-latest)
 * Input: base64 image (data URI atau raw base64)
 * Output: JSON_RESPONSE({ status: 'success'|'error', data: JSON.stringify(parsedResult), meta: {...} })
 */
function scanPhoto(base64Image) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return JSON_RESPONSE({ status: 'error', message: 'GEMINI_API_KEY tidak ditemukan di Script Properties' });
  }

  // ambil raw base64 tanpa prefix data:
  const raw = (typeof base64Image === 'string' && base64Image.indexOf(',') !== -1)
    ? base64Image.split(',')[1]
    : base64Image;

  if (!raw || raw.length < 10) {
    return JSON_RESPONSE({ status: 'error', message: 'Image data kosong atau terlalu pendek' });
  }

  // priority models (coba urut dari yang paling kuat)
  const candidates = [
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  // tuned prompt untuk counting akurat
  const promptText =
    "Kamu adalah model visi & penghitungan objek yang sangat andal. " +
    "Tugas: HITUNG semua objek yang terlihat pada gambar. Keluarkan HANYA JSON MURNI sesuai schema berikut:\n\n" +
    "{\n" +
    "  \"totalCount\": number,\n" +
    "  \"items\": [ { \"name\": string, \"count\": number, \"confidence\": number } ],\n" +
    "  \"description\": string\n" +
    "}\n\n" +
    "Aturan ketat:\n" +
    "- Hanya keluarkan JSON (tanpa komentar atau teks lain).\n" +
    "- Jika tidak yakin tentang objek yang tertutup/terhalang, estimasi dan set confidence (0..1).\n" +
    "- Jelaskan asumsi singkat pada `description` (bahasa Indonesia).\n" +
    "- Gunakan nama objek singkat (mis. \"botol\", \"kotak\").\n\n" +
    "Contoh valid: {\"totalCount\":12,\"items\":[{\"name\":\"botol\",\"count\":8,\"confidence\":0.95},{\"name\":\"kotak\",\"count\":4,\"confidence\":0.9}],\"description\":\"Beberapa botol di belakang terhalang, diestimasikan.\"}";

  // build payload once (will reuse)
  const basePayload = {
    contents: [
      {
        parts: [
          { text: promptText },
          { inlineData: { mimeType: "image/jpeg", data: raw } }
        ]
      }
    ]
  };

  // try models in order
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(basePayload),
        muteHttpExceptions: true
      };

      const resp = UrlFetchApp.fetch(url, options);
      const code = resp.getResponseCode();
      const body = resp.getContentText();

      Logger.log(`scanPhoto try model=${model} status=${code}`);

      if (code !== 200) {
        Logger.log(`scanPhoto model=${model} failed: ${body}`);
        // jika 404 atau model not supported -> coba model berikutnya
        if (code === 404 || code === 400) {
          continue;
        }
        // untuk error lain (401, 403, 429) kembalikan error langsung
        return JSON_RESPONSE({ status: 'error', message: `Gemini API error (${code})`, details: body, meta: { triedModel: model } });
      }

      // parse response
      let json;
      try {
        json = JSON.parse(body);
      } catch (e) {
        Logger.log("scanPhoto parse JSON error: " + String(e));
        return JSON_RESPONSE({ status: 'error', message: 'Response tidak dapat di-parse', details: body, meta: { usedModel: model } });
      }

      // get text content
      if (!json.candidates || !json.candidates[0] || !json.candidates[0].content || !json.candidates[0].content.parts) {
        Logger.log('scanPhoto unexpected response shape: ' + body);
        return JSON_RESPONSE({ status: 'error', message: 'Response Gemini tidak berisi candidates/content', details: body, meta: { usedModel: model } });
      }

      let replyText = json.candidates[0].content.parts[0].text || '';
      replyText = replyText.replace(/```json/g, '').replace(/```/g, '').trim();

      // try parse JSON from replyText
      let parsed = null;
      try {
        parsed = JSON.parse(replyText);
      } catch (e) {
        // try extract first {...} substring
        const m = replyText.match(/(\{[\s\S]*\})/);
        if (m && m[1]) {
          try { parsed = JSON.parse(m[1]); } catch (ee) { parsed = null; }
        }
      }

      if (!parsed) {
        // fallback safe response: return raw and zero items
        return JSON_RESPONSE({
          status: 'success',
          data: JSON.stringify({
            totalCount: 0,
            items: [],
            description: 'AI tidak mengembalikan JSON yang dapat diparse. Raw output included.',
            raw: replyText
          }),
          meta: { usedModel: model }
        });
      }

      // ensure shape
      if (typeof parsed.totalCount !== 'number') {
        parsed.totalCount = Array.isArray(parsed.items) ? parsed.items.reduce((s, it) => s + (Number(it.count) || 0), 0) : 0;
      }
      if (!Array.isArray(parsed.items)) parsed.items = [];
      if (typeof parsed.description !== 'string') parsed.description = '';

      return JSON_RESPONSE({
        status: 'success',
        data: JSON.stringify(parsed),
        meta: { usedModel: model }
      });

    } catch (err) {
      Logger.log("scanPhoto exception for model " + model + ": " + String(err));
      // try next model
      continue;
    }
  } // end for

  // no model worked -> log available models for debugging
  try {
    const listTxt = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, { muteHttpExceptions: true }).getContentText();
    Logger.log('ListModels (final): ' + listTxt);
  } catch (e) {
    Logger.log('ListModels failed on final attempt: ' + String(e));
  }

  return JSON_RESPONSE({ status: 'error', message: 'Tidak ada model yang berhasil dipanggil. Cek log ListModels di Executions.' });
}

/**
 * DELETE DATA (hapus baris berdasarkan ID pada Record & Backup, tidak menghapus file Drive)
 */
function deleteData(data) {
  try {
    const idToDelete = data.ID || data.id;
    if (!idToDelete) return JSON_RESPONSE({ status: 'error', message: 'ID tidak diberikan untuk penghapusan' });

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let totalDeleted = 0;
    const sheetNames = [SHEET_NAME, BACKUP_SHEET_NAME];

    sheetNames.forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      const values = sheet.getDataRange().getValues();
      if (values.length <= 1) return;
      const headers = values[0].map(h => String(h));
      const idColIndex = headers.findIndex(h => h.toUpperCase() === 'ID');
      if (idColIndex === -1) return;
      for (let r = values.length - 1; r >= 1; r--) {
        const cellVal = values[r][idColIndex];
        if (String(cellVal) === String(idToDelete)) {
          sheet.deleteRow(r + 1);
          totalDeleted++;
        }
      }
    });

    return JSON_RESPONSE({ status: 'success', message: `Deleted ${totalDeleted} row(s) for ID: ${idToDelete}`, deleted: totalDeleted });
  } catch (error) {
    console.error('Error in deleteData:', error);
    return JSON_RESPONSE({ status: 'error', message: 'Gagal hapus: ' + String(error) });
  }
}

/**
 * Helper: safe JSON response
 */
function JSON_RESPONSE(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * small helper: quickly check if a string looks like JSON
 */
function looksLikeJson(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

/**
 * TEST helper
 */
function testSaveData() {
  const testData = {
    ID: 'TEST-' + Math.floor(Math.random() * 1000),
    photoBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    ResultScan: 'Total: 1 (Test Item)',
    Notes: 'Data uji coba dari editor.'
  };
  const response = saveData(testData);
  Logger.log('Response: ' + response.getContent());
}

/**
 * FUNCTION CEK GEMINI API
 * Jalankan manual dari Apps Script untuk melihat apakah API bekerja
 */
function checkGeminiAPI() {

  Logger.log("===== CHECK GEMINI API START =====");

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

  if (!apiKey) {
    Logger.log("❌ GEMINI_API_KEY tidak ditemukan di Script Properties");
    return;
  }

  Logger.log("✅ API KEY ditemukan");

  try {

    // ===============================
    // 1. CEK LIST MODELS
    // ===============================
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    const listResponse = UrlFetchApp.fetch(listUrl, {
      method: "get",
      muteHttpExceptions: true
    });

    Logger.log("ListModels Status: " + listResponse.getResponseCode());
    Logger.log("ListModels Response:");
    Logger.log(listResponse.getContentText());


    // ===============================
    // 2. TEST GENERATE CONTENT
    // ===============================
    const model = "gemini-1.5-flash-001";

    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: "Jawab singkat: Apa ibu kota Indonesia?"
            }
          ]
        }
      ]
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const testResponse = UrlFetchApp.fetch(testUrl, options);

    Logger.log("GenerateContent Status: " + testResponse.getResponseCode());
    Logger.log("GenerateContent Response:");
    Logger.log(testResponse.getContentText());

  } catch (error) {

    Logger.log("❌ ERROR:");
    Logger.log(error.toString());

  }

  Logger.log("===== CHECK GEMINI API END =====");
}
/**
 * FUNCTION CEK GEMINI API
 * Jalankan manual dari editor → Run → checkGemini
 */
function checkGemini() {

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

  if (!apiKey) {
    Logger.log("❌ GEMINI_API_KEY tidak ditemukan di Script Properties");
    return;
  }

  Logger.log("✅ API KEY ditemukan");

  // =========================
  // 1. CEK LIST MODELS
  // =========================

  try {

    const listUrl =
      "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey;

    const listResp = UrlFetchApp.fetch(listUrl, {
      method: "get",
      muteHttpExceptions: true,
    });

    Logger.log("===== LIST MODELS =====");
    Logger.log(listResp.getContentText());

  } catch (err) {

    Logger.log("❌ ERROR LIST MODELS");
    Logger.log(err.toString());

  }


  // =========================
  // 2. TEST CALL GEMINI
  // =========================

  try {

    const model = "gemini-1.5-flash-001";

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent?key=" +
      apiKey;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: "Balas dengan kata OK saja"
            }
          ]
        }
      ]
    };

    const resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    Logger.log("===== TEST GEMINI =====");
    Logger.log("Status: " + resp.getResponseCode());
    Logger.log(resp.getContentText());

  } catch (err) {

    Logger.log("❌ ERROR TEST GEMINI");
    Logger.log(err.toString());

  }

}

