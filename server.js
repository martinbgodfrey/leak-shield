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
    const { keywords, extraSubs } = req.body;
    try {
        console.log(`🔎 Scan: ${keywords} | Extra Subs: ${extraSubs || 'None'}`);
        const results = await scanKeywords(keywords, extraSubs || []);
        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- CAPTURE ENDPOINT (Updated: Full Page + Harder Tube Bypass) ---
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        
        // Use a TALLER viewport by default
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
             viewport: { width: 1280, height: 1080 } 
        });

        // 1. INJECT COOKIES
        const cookies = [];
        
        // Reddit Bypass
        if (url.includes('reddit.com')) {
            cookies.push({ name: 'over18', value: '1', domain: '.reddit.com', path: '/' });
        }
        
        // Tube Site Bypass Cookies
        if (url.includes('pornhub')) {
            cookies.push(
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'il', value: '1', domain: '.pornhub.com', path: '/' }
            );
        } else if (url.includes('xvideos') || url.includes('xnxx')) {
             // Force standard "adult_concept" approval
             cookies.push(
                { name: 'adult_concept', value: '1', domain: '.xvideos.com', path: '/' },
                { name: 'adult_concept', value: '1', domain: '.xnxx.com', path: '/' },
                { name: 'warning-agreed', value: '1', domain: '.xvideos.com', path: '/' }
            );
        }
        await context.addCookies(cookies);

        const page = await context.newPage();

        // 2. LOAD PAGE
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch(e) { console.log("   Page load timeout (continuing)..."); }
        
        // 3. NUCLEAR CLICKER (For when cookies fail)
        try {
            if (url.includes('reddit')) {
                // Click Reddit "Yes" buttons
                await page.click('button:has-text("Yes")', { timeout: 1500 }).catch(() => {});
                await page.click('button:has-text("Continue")', { timeout: 1500 }).catch(() => {});
            }
            else if (source === 'XVideos' || url.includes('xvideos')) {
                // Click "Enter" / "I am 18"
                console.log("   Attempting XVideos bypass click...");
                await page.click('#disclaimer_btn_enter', { timeout: 2000 }).catch(() => {});
                await page.click('.disclaimer-btn', { timeout: 2000 }).catch(() => {});
                await page.click('a.leaf-btn', { timeout: 2000 }).catch(() => {});
            }
            else if (source === 'XNXX' || url.includes('xnxx')) {
                // Click XNXX "Enter"
                console.log("   Attempting XNXX bypass click...");
                await page.click('#disclaimer-block a', { timeout: 2000 }).catch(() => {});
                await page.click('.btn-danger', { timeout: 2000 }).catch(() => {});
            }
            else if (source === 'Pornhub') {
                await page.click('#accessAgeDisclaimerPHBtn', { timeout: 1500 }).catch(() => {});
                await page.click('text="I am 18 or older - Enter"', { timeout: 1500 }).catch(() => {});
            }
            
            // Wait a tiny bit for the splash screen to fade
            await page.waitForTimeout(1500);

        } catch(e) {}

        // 4. SCREENSHOT (Changed to FULL PAGE)
        // This ensures it captures the whole scrollable area, fixing the "cut off" issue
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        
        const base64Image = screenshotBuffer.toString('base64');
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;

        // Upload to Drive
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
