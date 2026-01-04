const { chromium } = require('playwright');
const Tesseract = require('tesseract.js');

// --- 1. VISION MODULE (Detects Watermarks) ---
async function checkImageForText(imageUrl, keywords) {
    if (!imageUrl || imageUrl.includes('default') || imageUrl.includes('external') || imageUrl.length < 10) return false;
    
    try {
        // Run OCR on the image URL (Silent mode)
        const { data: { text } } = await Tesseract.recognize(imageUrl, 'eng');
        const cleanText = text.toLowerCase();
        
        // Check if any keyword appears in the image pixels
        const match = keywords.find(k => cleanText.includes(k.toLowerCase()));
        if (match) {
            console.log(`   🎯 VISION HIT! Found "${match}" in watermark.`);
            return true;
        }
    } catch (e) {
        // Image might be unreadable or block bots, ignore silently
    }
    return false;
}

// --- 2. MAIN SCANNER ---
async function scanKeywords(keywords) {
    console.log(`🚀 Starting DEEP SCAN (Text + Visual + Stealth)...`);
    
    // Stealth Launch
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Inject Verification Cookies (For Tube Sites)
    await context.addCookies([
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'has_visited', value: '1', domain: '.xvideos.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allFindings = [];

    // --- PART A: REDDIT VISUAL SCANNER ---
    const redditSubs = [
        'onlyfanshottest', 'onlyfans101', 'promotesyouronlyfans', 
        'onlyfansmoms', 'onlyfansmilfs', 'sultsofonlyfans',
        'OnlyFansAsstastic', 'leaked_content', 'OnlyFansPromotions'
    ];

    console.log(`🔎 [REDDIT] Scanning ${redditSubs.length} subreddits...`);
    
    // We scan the "New" feed of these subs regardless of keywords first
    for (const sub of redditSubs) {
        try {
            await page.goto(`https://old.reddit.com/r/${sub}/new/`, { waitUntil: 'domcontentloaded', timeout: 8000 });
            
            const posts = await page.$$eval('.thing', els => {
                return els.map(el => {
                    const titleEl = el.querySelector('a.title');
                    const thumbEl = el.querySelector('.thumbnail img');
                    const timeEl = el.querySelector('.live-timestamp');
                    
                    return {
                        title: titleEl?.innerText || "Unknown Title",
                        url: titleEl?.getAttribute('href'),
                        thumb: thumbEl?.src || null,
                        date: timeEl?.getAttribute('datetime') || "Recent",
                        source: 'Reddit'
                    };
                });
            });

            // Process Posts (Text OR Vision)
            for (const post of posts) {
                let isMatch = false;

                // 1. Text Check (Fast)
                if (keywords.some(k => post.title.toLowerCase().includes(k.toLowerCase()))) {
                    isMatch = true;
                }
                // 2. Visual Check (Slower) - Only if text failed
                else if (post.thumb) {
                    const visualMatch = await checkImageForText(post.thumb, keywords);
                    if (visualMatch) {
                        isMatch = true;
                        post.title = `[WATERMARK] ${post.title}`; // Flag in UI
                    }
                }

                if (isMatch) {
                    if (post.url && post.url.startsWith('/')) post.url = "https://reddit.com" + post.url;
                    console.log(`   Found: ${post.title}`);
                    allFindings.push(post);
                }
            }
        } catch (e) {
            console.log(`   Skipped r/${sub} (Timeout/Error)`);
        }
    }

    // --- PART B: STANDARD TUBE SITES ---
    const tubeSites = [
        { 
            name: 'Pornhub', 
            searchUrl: (k, p) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}&o=mr&page=${p}`, 
            container: '#videoSearchResult .pcVideoListItem, li.videoBox' 
        },
        { 
            name: 'XNXX', 
            searchUrl: (k, p) => `https://www.xnxx.com/search/${encodeURIComponent(k)}/date/${p}`, 
            container: '.thumb-block' 
        },
        { 
            name: 'XVideos', 
            searchUrl: (k, p) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}&sort=uploaddate&p=${p}`, 
            container: '.frame-block, .thumb-block' 
        }
    ];

    for (const site of tubeSites) {
        for (const term of keywords) {
            try {
                console.log(`🔎 [${site.name}] Checking "${term}"...`);
                await page.goto(site.searchUrl(term, 1), { waitUntil: 'domcontentloaded', timeout: 15000 });
                
                // Lazy Load Scroll
                await page.evaluate(async () => {
                    window.scrollTo(0, document.body.scrollHeight);
                    await new Promise(r => setTimeout(r, 1000));
                });

                const findings = await extractFindings(page, site.name, site.container);
                allFindings.push(...findings);
            } catch (e) {
                console.log(`   Skipping [${site.name}]: ${e.message}`);
            }
        }
    }

    await browser.close();
    
    // Deduplicate logic
    return [...new Map(allFindings.map(item => [item['url'], item])).values()];
}

// Helper for Tube Sites
async function extractFindings(page, siteName, container) {
    return await page.$$eval(container, (els, siteName) => {
        return els.map(el => {
            let title = "Unknown", link = "", date = "Unknown";

            if (siteName === 'Pornhub') {
                const linkObj = el.querySelector('a[href*="/view_video"]');
                title = linkObj?.getAttribute('title') || linkObj?.innerText;
                link = "https://pornhub.com" + linkObj?.getAttribute('href');
                date = el.querySelector('.added')?.innerText || "Recent";
            }
            else if (siteName === 'XNXX') {
                const linkObj = el.querySelector('.thumb-under a') || el.querySelector('a');
                title = linkObj?.getAttribute('title') || linkObj?.innerText;
                link = linkObj?.getAttribute('href');
                if (link && !link.startsWith('http')) link = "https://xnxx.com" + link;
                date = el.innerText.match(/(\d+\s(min|hour|day|week|month|year)s?\sago)/)?.[0];
            }
            else if (siteName === 'XVideos') {
                const linkTag = el.querySelector('p.title a');
                title = linkTag?.getAttribute('title') || linkTag?.innerText;
                link = linkTag?.getAttribute('href');
                if (link && !link.startsWith('http')) link = "https://xvideos.com" + link;
                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0];
            }

            return { title: title || "Unknown Video", url: link, date: date || "Unknown Date", source: siteName };
        });
    }, siteName);
}

module.exports = { scanKeywords };
