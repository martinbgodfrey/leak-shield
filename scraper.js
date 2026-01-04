const { chromium } = require('playwright');

// Now accepts extraSubs parameter
async function scanKeywords(keywords, extraSubs = []) {
    const browser = await chromium.launch({ 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });
    
    // Inject cookies for scanning
    await context.addCookies([
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allFindings = [];

    // 1. BUILD SUBREDDIT LIST
    const defaultSubs = [
        'onlyfanshottest', 'onlyfans101', 'promotesyouronlyfans', 
        'onlyfansmoms', 'onlyfansmilfs', 'sultsofonlyfans',
        'OnlyFansAsstastic', 'leaked_content', 'OnlyFansPromotions',
        'OnlyFansBusty', 'OnlyFansPetite'
    ];
    
    // Merge and clean (remove "r/" if user typed it)
    const cleanExtras = extraSubs.map(s => s.replace('r/', '').trim()).filter(s => s.length > 0);
    // Use Set to remove duplicates
    const finalRedditSubs = [...new Set([...defaultSubs, ...cleanExtras])];

    // 2. TUBE SITES
    const sites = [
        { 
            name: 'Pornhub', 
            searchUrl: (k) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}`, 
            container: '#videoSearchResult .pcVideoListItem' 
        },
        { 
            name: 'XNXX', 
            searchUrl: (k) => `https://www.xnxx.com/search/${encodeURIComponent(k)}`, 
            container: '.thumb-block' 
        },
        { 
            name: 'XVideos', 
            searchUrl: (k) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}`, 
            container: '.frame-block' 
        }
    ];

    for (const term of keywords) {
        
        // A. REDDIT SCAN
        console.log(`🔎 [REDDIT] Scanning ${finalRedditSubs.length} subreddits for "${term}"...`);
        for (const sub of finalRedditSubs) {
            try {
                // Search INSIDE specific subreddit
                await page.goto(`https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new`, { waitUntil: 'domcontentloaded', timeout: 5000 });
                
                const findings = await page.$$eval('.search-result-link', (els, sourceSub) => {
                    return els.map(el => {
                        const titleEl = el.querySelector('a.search-title');
                        const thumbEl = el.querySelector('.search-result-icon img');
                        const authorEl = el.querySelector('.author'); // Grab Author
                        
                        return { 
                            title: `[r/${sourceSub}] ${titleEl?.innerText || "Post"}`, 
                            url: titleEl?.href || "", 
                            date: el.querySelector('.search-time time')?.innerText || "Recent", 
                            source: 'Reddit',
                            thumb: thumbEl?.src || null,
                            author: authorEl?.innerText || "Unknown"
                        };
                    });
                }, sub);
                
                if(findings.length > 0) allFindings.push(...findings);
            } catch (e) {}
        }

        // B. TUBE SITES
        for (const site of sites) {
            try {
                console.log(`🔎 [${site.name}] Checking "${term}"...`);
                await page.goto(site.searchUrl(term), { waitUntil: 'domcontentloaded', timeout: 15000 });

                const findings = await page.$$eval(site.container, (els, siteName) => {
                    return els.map(el => {
                        let title = "Unknown", link = "", date = "Unknown";

                        if (siteName === 'Pornhub') {
                            const titleEl = el.querySelector('.title a') || el.querySelector('a[title]');
                            title = titleEl ? titleEl.getAttribute('title') : "No Title";
                            link = titleEl ? "https://pornhub.com" + titleEl.getAttribute('href') : "";
                            date = el.querySelector('.added')?.innerText || "Recent";
                        } 
                        else if (siteName === 'XNXX') {
                            if(el.closest('#related-videos')) return null;
                            const linkTag = el.querySelector('.thumb-under a');
                            title = linkTag?.getAttribute('title');
                            link = linkTag ? "https://xnxx.com" + linkTag.getAttribute('href') : "";
                        }
                        else if (siteName === 'XVideos') {
                            const linkTag = el.querySelector('p.title a');
                            title = linkTag?.getAttribute('title');
                            link = linkTag ? "https://xvideos.com" + linkTag.getAttribute('href') : "";
                        }
                        return { title: title || "Found Video", url: link, date: date || "Unknown", source: siteName };
                    }).filter(i => i && i.url);
                }, site.name);

                allFindings.push(...findings);
            } catch (e) {}
        }
    }

    await browser.close();
    return [...new Map(allFindings.map(item => [item['url'], item])).values()];
}

module.exports = { scanKeywords };
