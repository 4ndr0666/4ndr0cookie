(async () => {
  try {
    const result = await chrome.storage.local.get(['emailGroups']);
    console.log('--- DATA BACKUP ---');
    console.log(JSON.stringify(result.emailGroups, null, 2));
    console.log('--- END DATA BACKUP ---');
  } catch (error) {
    console.error('Error backing up data:', error);
  }
})();
