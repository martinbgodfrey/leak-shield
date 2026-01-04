const { chromium } = require('playwright');

async function scanKeywords(keywords, extraSubs = []) {
    const browser = await chromium.launch({ 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });
    
    // 1. INJECT COOKIES (Bypass Age Gates)
    await context.addCookies([
        // Reddit: Force NSFW results to show
        { name: 'over18', value: '1', domain: '.reddit.com', path: '/' },
        // Pornhub: Bypass "Are you 18?" splash screens
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allFindings = [];

    // --- TARGET LISTS ---
    
    // A. SUBREDDITS
    const defaultSubs = [
        'onlyfanshottest', 'onlyfans101', 'promotesyouronlyfans', 
        'onlyfansmoms', 'onlyfansmilfs', 'sultsofonlyfans',
        'OnlyFansAsstastic', 'leaked_content', 'OnlyFansPromotions',
        'OnlyFansBusty', 'OnlyFansPetite'
    ];
    // Merge custom subs & remove duplicates
    const cleanExtras = extraSubs.map(s => s.replace('r/', '').trim()).filter(s => s.length > 0);
    const finalRedditSubs = [...new Set([...defaultSubs, ...cleanExtras])];

    // B. TUBE SITES (Added Erome & SpankBang)
    const sites = [
        { 
            name: 'Erome', 
            searchUrl: (k) => `https://www.erome.com/search?q=${encodeURIComponent(k)}`, 
            container: '#room_rows .album',
            extract: (el) => ({
                title: el.querySelector('.album-title')?.innerText || "Erome Album",
                url: el.querySelector('a.album-link')?.href || "",
                date: "Unknown", // Erome hides dates on search page
                thumb: el.querySelector('img.lazy')?.getAttribute('data-original')
            })
        },
        { 
            name: 'SpankBang', 
            searchUrl: (k) => `https://spankbang.com/s/${encodeURIComponent(k)}/`, 
            container: '.video-item',
            extract: (el) => ({
                title: el.querySelector('.n')?.innerText || "SpankBang Video",
                url: el.querySelector('a.thumb')?.href || "",
                date: el.querySelector('.d')?.innerText || "Unknown",
                thumb: el.querySelector('img.cover')?.src
            })
        },
        { 
            name: 'Pornhub', 
            searchUrl: (k) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}`, 
            container: '#videoSearchResult .pcVideoListItem',
            extract: (el) => {
                const titleEl = el.querySelector('.title a') || el.querySelector('a[title]');
                return {
                    title: titleEl ? titleEl.getAttribute('title') : "Pornhub Video",
                    url: titleEl ? "https://pornhub.com" + titleEl.getAttribute('href') : "",
                    date: el.querySelector('.added')?.innerText || "Recent",
                    thumb: el.querySelector('img')?.src
                };
            }
        },
        { 
            name: 'XNXX', 
            searchUrl: (k) => `https://www.xnxx.com/search/${encodeURIComponent(k)}`, 
            container: '.thumb-block',
            extract: (el) => {
                if(el.closest('#related-videos')) return null;
                const linkTag = el.querySelector('.thumb-under a');
                return {
                    title: linkTag?.getAttribute('title') || "XNXX Video",
                    url: linkTag ? "https://xnxx.com" + linkTag.getAttribute('href') : "",
                    date: "Unknown",
                    thumb: el.querySelector('img')?.src
                };
            }
        },
        { 
            name: 'XVideos', 
            searchUrl: (k) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}`, 
            container: '.frame-block',
            extract: (el) => {
                const linkTag = el.querySelector('p.title a');
                return {
                    title: linkTag?.getAttribute('title') || "XVideos Video",
                    url: linkTag ? "https://xvideos.com" + linkTag.getAttribute('href') : "",
                    date: el.querySelector('.date')?.innerText || "Unknown",
                    thumb: el.querySelector('img')?.src
                };
            }
        }
    ];

    // --- EXECUTE SCAN ---
    for (const term of keywords) {
        
        // 1. REDDIT SCAN (Fixed with include_over_18=on)
        console.log(`🔎 [REDDIT] Scanning ${finalRedditSubs.length} subreddits for "${term}"...`);
        for (const sub of finalRedditSubs) {
            try {
                // Added include_over_18=on parameter
                const searchLink = `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new&include_over_18=on`;
                await page.goto(searchLink, { waitUntil: 'domcontentloaded', timeout: 4000 });
                
                const findings = await page.$$eval('.search-result-link', (els, sourceSub) => {
                    return els.map(el => {
                        const titleEl = el.querySelector('a.search-title');
                        const thumbEl = el.querySelector('.search-result-icon img');
                        const authorEl = el.querySelector('.author'); 
                        
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

        // 2. TUBE SITES SCAN
        for (const site of sites) {
            try {
                console.log(`🔎 [${site.name}] Checking "${term}"...`);
                await page.goto(site.searchUrl(term), { waitUntil: 'domcontentloaded', timeout: 15000 });

                // Generic extractor for all tube sites
                const findings = await page.$$eval(site.container, (els, { siteName, extractStr }) => {
                    // We must rebuild the function inside the browser context
                    // This is a Playwright quirk; we pass the function logic as a string or handle simpler logic here.
                    // For simplicity in this shell script version, we will map inside:
                    
                    return els.map(el => {
                        // RE-IMPLEMENTING LOGIC INSIDE BROWSER CONTEXT
                        let res = { title: "Found", url: "", date: "", source: siteName };
                        
                        if (siteName === 'Erome') {
                            res.title = el.querySelector('.album-title')?.innerText;
                            res.url = el.querySelector('a.album-link')?.href;
                            res.thumb = el.querySelector('img.lazy')?.getAttribute('data-original');
                        } else if (siteName === 'SpankBang') {
                            res.title = el.querySelector('.n')?.innerText;
                            res.url = el.querySelector('a.thumb')?.href;
                            res.date = el.querySelector('.d')?.innerText;
                        } else if (siteName === 'Pornhub') {
                            const t = el.querySelector('.title a') || el.querySelector('a[title]');
                            res.title = t?.getAttribute('title');
                            res.url = t ? "https://pornhub.com" + t.getAttribute('href') : "";
                            res.date = el.querySelector('.added')?.innerText;
                        } else if (siteName === 'XNXX') {
                            if(el.closest('#related-videos')) return null;
                            const t = el.querySelector('.thumb-under a');
                            res.title = t?.getAttribute('title');
                            res.url = t ? "https://xnxx.com" + t.getAttribute('href') : "";
                        } else if (siteName === 'XVideos') {
                            const t = el.querySelector('p.title a');
                            res.title = t?.getAttribute('title');
                            res.url = t ? "https://xvideos.com" + t.getAttribute('href') : "";
                        }
                        return res;
                    }).filter(i => i && i.url && i.title);
                }, { siteName: site.name });

                allFindings.push(...findings);
            } catch (e) { console.log(`Error scanning ${site.name}: ${e.message}`); }
        }
    }

    await browser.close();
    // Deduplicate by URL
    return [...new Map(allFindings.map(item => [item['url'], item])).values()];
}

module.exports = { scanKeywords };
