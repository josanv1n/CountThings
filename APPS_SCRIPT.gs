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
 * Untuk memberikan izin akses penuh (Baca & Tulis) ke Google Drive dan Spreadsheet.
 */
function triggerPermissions() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Memaksa permintaan izin 'Tulis' dengan membuat file dummy lalu menghapusnya
  const dummyFile = folder.createFile('izin_test.txt', 'test');
  dummyFile.setTrashed(true);
  
  Logger.log('Izin BACA & TULIS berhasil diberikan untuk Folder: ' + folder.getName());
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
    // Menggunakan casing sesuai yang dikirim dari Frontend (ID, ResultScan, dll)
    const id = data.ID || data.id; 
    if (!id) {
      throw new Error('ID tidak ditemukan. Pastikan data dikirim dengan benar.');
    }
    
    console.log('Starting saveData for ID:', id);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. Upload Foto ke Google Drive
    console.log('Uploading photo to Drive...');
    const photoUrl = saveFileToDrive(data.photoBase64, id);
    console.log('Photo uploaded, URL:', photoUrl);

    // 2. Siapkan Data Baris (Sesuai Header Baru Anda)
    const timestamp = new Date();
    const formattedDate = Utilities.formatDate(timestamp, "Asia/Jakarta", "MM/dd/yyyy HH:mm:ss");
    
    // Urutan: ID, Timestamp, photoBase64, ResultScan, Notes
    const rowData = [
      id,
      formattedDate,
      photoUrl,
      data.ResultScan || data.resultScan,
      data.Notes || data.notes
    ];

    // 3. Simpan ke Sheet Record
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['ID', 'Timestamp', 'photoBase64', 'ResultScan', 'Notes']);
    }
    sheet.appendRow(rowData);

    // 4. Simpan ke Sheet Backup
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
    ID: 'TEST-' + Math.floor(Math.random() * 1000),
    photoBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    ResultScan: 'Total: 1 (Test Item)',
    Notes: 'Data uji coba dari editor.'
  };
  const response = saveData(testData);
  Logger.log('Response: ' + response.getContent());
}

function saveFileToDrive(base64Data, fileName) {
  const timestamp = new Date().getTime();
  const folder = DriveApp.getFolderById(FOLDER_ID);
  
  const parts = base64Data.split(',');
  const contentType = parts[0].substring(5, parts[0].indexOf(';'));
  const rawData = parts[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(rawData), contentType, `Count_${fileName}_${timestamp}.jpg`);
  
  const file = folder.createFile(blob);
  
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    console.warn("Gagal set sharing: " + e.toString());
  }
  
  // Direct link agar bisa tampil di aplikasi
  return "https://lh3.googleusercontent.com/d/" + file.getId();
}

function getHistory() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) return JSON_RESPONSE({ status: 'success', data: [] });

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return JSON_RESPONSE({ status: 'success', data: [] });

    const headers = values[0];
    const rows = values.slice(1);
    
    // Mapping dinamis berdasarkan nama header di Sheet
    const history = rows.map(row => {
      let obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    }).reverse();

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
