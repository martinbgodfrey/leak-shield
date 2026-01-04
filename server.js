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

// --- CAPTURE ENDPOINT (Fixed for Pornhub + Preserves Others) ---
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        
        // 1. SETUP BROWSER (High Res)
        // REMOVED: 'Referer': 'https://www.google.com/' (This caused the PH Redirect)
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
             viewport: { width: 1920, height: 1080 },
             deviceScaleFactor: 1,
             extraHTTPHeaders: {
                 'Accept-Language': 'en-US,en;q=0.9'
             }
        });

        // 2. INJECT COOKIES (Restored "il" cookie for PH)
        const cookies = [];
        if (url.includes('reddit')) {
            cookies.push({ name: 'over18', value: '1', domain: '.reddit.com', path: '/' });
        }
        
        // Re-added the 'il' cookie which helps PH stay on the video page
        if (url.includes('pornhub')) {
            cookies.push(
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'il', value: '1', domain: '.pornhub.com', path: '/' }
            );
        }

        await context.addCookies(cookies);
        const page = await context.newPage();

        // 3. LOAD PAGE
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch(e) { console.log("   Page load timeout (continuing)..."); }
        
        // 4. INTERACTION LOGIC (Preserved from previous success)
        try {
            // --- REDDIT: Expand Image ---
            if (url.includes('reddit')) {
                await page.click('div[data-test-id="post-content"] img', { timeout: 1500 }).catch(() => {});
                await page.click('a[href*="i.redd.it"]', { timeout: 1000 }).catch(() => {});
            }

            // --- TUBE SITES: Nuclear Clicker (Kept for XNXX/XVideos) ---
            if (url.includes('xnxx') || url.includes('xvideos') || url.includes('pornhub')) {
                console.log("   Running Tube Bypass...");
                const selectors = [
                    '#disclaimer_btn_enter',
                    '#disclaimer-block a', 
                    '.disclaimer-btn',
                    'button:has-text("Enter")',
                    'a:has-text("Enter")',
                    'button:has-text("I am 18")',
                    'a:has-text("I am 18")'
                ];
                for (const sel of selectors) {
                    if (await page.$(sel)) {
                        await page.click(sel).catch(()=>{});
                    }
                }
            }
            
            await page.waitForTimeout(2000); 

            // --- ZOOM (80%) ---
            await page.evaluate(() => { document.body.style.zoom = "0.8"; });

        } catch(e) { console.log("Interaction Error:", e.message); }

        // 5. CAPTURE
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
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
