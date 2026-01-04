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

// 2. CAPTURE ENDPOINT (Fixed "Stuck" Issue)
app.post('/capture', async (req, res) => {
    const { url, source, title } = req.body;
    console.log(`📸 Manual Capture Requested: ${url}`);
    
    let browser = null;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();

        // 1. Anti-Detect: Set Cookies for Pornhub
        if (source === 'Pornhub') {
            await context.addCookies([
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
            ]);
        }

        // 2. Load Page (Aggressive Timeout to prevent hanging)
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        
        // 3. Take Screenshot
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        
        // 4. Background Upload (Non-blocking)
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;
        uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID)
            .then(id => console.log(`   (Background) Drive Upload ID: ${id}`))
            .catch(e => console.log(`   (Background) Drive Upload Failed: ${e.message}`));

        // 5. Success Response
        res.json({ 
            success: true, 
            image: `data:image/png;base64,${base64Image}`,
            filename: filename 
        });

    } catch (error) {
        console.error("❌ Capture Failed:", error.message);
        res.status(500).json({ success: false, error: "Capture failed: " + error.message });
    } finally {
        // 6. FORCE CLOSE BROWSER (Crucial Fix)
        if (browser) {
            await browser.close();
            console.log("   Browser closed. Ready for next capture.");
        }
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
