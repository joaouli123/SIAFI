const https = require('https');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        let parsed = responseBody;
        try { parsed = JSON.parse(responseBody); } catch {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  const loginRes = await request({
    hostname: 'backend-production-0b49.up.railway.app',
    port: 443,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { identificador: 'adm', password: 'Siafi@1234' });

  const token = loginRes.body.accessToken;

  const supabaseHeaders = {
    'Content-Type': 'application/json',
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvam1zb2Jkd2lkcWZjYm1zY2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMzU1MzAsImV4cCI6MjA4NDcxMTUzMH0.ROV5kzd7qpbNdU_Jctohq3yaNmyyylPp7cKfI5HW3YU',
    'Authorization': `Bearer ${token}`
  };

  const enrollRes = await request({
    hostname: 'eojmsobdwidqfcbmscag.supabase.co',
    port: 443,
    path: '/auth/v1/factors',
    method: 'POST',
    headers: supabaseHeaders
  }, {
    factor_type: 'totp',
    issuer: 'SIAFI',
    friendly_name: 'SIAFI Authenticator ' + Date.now(),
  });

  console.log('Enroll status:', enrollRes.status);
  if (enrollRes.body && enrollRes.body.totp) {
    console.log('secret:', enrollRes.body.totp.secret);
    console.log('qr_code starts with:', enrollRes.body.totp.qr_code.substring(0, 100));
    console.log('qr_code full length:', enrollRes.body.totp.qr_code.length);
    console.log('qr_code contains raw SVG tags:', enrollRes.body.totp.qr_code.includes('<svg'));
  } else {
    console.log('Body:', enrollRes.body);
  }
}

run();
