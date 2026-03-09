export async function saveToGoogleSheets(webAppUrl: string, data: any) {
  try {
    const response = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error("Error saving to Sheets:", error);
    if (error.message === 'Failed to fetch') {
      throw new Error('Gagal terhubung ke Google Apps Script. Pastikan URL benar dan sudah di-deploy sebagai "Anyone".');
    }
    throw error;
  }
}

export async function scanPhotoViaProxy(webAppUrl: string, imageData: string) {
  try {
    const response = await fetch(webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'SCAN_PHOTO',
        image: imageData
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error("Error scanning via proxy:", error);
    if (error.message === 'Failed to fetch') {
      throw new Error('Gagal terhubung ke Google Apps Script. Pastikan URL benar dan sudah di-deploy sebagai "Anyone".');
    }
    throw error;
  }
}

export async function fetchHistory(webAppUrl: string) {
  try {
    const response = await fetch(`${webAppUrl}?action=GET_HISTORY`, {
      mode: 'cors'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    if (json.status === 'success') {
      return json.data;
    }
    throw new Error(json.message || 'Gagal mengambil riwayat');
  } catch (error: any) {
    console.error("Error fetching history:", error);
    if (error.message === 'Failed to fetch') {
      throw new Error('Gagal mengambil riwayat. Cek koneksi atau URL Apps Script.');
    }
    throw error;
  }
}
