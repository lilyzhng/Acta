import fs from 'fs';

/**
 * Upload a file to uguu.se (temporary file hosting)
 * Returns the public URL of the uploaded file
 */
export async function uploadToUguu(filePath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = filePath.split('/').pop() || 'audio.mp3';

  const formData = new FormData();
  formData.append('files[]', new Blob([fileBuffer]), fileName);

  const res = await fetch('https://uguu.se/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].url;
  }

  throw new Error(`Upload response missing URL: ${JSON.stringify(data)}`);
}
