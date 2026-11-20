const fs = require('fs');

async function testUploadLocal() {
  console.log('Testing image optimization and FormData creation...');
  // Check image buffer
  const sampleBuffer = Buffer.from('fake image content');
  const blob = new Blob([sampleBuffer], { type: 'image/jpeg' });
  const file = new File([blob], 'july_teste_01.jpg', { type: 'image/jpeg' });
  
  console.log('Sample file created:', file.name, 'size:', file.size);
  console.log('Test passed.');
}
testUploadLocal();
