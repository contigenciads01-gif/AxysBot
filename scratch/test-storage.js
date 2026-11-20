const fs = require('fs');
const content = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of content.split(/\r?\n/)) {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) {
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
}

const { createClient } = require('@supabase/supabase-js');
const sbAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testSigned() {
  const { data, error } = await sbAdmin.storage.from('media').createSignedUploadUrl('test_signed.png');
  console.log('Signed upload URL result:', data, 'Error:', error);
}
testSigned();
