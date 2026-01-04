const express = require('express');
const { scanKeywords } = require('./scraper');
const { chromium } = require('playwright');
const { uploadScreenshot } = require('./drive');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// --- SEARCH ENDPOINT ---
app.post('/scan', async (req, res) => {
    const { keywords } = req.body;
    try {
        console.log(`🔎 Incoming Scan: ${keywords}`);
        const results = await scanKeywords(keywords);
        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- CAPTURE ENDPOINT (The "Nuclear" Popup Killer) ---
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
             viewport: { width: 1280, height: 720 }
        });

        // 1. INJECT COOKIES (The "VIP Pass")
        // These tell the server "I am already 18"
        const cookies = [];
        if (url.includes('pornhub')) {
            cookies.push(
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'il', value: '1', domain: '.pornhub.com', path: '/' }
            );
        } else if (url.includes('xvideos') || url.includes('xnxx')) {
             cookies.push(
                { name: 'adult_concept', value: '1', domain: '.xvideos.com', path: '/' },
                { name: 'adult_concept', value: '1', domain: '.xnxx.com', path: '/' }
            );
        }
        await context.addCookies(cookies);

        const page = await context.newPage();

        // 2. LOAD PAGE
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch(e) {
            console.log("   Page load timeout (continuing anyway)...");
        }
        
        // 3. FORCE CLICKERS (The "Brute Force")
        // If cookies fail, we click the buttons manually.
        try {
            if (source === 'Pornhub') {
                await page.click('#accessAgeDisclaimerPHBtn', { timeout: 1500 }).catch(() => {});
                await page.click('text="I am 18 or older - Enter"', { timeout: 1500 }).catch(() => {});
                // Removes the disclaimer overlay entirely if it exists
                await page.evaluate(() => {
                    const overlay = document.getElementById('age-verification-container');
                    if(overlay) overlay.remove();
                });
            } 
            else if (source === 'XVideos') {
                await page.click('.disclaimer-btn', { timeout: 1500 }).catch(() => {});
                await page.click('#disclaimer_btn_enter', { timeout: 1500 }).catch(() => {});
                await page.click('text="Enter"', { timeout: 1500 }).catch(() => {});
            }
            else if (source === 'XNXX') {
                await page.click('#disclaimer-block a', { timeout: 1500 }).catch(() => {});
                await page.click('text="Enter"', { timeout: 1500 }).catch(() => {});
            }
            
            // Wait for any animations to clear
            await page.waitForTimeout(1000);
            
        } catch(e) { console.log("   Popup logic skipped or unnecessary."); }

        // 4. SCREENSHOT
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;

        // Upload to Drive in Background
        uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID)
            .catch(e => console.log(`   Drive Upload Error: ${e.message}`));

        await browser.close();
        res.json({ success: true, image: `data:image/png;base64,${base64Image}`, filename });

    } catch (error) {
        console.error("Capture Fatal Error:", error);
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
