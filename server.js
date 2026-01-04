const express = require('express');
const { scanKeywords } = require('./scraper');
const { chromium } = require('playwright');
const { uploadScreenshot } = require('./drive');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' })); // Increased limit for images

// 1. SEARCH ENDPOINT
app.post('/scan', async (req, res) => {
    const { keywords } = req.body;
    try {
        console.log(`Incoming Scan Request: ${keywords}`);
        const results = await scanKeywords(keywords);
        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. CAPTURE ENDPOINT (Returns Image + Uploads to Drive)
app.post('/capture', async (req, res) => {
    const { url, source, title } = req.body;
    console.log(`📸 Manual Capture Requested: ${url}`);
    
    let browser;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const page = await browser.newPage();
        
        // Anti-detect settings
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        });

        if (source === 'Pornhub') {
            await page.context().addCookies([
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
            ]);
        }

        await page.goto(url, { waitUntil: 'load', timeout: 25000 });
        
        // Take Screenshot
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64'); // Convert to string for browser
        
        // Upload to Drive (Background Backup)
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;
        let driveId = null;
        try {
             driveId = await uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID);
        } catch(e) {
             console.log("Drive upload skipped or failed (User still gets local download).");
        }
        
        await browser.close();
        
        // Return image data to frontend
        res.json({ 
            success: true, 
            driveId: driveId, 
            image: `data:image/png;base64,${base64Image}`,
            filename: filename 
        });

    } catch (error) {
        if (browser) await browser.close();
        console.error("Capture Failed:", error.message);
        res.status(500).json({ success: false, error: "Capture failed: " + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
