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
            name: 'Redgifs',
            searchUrl: (k) => `https://www.redgifs.com/gifs/search/${encodeURIComponent(k)}`,
            container: '.gif-item, a[href*="/watch/"]'
        },
        {
            name: 'Bunkr',
            searchUrl: (k) => `https://bunkr.si/search?q=${encodeURIComponent(k)}`,
            container: '.grid-item, .file-item'
        },
        {
            name: 'Coomer',
            searchUrl: (k) => `https://coomer.su/search?q=${encodeURIComponent(k)}`,
            container: '.user-card, .post-card'
        },
        {
            name: 'Kemono',
            searchUrl: (k) => `https://kemono.su/posts?q=${encodeURIComponent(k)}`,
            container: '.post-card, article'
        },
        {
            name: 'Fapello',
            searchUrl: (k) => `https://fapello.com/search/${encodeURIComponent(k)}/`,
            container: '.model, .photo'
        },
        { 
            name: 'Erome', 
            searchUrl: (k) => `https://www.erome.com/search?q=${encodeURIComponent(k)}`, 
            container: '#room_rows .album'
        },
        { 
            name: 'SpankBang', 
            searchUrl: (k) => `https://spankbang.com/s/${encodeURIComponent(k)}/`, 
            container: '.video-item'
        },
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
                        
                        return { 
                            title: `[r/${sourceSub}] ${titleEl?.innerText || "Post"}`, 
                            link: titleEl?.href || "",
                            date: el.querySelector('.search-time time')?.innerText || "Recent", 
                            source: 'Reddit',
                            thumb: thumbEl?.src || null,
                            author: authorEl?.innerText || "Unknown"
                        };
                    });
                }, sub);
                
                if(findings.length > 0) {
                    console.log(`  ✓ r/${sub}: ${findings.length} results`);
                    allFindings.push(...findings);
                }
            } catch (e) {}
        }

        for (const site of sites) {
            try {
                console.log(`🔎 [${site.name}] Checking "${term}"...`);
                await page.goto(site.searchUrl(term), { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.waitForTimeout(3000);

                const findings = await page.$$eval(site.container, (els, { siteName }) => {
                    return els.slice(0, 20).map(el => {
                        let res = { title: "Found", link: "", date: "", source: siteName };
                        
                        if (siteName === 'Redgifs') {
                            const a = el.tagName === 'A' ? el : el.querySelector('a');
                            res.link = a?.href || "";
                            res.title = el.querySelector('.gif-title, h3')?.innerText || "Redgifs Video";
                        } 
                        else if (siteName === 'Bunkr') {
                            const a = el.querySelector('a');
                            res.title = a?.innerText?.trim() || "Bunkr File";
                            res.link = a?.href || "";
                        }
                        else if (siteName === 'Coomer') {
                            const a = el.querySelector('a');
                            res.title = el.querySelector('.user-name, .post-title')?.innerText || "Coomer Post";
                            res.link = a?.href?.startsWith('http') ? a.href : `https://coomer.su${a?.getAttribute('href')}`;
                        }
                        else if (siteName === 'Kemono') {
                            const a = el.querySelector('a[href*="/post/"]');
                            res.title = el.querySelector('.post-title, h2')?.innerText || "Kemono Post";
                            res.link = a?.href?.startsWith('http') ? a.href : `https://kemono.su${a?.getAttribute('href')}`;
                        }
                        else if (siteName === 'Fapello') {
                            const a = el.querySelector('a');
                            res.title = a?.getAttribute('title') || "Fapello Content";
                            res.link = a?.href || "";
                        }
                        else if (siteName === 'Erome') {
                            res.title = el.querySelector('.album-title')?.innerText;
                            res.link = el.querySelector('a.album-link')?.href;
                            res.thumb = el.querySelector('img.lazy')?.getAttribute('data-original');
                        } 
                        else if (siteName === 'SpankBang') {
                            res.title = el.querySelector('.n')?.innerText;
                            res.link = el.querySelector('a.thumb')?.href;
                            res.date = el.querySelector('.d')?.innerText;
                        } 
                        else if (siteName === 'Pornhub') {
                            const t = el.querySelector('.title a') || el.querySelector('a[title]');
                            res.title = t?.getAttribute('title');
                            res.link = t ? "https://pornhub.com" + t.getAttribute('href') : "";
                            res.date = el.querySelector('.added')?.innerText;
                        } 
                        else if (siteName === 'XNXX') {
                            if(el.closest('#related-videos')) return null;
                            const t = el.querySelector('.thumb-under a');
                            res.title = t?.getAttribute('title');
                            res.link = t ? "https://xnxx.com" + t.getAttribute('href') : "";
                        } 
                        else if (siteName === 'XVideos') {
                            const t = el.querySelector('p.title a');
                            res.title = t?.getAttribute('title');
                            res.link = t ? "https://xvideos.com" + t.getAttribute('href') : "";
                        }
                        
                        return res;
                    }).filter(i => i && i.link && i.title);
                }, { siteName: site.name });

                if(findings.length > 0) {
                    console.log(`  ✓ ${site.name}: ${findings.length} results`);
                    allFindings.push(...findings);
                }
            } catch (e) { 
                console.log(`  ✗ ${site.name}: ${e.message}`); 
            }
        }
    }

    await browser.close();
    
    const unique = [...new Map(allFindings.map(item => [item.link, item])).values()];
    console.log(`\n✅ Total unique results: ${unique.length}\n`);
    
    return unique;
}

module.exports = { scanKeywords };
