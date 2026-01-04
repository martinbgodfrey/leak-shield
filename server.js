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
        console.log(`🔎 Scan: ${keywords} | Extra Subs: ${extraSubs || 
'None'}`);
        const results = await scanKeywords(keywords, extraSubs || []);
        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- CAPTURE ENDPOINT (Fix: Expand Images + Force Verify) ---
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', 
'--disable-dev-shm-usage'] 
        });
        
        // 1. SETUP BROWSER (1920x1080 for high res)
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) 
AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
             viewport: { width: 1920, height: 1080 },
             deviceScaleFactor: 1 
        });

        // 2. INJECT COOKIES (Bypass basics)
        const cookies = [];
        if (url.includes('reddit')) {
            cookies.push({ name: 'over18', value: '1', domain: 
'.reddit.com', path: '/' });
        }
        await context.addCookies(cookies);
        const page = await context.newPage();

        // 3. LOAD PAGE
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 
20000 });
        } catch(e) { console.log("   Page load timeout (continuing)..."); 
}
        
        // 4. INTERACTION LOGIC (The Fixes)
        try {
            // --- REDDIT FIX: Expand Image ---
            if (url.includes('reddit')) {
                // Click "View Full Image" or the Image itself to expand 
it
                await page.click('div[data-test-id="post-content"] img', { 
timeout: 2000 }).catch(() => {});
                await page.click('a[href*="i.redd.it"]', { timeout: 1000 
}).catch(() => {});
                
                // Wait for expansion
                await page.waitForTimeout(1000);
            }

            // --- TUBE FIX: Aggressive Clicker ---
            if (url.includes('xnxx') || url.includes('xvideos') || 
url.includes('pornhub')) {
                console.log("   Running Tube Bypass...");
                
                // Common selectors for "Enter / I am 18" buttons
                const selectors = [
                    '#disclaimer_btn_enter', // XVideos
                    '#disclaimer-block a',   // XNXX
                    '.disclaimer-btn',
                    'button:has-text("Enter")',
                    'a:has-text("Enter")',
                    'button:has-text("I am 18")',
                    'a:has-text("I am 18")'
                ];

                for (const sel of selectors) {
                    if (await page.$(sel)) {
                        await page.click(sel).catch(()=>{});
                        console.log(`   Clicked: ${sel}`);
                    }
                }
            }
            
            // Wait for splash screen to fade
            await page.waitForTimeout(2000);

            // --- GLOBAL ZOOM FIX (User Request: 80%) ---
            // This shrinks the page so the image fits better
            await page.evaluate(() => { document.body.style.zoom = "0.8"; 
});

        } catch(e) { console.log("Interaction Error:", e.message); }

        // 5. CAPTURE
        const screenshotBuffer = await page.screenshot({ fullPage: false 
});
        const base64Image = screenshotBuffer.toString('base64');
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;

        // Upload
        uploadScreenshot(screenshotBuffer, filename, 
process.env.DRIVE_FOLDER_ID).catch(e => {});

        await browser.close();
        res.json({ success: true, image: 
`data:image/png;base64,${base64Image}`, filename });

    } catch (error) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});        
// This captures 
about 25% more 
content than a standard screen
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
             viewport: { width: 1600, height: 1200 },
             extraHTTPHeaders: {
                 // TRICK: Tell the site we came from Google (Bypasses some gates)
                 'Referer': 'https://www.google.com/',
                 'Accept-Language': 'en-US,en;q=0.9'
             }
        });

        // 2. INJECT "AGE VERIFIED" COOKIES (Expanded List)
        const cookies = [];
        const domain = new URL(url).hostname.replace('www.', '');

        // Reddit
        if (url.includes('reddit')) {
            cookies.push({ name: 'over18', value: '1', domain: '.reddit.com', path: '/' });
            cookies.push({ name: 'over18', value: '1', domain: 'old.reddit.com', path: '/' });
        }
        
        // XNXX / XVideos (Nuclear Cookie List)
        if (url.includes('xnxx') || url.includes('xvideos')) {
             cookies.push(
                { name: 'adult_concept', value: '1', domain: `.${domain}`, path: '/' },
                { name: 'warning-agreed', value: '1', domain: `.${domain}`, path: '/' },
                { name: 'disclaimer', value: 'accepted', domain: `.${domain}`, path: '/' },
                { name: 'age_verified', value: '1', domain: `.${domain}`, path: '/' }
            );
        }
        
        // Pornhub
        if (url.includes('pornhub')) {
            cookies.push(
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
            );
        }

        await context.addCookies(cookies);
        const page = await context.newPage();

        // 3. LOAD PAGE
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        } catch(e) { console.log("   Page load timeout (continuing)..."); }
        
        // 4. SMART CLICKER (Finds "Enter" buttons dynamically)
        try {
            // Force a 20% Zoom Out via CSS for Reddit/Generic sites to fit more in
            await page.evaluate(() => { document.body.style.zoom = "80%"; });

            if (url.includes('reddit')) {
                await page.click('button:has-text("Yes")', { timeout: 1000 }).catch(() => {});
                await page.click('button:has-text("Continue")', { timeout: 1000 }).catch(() => {});
            }
            
            // Generic "I am 18" Clicker for ALL Tube Sites
            // Looks for buttons containing these keywords regardless of ID
            const keywords = ["Enter", "I am 18", "Agree", "Yes", "Continue"];
            for (const word of keywords) {
                // Try clicking buttons or links with this text
                await page.click(`text=${word}`, { timeout: 500 }).catch(() => {});
            }
            
            // Specific Hard-Coded Selectors (Backups)
            await page.click('#disclaimer_btn_enter', { timeout: 500 }).catch(() => {}); // XVideos
            await page.click('#disclaimer-block a', { timeout: 500 }).catch(() => {});   // XNXX

            // Wait for any animation to finish
            await page.waitForTimeout(1500);

        } catch(e) {}

        // 5. SCREENSHOT (Standard Mode - Not FullPage)
        // Since we set viewport to 1600x1200 and zoomed to 80%, this will fit perfectly.
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        
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
