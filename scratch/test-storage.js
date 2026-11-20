const fs = require('fs');
const content = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of content.split(/\r?\n/)) {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) {
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
}

const { createClient } = require('@supabase/supabase-js');
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(url, key);

async function run() {
  const buffer = Buffer.from('test hello world');
  const { data, error } = await sb.storage.from('media').upload('test.txt', buffer, { upsert: true });
  console.log('Upload:', data, 'Error:', error);
  const { data: pub } = sb.storage.from('media').getPublicUrl('test.txt');
  console.log('Public URL:', pub.publicUrl);
}
run();
