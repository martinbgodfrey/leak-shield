const { chromium } = require('playwright');
const Fuse = require('fuse.js');
const { uploadScreenshot } = require('./drive');

async function scanKeywords(keywords, options = { saveScreenshots: false }) {
    console.log(`🚀 Starting Big-5 Scan. Screenshots: ${options.saveScreenshots ? "ON" : "OFF"}`);
    
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        locale: 'en-US'
    });
    
    // Cookie bypass for age verifications
    await context.addCookies([
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'accessAgeDisclaimerRT', value: '1', domain: '.redtube.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allVideos = [];

    // --- DEFINING THE TARGETS (THE BIG 5) ---
    const sites = [
        {
            name: 'Pornhub',
            searchUrl: (k, p) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}&o=mr&page=${p}`,
            container: '#videoSearchResult .pcVideoListItem'
        },
        {
            name: 'RedTube',
            searchUrl: (k, p) => `https://www.redtube.com/?search=${encodeURIComponent(k)}&page=${p}`,
            container: '.video_block'
        },
        {
            name: 'XHamster',
            searchUrl: (k, p) => `https://xhamster.com/search?q=${encodeURIComponent(k)}&page=${p}`,
            container: 'div[data-video-id]'
        },
        {
            name: 'XVideos',
            searchUrl: (k, p) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}&p=${p}`,
            container: '.frame-block, .thumb-block'
        },
        {
            name: 'XNXX',
            searchUrl: (k, p) => `https://www.xnxx.com/search/${encodeURIComponent(k)}/${p}`,
            container: '.thumb-block'
        }
    ];

    // --- SEARCH LOOP ---
    for (const site of sites) {
        for (const term of keywords) {
            // Checking Pages 1-3 to keep speed reasonable
            for (let pageNum = 1; pageNum <= 3; pageNum++) {
                const url = site.searchUrl(term, pageNum);
                
                try {
                    console.log(`🔎 [${site.name}] Checking "${term}" - Page ${pageNum}...`);
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                    // Specific popup closers
                    if (pageNum === 1 && site.name === 'Pornhub') {
                        try { await page.click('#accessAgeDisclaimerPHBtn', {timeout: 1000}); } catch(e){}
                    }

                    // Extract Data (Custom logic for each site)
                    const videos = await page.$$eval(site.container, (els, siteName) => {
                        return els.map(el => {
                            let title = "Unknown";
                            let link = "";
                            let timeText = "Unknown";

                            if (siteName === 'Pornhub') {
                                title = el.querySelector('.title a')?.innerText?.trim();
                                link = "https://pornhub.com" + el.querySelector('.title a')?.getAttribute('href');
                                timeText = el.querySelector('.added')?.innerText?.trim();
                            } 
                            else if (siteName === 'RedTube') {
                                title = el.querySelector('a.video_title')?.innerText?.trim();
                                link = "https://redtube.com" + el.querySelector('a.video_link')?.getAttribute('href');
                                timeText = el.querySelector('.added_time')?.innerText?.trim();
                            }
                            else if (siteName === 'XHamster') {
                                title = el.querySelector('.video-thumb__title')?.innerText?.trim();
                                link = el.querySelector('a.video-thumb__link')?.getAttribute('href');
                                timeText = el.querySelector('.video-thumb__upload-time')?.innerText?.trim();
                            }
                            else if (siteName === 'XVideos') {
                                title = el.querySelector('.title a')?.innerText?.trim();
                                const href = el.querySelector('.title a')?.getAttribute('href');
                                link = href ? "https://xvideos.com" + href : "";
                                // XVideos date is often inside a text node or metadata
                                timeText = el.innerText.includes('ago') ? 'Recent' : 'Unknown'; 
                            }
                            else if (siteName === 'XNXX') {
                                title = el.querySelector('.thumb-under a')?.innerText?.trim() || el.querySelector('.title a')?.innerText?.trim();
                                const href = el.querySelector('.thumb-under a')?.getAttribute('href') || el.querySelector('.title a')?.getAttribute('href');
                                link = href ? "https://xnxx.com" + href : "";
                                timeText = el.innerText.includes('ago') ? 'Recent' : 'Unknown';
                            }

                            return { title, url: link, timeText: timeText || "Unknown", source: siteName };
                        });
                    }, site.name);

                    // Filter valid results
                    const validVideos = videos.filter(v => v.title && v.url && v.url.startsWith('http'));
                    if (validVideos.length === 0 && pageNum === 1) {
                         // If page 1 has no results, don't check page 2 or 3
                         break;
                    }
                    allVideos = [...allVideos, ...validVideos];

                } catch (e) { 
                    console.error(`   Error [${site.name}] Page ${pageNum}:`, e.message); 
                }
            }
        }
    }

    // --- ANALYSIS PHASE ---
    console.log(`📊 Analysis: Found ${allVideos.length} total videos. Filtering for recent leaks...`);

    const recentTerms = ["minute", "hour", "day", "week", "month", "new", "now", "recent", "sec"];
    const leaks = [];
    const fuse = new Fuse(allVideos, { keys: ['title'], threshold: 0.4 });

    for (const term of keywords) {
        const results = fuse.search(term);
        for (const res of results) {
            const v = res.item;
            const t = v.timeText.toLowerCase();
            
            // Logic: Is it recent?
            if (recentTerms.some(x => t.includes(x)) || t.includes('new') || t.includes('recent')) {
                v.evidence = "Found (No Screenshot)";

                // OPTIONAL SCREENSHOT
                if (options.saveScreenshots) {
                    console.log(`📸 Snapping: ${v.title}`);
                    try {
                        await page.goto(v.url, { waitUntil: 'load', timeout: 15000 });
                        const screenshot = await page.screenshot();
                        
                        if (process.env.DRIVE_FOLDER_ID) {
                            const filename = `EVIDENCE_${v.source}_${Date.now()}.png`;
                            await uploadScreenshot(screenshot, filename, process.env.DRIVE_FOLDER_ID);
                            v.evidence = "Saved to Drive ✅";
                        } else {
                            v.evidence = "Drive Not Configured ⚠️";
                        }
                    } catch (e) {
                        console.error("   Screenshot Error:", e.message);
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
