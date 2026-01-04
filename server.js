const express = require('express');
const { scanKeywords } = require('./scraper');
const { chromium } = require('playwright');
const { uploadScreenshot } = require('./drive');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

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

// 2. CAPTURE ENDPOINT (Atomic & isolated)
app.post('/capture', async (req, res) => {
    const { url, source, title } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        // Launch a fresh browser for EVERY request (prevents "stuck" state)
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'] 
        });
        
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();

        // Hard timeout of 20 seconds. If it takes longer, it dies.
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        
        // Background Upload
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;
        uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID)
            .catch(e => console.log(`   (Background) Drive Upload Skipped: ${e.message}`));

        // KILL BROWSER IMMEDIATELY
        await browser.close();
        browser = null;

        res.json({ 
            success: true, 
            image: `data:image/png;base64,${base64Image}`,
            filename: filename 
        });

    } catch (error) {
        console.error("❌ Capture Failed:", error.message);
        // Ensure browser is dead
        if (browser) await browser.close(); 
        res.status(500).json({ success: false, error: "Capture failed: " + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
