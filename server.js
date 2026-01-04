const express = require('express');
const { scanKeywords } = require('./scraper');
const { chromium } = require('playwright');
const { uploadScreenshot } = require('./drive');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

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

// CAPTURE ENDPOINT (With "Popup Killer")
app.post('/capture', async (req, res) => {
    const { url, source, title } = req.body;
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
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
        
        // 2. POPUP KILLER (New Logic)
        try {
            if (source === 'XNXX') {
                // Clicks the "Straight : ENTER" or generic "Enter" button
                await page.click('text="Straight"', { timeout: 2000 }).catch(() => {}); 
                await page.click('text="ENTER"', { timeout: 2000 }).catch(() => {});
                await page.click('.btn-danger', { timeout: 1000 }).catch(() => {}); // Sometimes it's a red button
            }
            else if (source === 'Pornhub') {
                await page.click('#accessAgeDisclaimerPHBtn', { timeout: 2000 }).catch(() => {});
                await page.click('text="I am 18 or older"', { timeout: 2000 }).catch(() => {});
            }
            else if (source === 'XVideos') {
                await page.click('#disclaimer_container a', { timeout: 2000 }).catch(() => {});
            }
            
            // Wait a split second for the modal to fade out
            await page.waitForTimeout(1500);
            
        } catch (e) {
            console.log("   Popup interaction skipped/failed (might not exist).");
        }
        
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;
        uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID)
            .catch(e => console.log(`   (Background) Drive Upload Skipped: ${e.message}`));

        await browser.close();
        browser = null;

        res.json({ 
            success: true, 
            image: `data:image/png;base64,${base64Image}`,
            filename: filename 
        });

    } catch (error) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: "Capture failed: " + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
