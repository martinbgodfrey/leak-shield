const { chromium } = require('playwright');
const Fuse = require('fuse.js');
const { uploadScreenshot } = require('./drive'); // Import the new drive tool

async function scanKeywords(keywords) {
    console.log("🚀 Starting Scan for:", keywords);
    
    // Launch browser (headless for speed)
    const browser = await chromium.launch();
    const page = await browser.newPage();
    let allVideos = [];

    // 1. Search Pornhub
    for (const term of keywords) {
        const url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(term)}&o=mr`;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const videos = await page.$$eval('#videoSearchResult .pcVideoListItem', (els) => {
                return els.map(el => ({
                    title: el.querySelector('.title a')?.innerText?.trim() || "Unknown",
                    url: "https://pornhub.com" + el.querySelector('.title a')?.getAttribute('href'),
                    timeText: el.querySelector('.added')?.innerText?.trim() || "Old",
                    source: "Pornhub"
                }));
            });
            allVideos = [...allVideos, ...videos];
        } catch (e) { console.error(`Error scanning ${term}:`, e.message); }
    }

    // 2. Filter & Screenshot
    const recentTerms = ["minute", "hour", "day", "new", "moments ago", "now"];
    const leaks = [];
    const fuse = new Fuse(allVideos, { keys: ['title'], threshold: 0.4 });

    for (const term of keywords) {
        const results = fuse.search(term);
        for (const res of results) {
            const v = res.item;
            const t = v.timeText.toLowerCase();
            
            // Logic: Is it recent?
            if (recentTerms.some(x => t.includes(x)) || t.includes('new')) {
                console.log(`📸 New Leak Found: ${v.title}`);
                
                // TAKE THE SCREENSHOT
                try {
                    await page.goto(v.url, { waitUntil: 'load', timeout: 15000 });
                    const screenshot = await page.screenshot({ fullPage: false });
                    
                    // UPLOAD TO DRIVE
                    if (process.env.DRIVE_FOLDER_ID) {
                        const filename = `LEAK_${term}_${Date.now()}.png`;
                        await uploadScreenshot(screenshot, filename, process.env.DRIVE_FOLDER_ID);
                        v.evidence = "Saved to Drive ✅";
                    }
                } catch (e) {
                    console.error("Screenshot failed:", e.message);
                    v.evidence = "Screenshot Failed ❌";
                }
                leaks.push(v);
            }
        }
    }

    await browser.close();
    return leaks;
}

module.exports = { scanKeywords };