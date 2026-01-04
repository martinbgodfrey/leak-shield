const { google } = require('googleapis');
const stream = require('stream');

// --- DEBUG CHECK ---
if (!process.env.GOOGLE_CLIENT_EMAIL) console.error("⚠️  MISSING: GOOGLE_CLIENT_EMAIL environment variable");
if (!process.env.GOOGLE_PRIVATE_KEY) console.error("⚠️  MISSING: GOOGLE_PRIVATE_KEY environment variable");
else console.log("✅ Google Credentials detected in environment.");
// -------------------

// SANITIZE KEY
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY 
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : null;

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: PRIVATE_KEY, 
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

async function uploadScreenshot(screenshotBuffer, fileName, folderId) {
    if (!PRIVATE_KEY || !process.env.GOOGLE_CLIENT_EMAIL) {
        console.log("⚠️ Google Drive credentials missing (Check Variables). Skipping upload.");
        return null;
    }

    try {
        const bufferStream = new stream.PassThrough();
        bufferStream.end(screenshotBuffer);

        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [folderId], 
            },
            media: {
                mimeType: 'image/png',
                body: bufferStream,
            },
        });

        console.log(`✅ Uploaded to Drive: ${fileName} (ID: ${response.data.id})`);
        return response.data.id;
    } catch (error) {
        console.error("❌ Drive Upload Failed:", error.message);
        throw error; 
    }
}

module.exports = { uploadScreenshot };
