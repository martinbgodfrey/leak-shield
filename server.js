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

// CAPTURE ENDPOINT (Updated with Cookie Injection + Popup Killers)
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        });

        // 1. INJECT VERIFICATION COOKIES (Bypasses Age Gate instantly)
        if (url.includes('pornhub')) {
            await context.addCookies([
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
            ]);
        }
        if (url.includes('xvideos')) {
             await context.addCookies([
                { name: 'adult_concept', value: '1', domain: '.xvideos.com', path: '/' }
            ]);
        }

        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // 2. BACKUP CLICKERS (If cookies fail)
        try {
            if (source === 'Pornhub') {
                await page.click('text="I am 18 or older - Enter"', { timeout: 2000 }).catch(() => {});
                await page.click('#accessAgeDisclaimerPHBtn', { timeout: 2000 }).catch(() => {});
            } 
            else if (source === 'XVideos') {
                // Click the specific Red "Enter" button or "Straight" box
                await page.click('.disclaimer-btn', { timeout: 2000 }).catch(() => {});
                await page.click('text="ENTER - I am 18 years old or older"', { timeout: 2000 }).catch(() => {});
                await page.click('#disclaimer_btn_enter', { timeout: 2000 }).catch(() => {});
            }
            await page.waitForTimeout(1500); // Let popup fade
        } catch(e) { console.log("   Popup logic skipped."); }

        // 3. Take Screenshot
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        
        // Upload Background
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;
        uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID).catch(e => {});

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