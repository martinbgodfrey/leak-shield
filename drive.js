const { google } = require('googleapis');
const stream = require('stream');

// SANITIZE KEY: Replaces literal "\n" strings with actual newlines
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
        console.log("⚠️ Google Drive credentials missing. Skipping upload.");
        return;
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
