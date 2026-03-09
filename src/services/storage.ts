export async function saveToGoogleSheets(webAppUrl: string, data: any) {
  try {
    const response = await fetch(webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Apps Script handles POST better with text/plain to avoid CORS preflight
      },
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error saving to Sheets:", error);
    throw error;
  }
}

export async function fetchHistory(webAppUrl: string) {
  try {
    const response = await fetch(`${webAppUrl}?action=GET_HISTORY`);
    const json = await response.json();
    if (json.status === 'success') {
      return json.data;
    }
    throw new Error(json.message || 'Gagal mengambil riwayat');
  } catch (error) {
    console.error("Error fetching history:", error);
    throw error;
  }
}
