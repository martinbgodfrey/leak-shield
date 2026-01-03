const { chromium } = require('playwright');
const Fuse = require('fuse.js');
const { uploadScreenshot } = require('./drive');

async function scanKeywords(keywords, options = { saveScreenshots: false }) {
    console.log(`🚀 Starting Scan. Screenshots: ${options.saveScreenshots ? "ON" : "OFF"}`);
    
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        locale: 'en-US'
    });
    
    // Cookie bypass for age verification
    await context.addCookies([
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allVideos = [];

    // --- SEARCH PHASE ---
    for (const term of keywords) {
        // Checking Pages 1 through 5
        for (let pageNum = 1; pageNum <= 5; pageNum++) {
            const url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(term)}&o=mr&page=${pageNum}`;
            try {
                console.log(`🔎 Checking "${term}" - Page ${pageNum}...`);
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                if (pageNum === 1) {
                    try {
                        const closeButton = await page.$('#accessAgeDisclaimerPHBtn');
                        if (closeButton) await closeButton.click();
                    } catch (err) {}
                }

                const videos = await page.$$eval('#videoSearchResult .pcVideoListItem', (els) => {
                    return els.map(el => ({
                        title: el.querySelector('.title a')?.innerText?.trim() || "Unknown",
                        url: "https://pornhub.com" + el.querySelector('.title a')?.getAttribute('href'),
                        timeText: el.querySelector('.added')?.innerText?.trim() || "Old",
                        source: "Pornhub"
                    }));
                });

                if (videos.length === 0) break;
                allVideos = [...allVideos, ...videos];

            } catch (e) { console.error(`   Error Page ${pageNum}:`, e.message); }
        }
    }

    // --- ANALYSIS PHASE ---
    const recentTerms = ["minute", "hour", "day", "week", "month", "new", "now"];
    const leaks = [];
    const fuse = new Fuse(allVideos, { keys: ['title'], threshold: 0.4 });

    for (const term of keywords) {
        const results = fuse.search(term);
        for (const res of results) {
            const v = res.item;
            const t = v.timeText.toLowerCase();
            
            if (recentTerms.some(x => t.includes(x)) || t.includes('new')) {
                // DEFAULT STATUS
                v.evidence = "Found (No Screenshot)";

                // IF TOGGLE IS ON -> TAKE SCREENSHOT
                if (options.saveScreenshots) {
                    console.log(`📸 Snapping Evidence: ${v.title}`);
                    try {
                        await page.goto(v.url, { waitUntil: 'load', timeout: 15000 });
                        const screenshot = await page.screenshot({ fullPage: false });
                        
                        if (process.env.DRIVE_FOLDER_ID) {
                            const filename = `EVIDENCE_${v.title.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}_${Date.now()}.png`;
                            await uploadScreenshot(screenshot, filename, process.env.DRIVE_FOLDER_ID);
                            v.evidence = "Saved to Drive ✅";
                        } else {
                            v.evidence = "Drive Not Configured ⚠️";
                        }
                    } catch (e) {
                        console.error("   Screenshot failed:", e.message);
                        v.evidence = "Screenshot Failed ❌";
                    }
                }
                
                leaks.push(v);
            }
        }
    }

    await browser.close();
    return leaks;
}

module.exports = { scanKeywords };
