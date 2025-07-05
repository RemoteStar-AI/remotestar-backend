const fetch = require('node-fetch');

const URLS = [
  'https://remotestar-backend.onrender.com/',
  'https://remotestar-backend-7unh.onrender.com',
  'https://remotestar-backend-testing.onrender.com'
];

async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.text();
    console.log(`[${new Date().toLocaleTimeString()}] Pinged ${url}:`, data);
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Error pinging ${url}:`, error.message);
  }
}

function pingAll() {
  URLS.forEach(fetchData);
}

pingAll();
