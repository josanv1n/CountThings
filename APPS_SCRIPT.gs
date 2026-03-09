/**
 * GOOGLE APPS SCRIPT FOR COUNTTHINGS APP
 * 
 * PENGATURAN PENTING:
 * 1. Buka Project Settings (ikon roda gigi ⚙️) di sidebar kiri.
 * 2. Gulir ke "Script Properties".
 * 3. Tambahkan property baru:
 *    - Property: GEMINI_API_KEY
 *    - Value: (Tempel API Key Gemini Anda di sini)
 * 4. Klik "Save script properties".
 * 5. JALANKAN MANUAL: Pilih fungsi 'triggerPermissions' di atas dan klik 'Run' untuk memberikan izin Drive.
 */

const SPREADSHEET_ID = '1audwZ-_kusPpKZ4JvUOj5-IE0EOpnCaKbEJos6FKNTw';
const FOLDER_ID = '1hxYHUgBvFORzhqm8govhNivb_e34gDVE';
const SHEET_NAME = 'Record';
const BACKUP_SHEET_NAME = 'Backup';

/**
 * JALANKAN INI SEKALI SECARA MANUAL (Klik tombol 'Run' di atas)
 * Untuk memberikan izin akses ke Google Drive dan Spreadsheet.
 */
function triggerPermissions() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log('Izin berhasil diberikan untuk Folder: ' + folder.getName());
  Logger.log('Izin berhasil diberikan untuk Spreadsheet: ' + ss.getName());
}

function doGet(e) {
  // Tambahkan pengecekan ini di baris paling atas doGet agar tidak error saat dijalankan manual
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

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'SAVE_DATA') {
      return saveData(data);
    } else if (action === 'SCAN_PHOTO') {
      return scanPhoto(data.image);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Invalid action'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function saveData(data) {
  try {
    if (!data || !data.id) {
      throw new Error('Data tidak lengkap atau fungsi dijalankan manual tanpa parameter. Gunakan fungsi testSaveData untuk uji coba.');
    }
    console.log('Starting saveData for ID:', data.id);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['ID', 'Timestamp', 'photoBase64 (Link)', 'Result Scan', 'Notes']);
    }

    // 1. Upload Foto ke Google Drive
    console.log('Uploading photo to Drive...');
    const photoUrl = saveFileToDrive(data.photoBase64, data.id);
    console.log('Photo uploaded, URL:', photoUrl);

    // 2. Simpan ke Spreadsheet
    const timestamp = new Date();
    const rowData = [
      data.id,
      timestamp,
      photoUrl,
      data.resultScan,
      data.notes
    ];

    sheet.appendRow(rowData);
    console.log('Row appended to Record sheet');

    // 3. Simpan ke Backup Sheet
    let backupSheet = ss.getSheetByName(BACKUP_SHEET_NAME);
    if (!backupSheet) {
      backupSheet = ss.insertSheet(BACKUP_SHEET_NAME);
      backupSheet.appendRow(['ID', 'Timestamp', 'photoBase64 (Link)', 'Result Scan', 'Notes']);
    }
    backupSheet.appendRow(rowData);
    console.log('Row appended to Backup sheet');

    return JSON_RESPONSE({
      status: 'success',
      message: 'Data berhasil disimpan',
      data: { id: data.id, photoUrl: photoUrl }
    });
  } catch (error) {
    console.error('Error in saveData:', error);
    return JSON_RESPONSE({
      status: 'error',
      message: 'Gagal simpan: ' + error.toString()
    });
  }
}

/**
 * FUNGSI TEST: Gunakan ini untuk mencoba simpan data dari editor Apps Script.
 */
function testSaveData() {
  const testData = {
    id: 'TEST-' + Math.floor(Math.random() * 1000),
    photoBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    resultScan: 'Total: 1 (Test Item)',
    notes: 'Ini adalah data uji coba dari editor Apps Script.'
  };
  const response = saveData(testData);
  Logger.log(response.getContentText());
}

function saveFileToDrive(base64Data, fileName) {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const parts = base64Data.split(',');
  const contentType = parts[0].substring(5, parts[0].indexOf(';'));
  const bytes = Utilities.base64Decode(parts[1]);
  const blob = Utilities.newBlob(bytes, contentType, fileName + ".jpg");
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  // Format URL direct link agar bisa tampil di app
  return "https://lh3.googleusercontent.com/d/" + file.getId();
}

function getHistory() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) return JSON_RESPONSE({ status: 'success', data: [] });

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return JSON_RESPONSE({ status: 'success', data: [] });

    const rows = values.slice(1);
    const history = rows.map(row => ({
      id: row[0],
      timestamp: row[1],
      photoUrl: row[2],
      resultScan: row[3],
      notes: row[4]
    })).reverse();

    return JSON_RESPONSE({
      status: 'success',
      data: history.slice(0, 20)
    });
  } catch (error) {
    return JSON_RESPONSE({ status: 'error', message: error.toString() });
  }
}

function JSON_RESPONSE(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function scanPhoto(base64Image) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found in Script Properties');
  }

  const modelName = "gemini-flash-latest"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{
      parts: [
        { text: "Tolong hitung semua objek dalam gambar ini. Berikan jawaban dalam format JSON murni tanpa markdown: { \"totalCount\": number, \"items\": [ { \"name\": string, \"count\": number } ], \"description\": string }. Gunakan Bahasa Indonesia." },
        { inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] } }
      ]
    }]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true 
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(`Gemini API Error (${responseCode}): ${responseText}`);
  }

  const json = JSON.parse(responseText);
  
  if (!json.candidates || !json.candidates[0] || !json.candidates[0].content) {
    throw new Error("Format respons Gemini tidak sesuai");
  }

  let text = json.candidates[0].content.parts[0].text;
  // Membersihkan jika model memberikan format ```json ... ```
  const jsonString = text.replace(/```json|```/g, "").trim();

  return JSON_RESPONSE({
    status: 'success',
    data: jsonString
  });
}
