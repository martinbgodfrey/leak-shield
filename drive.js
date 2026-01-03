const { google } = require('googleapis');
const stream = require('stream');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function uploadScreenshot(screenshotBuffer, filename, folderId) {
    try {
        // Authenticate using the variables we set in Railway
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_EMAIL,
                private_key: process.env.GOOGLE_KEY.replace(/\\n/g, '\n'), // Fix formatting
            },
            scopes: SCOPES,
        });

        const drive = google.drive({ version: 'v3', auth });
        const bufferStream = new stream.PassThrough();
        bufferStream.end(screenshotBuffer);

        const response = await drive.files.create({
            media: { mimeType: 'image/png', body: bufferStream },
            requestBody: {
                name: filename,
                parents: [folderId], // Upload to your specific folder
            },
        });

        console.log(`✅ Evidence Uploaded to Drive: ${response.data.name}`);
        return true;
    } catch (error) {
        console.error("❌ Drive Upload Failed:", error.message);
        return false;
    }
}

module.exports = { uploadScreenshot };