const https = require('https');
require('dotenv').config({path: './server/.env'});
(async () => {
  const tokenUrl = 'https://public-api.kiwify.com/v1/oauth/token';
  const credentials = Buffer.from(process.env.KIWIFY_CLIENT_ID + ':' + process.env.KIWIFY_CLIENT_SECRET).toString('base64');
  
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  
  const today = new Date();
  today.setDate(today.getDate() - 1);
  const startDate = today.toISOString().split('T')[0] + ' 00:00';
  
  const salesUrl = `https://public-api.kiwify.com/v1/sales?start_date=${encodeURIComponent(startDate)}&customer_email=pedroocferreira@gmail.com`;
  
  const salesRes = await fetch(salesUrl, {
    headers: { 'Authorization': `Bearer ${token}`, 'x-kiwify-account-id': process.env.KIWIFY_ACCOUNT_ID }
  });
  const data = await salesRes.text();
  console.log(data);
})();
