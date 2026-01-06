const { chromium } = require('playwright');

async function scanKeywords(keywords, extraSubs = []) {
    const browser = await chromium.launch({ 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });
    
    await context.addCookies([
        { name: 'over18', value: '1', domain: '.reddit.com', path: '/' },
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allFindings = [];

    const defaultSubs = [
        'onlyfanshottest', 'onlyfans101', 'promotesyouronlyfans', 
        'onlyfansmoms', 'onlyfansmilfs', 'sultsofonlyfans',
        'OnlyFansAsstastic', 'leaked_content', 'OnlyFansPromotions',
        'OnlyFansBusty', 'OnlyFansPetite'
    ];
    
    const cleanExtras = extraSubs.map(s => s.replace('r/', '').trim()).filter(s => s.length > 0);
    const finalRedditSubs = [...new Set([...defaultSubs, ...cleanExtras])];

    const sites = [
        { 
            name: 'Erome', 
            searchUrl: (k) => `https://www.erome.com/search?q=${encodeURIComponent(k)}`, 
            container: '#room_rows .album',
        },
        { 
            name: 'SpankBang', 
            searchUrl: (k) => `https://spankbang.com/s/${encodeURIComponent(k)}/`, 
            container: '.video-item',
        },
        { 
            name: 'Pornhub', 
            searchUrl: (k) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}`, 
            container: '#videoSearchResult .pcVideoListItem',
        },
        { 
            name: 'XNXX', 
            searchUrl: (k) => `https://www.xnxx.com/search/${encodeURIComponent(k)}`, 
            container: '.thumb-block',
        },
        { 
            name: 'XVideos', 
            searchUrl: (k) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}`, 
            container: '.frame-block',
        }
    ];

    for (const term of keywords) {
        
        console.log(`🔎 [REDDIT] Scanning ${finalRedditSubs.length} subreddits for "${term}"...`);
        for (const sub of finalRedditSubs) {
            try {
                const searchLink = `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new&include_over_18=on`;
                await page.goto(searchLink, { waitUntil: 'domcontentloaded', timeout: 8000 });
                
                const findings = await page.$$eval('.search-result-link', (els, sourceSub) => {
                    return els.map(el => {
                        const titleEl = el.querySelector('a.search-title');
                        const thumbEl = el.querySelector('.search-result-icon img');
                        const authorEl = el.querySelector('.author'); 
                        const timeEl = el.querySelector('.search-time time');
                        
                        return { 
                            title: `[r/${sourceSub}] ${titleEl?.innerText || "Post"}`, 
                            link: titleEl?.href || "",
                            date: timeEl?.getAttribute('datetime') || timeEl?.innerText || "Recent", 
                            source: 'Reddit',
                            thumb: thumbEl?.src || null,
                            author: authorEl?.innerText || "Unknown"
                        };
                    }).filter(item => item.link);
                }, sub);
                
                if(findings.length > 0) allFindings.push(...findings);
            } catch (e) {}
        }

        for (const site of sites) {
            try {
                console.log(`🔎 [${site.name}] Checking "${term}"...`);
                await page.goto(site.searchUrl(term), { waitUntil: 'domcontentloaded', timeout: 15000 });

                const findings = await page.$$eval(site.container, (els, { siteName }) => {
                    return els.map(el => {
                        let res = { title: "Found", link: "", date: "", source: siteName };
                        
                        if (siteName === 'Erome') {
                            res.title = el.querySelector('.album-title')?.innerText;
                            res.link = el.querySelector('a.album-link')?.href;
                            res.thumb = el.querySelector('img.lazy')?.getAttribute('data-original');
                        } else if (siteName === 'SpankBang') {
                            res.title = el.querySelector('.n')?.innerText;
                            res.link = el.querySelector('a.thumb')?.href;
                            res.date = el.querySelector('.d')?.innerText;
                        } else if (siteName === 'Pornhub') {
                            const t = el.querySelector('.title a') || el.querySelector('a[title]');
                            res.title = t?.getAttribute('title');
                            res.link = t ? "https://pornhub.com" + t.getAttribute('href') : "";
                            res.date = el.querySelector('.added')?.innerText;
                        } else if (siteName === 'XNXX') {
                            if(el.closest('#related-videos')) return null;
                            const t = el.querySelector('.thumb-under a');
                            res.title = t?.getAttribute('title');
                            res.link = t ? "https://xnxx.com" + t.getAttribute('href') : "";
                        } else if (siteName === 'XVideos') {
                            const t = el.querySelector('p.title a');
                            res.title = t?.getAttribute('title');
                            res.link = t ? "https://xvideos.com" + t.getAttribute('href') : "";
                        }
                        return res;
                    }).filter(i => i && i.link && i.title);
                }, { siteName: site.name });

                allFindings.push(...findings);
            } catch (e) { console.log(`Error scanning ${site.name}: ${e.message}`); }
        }
    }

    await browser.close();
    return [...new Map(allFindings.map(item => [item.link, item])).values()];
}

module.exports = { scanKeywords };
