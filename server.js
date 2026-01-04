// server.js
const express = require('express');
const { scanKeywords } = require('./scraper');
const { chromium } = require('playwright');
const { uploadScreenshot } = require('./drive');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// SEARCH ENDPOINT
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

// CAPTURE ENDPOINT (Updated with "Popup Killer")
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'] 
        });
        
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        
        // 1. Load Page
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        
        // 2. POPUP KILLER LOGIC
        try {
            if (source === 'Pornhub') {
                // Click "I am 18 or older" or "Enter"
                await page.click('#accessAgeDisclaimerPHBtn', { timeout: 2500 }).catch(() => {});
                await page.click('text="I am 18 or older"', { timeout: 2500 }).catch(() => {});
            } 
            else if (source === 'XNXX') {
                // Click the generic "Enter" or "Straight" button
                await page.click('.btn-danger', { timeout: 2000 }).catch(() => {});
                await page.click('text="Enter"', { timeout: 2000 }).catch(() => {});
            }
            // Wait for modal to fade
            await page.waitForTimeout(1000);
        } catch(e) { console.log("   Popup logic skipped."); }

        // 3. Take Screenshot
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;
        uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID)
            .catch(e => console.log(`   (Background) Drive Upload Skipped: ${e.message}`));

        await browser.close();
        res.json({ success: true, image: `data:image/png;base64,${base64Image}`, filename });

    } catch (error) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});