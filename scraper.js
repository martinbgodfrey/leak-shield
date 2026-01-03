// scraper.js
const { chromium } = require('playwright');
const Fuse = require('fuse.js');

async function scanKeywords(keywords) {
    console.log("🚀 Starting Scan for:", keywords);
    
    // Launch Browser (Configured for Railway/Docker)
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    let allVideos = [];

    for (const term of keywords) {
        // Simple Example: Scanning Pornhub only for the demo
        const url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(term)}&o=mr`;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Extract Data
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

    await browser.close();

    // Filter Logic (The V9 Brain)
    const recentTerms = ["minute", "hour", "day", "new", "moments ago", "now"];
    const oldTerms = ["year", "month", "week"];
    
    const leaks = [];
    const fuse = new Fuse(allVideos, { keys: ['title'], threshold: 0.4 });

    for (const term of keywords) {
        const results = fuse.search(term);
        for (const res of results) {
            const v = res.item;
            const t = v.timeText.toLowerCase();
            
            const isRecent = recentTerms.some(x => t.includes(x));
            const isOld = oldTerms.some(x => t.includes(x));

            if ((isRecent && !isOld) || t.includes('new')) {
                leaks.push(v);
            }
        }
    }

    return leaks;
}

module.exports = { scanKeywords };