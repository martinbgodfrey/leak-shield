// scraper.js
const { chromium } = require('playwright');

async function scanKeywords(keywords) {
    const browser = await chromium.launch({ 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    let allFindings = [];

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
        },
        {
            name: 'Reddit',
            // Using OLD Reddit for reliable scraping
            searchUrl: (k) => `https://old.reddit.com/search?q=${encodeURIComponent(k)}&sort=new`,
            container: '.search-result-link'
        }
    ];

    for (const site of sites) {
        for (const term of keywords) {
            try {
                console.log(`🔎 Searching ${site.name} for: ${term}`);
                await page.goto(site.searchUrl(term), { waitUntil: 'domcontentloaded', timeout: 15000 });
                
                // POPUP BYPASS FOR SCRAPER (To see results)
                if(site.name === 'Pornhub') await page.click('#accessAgeDisclaimerPHBtn').catch(()=>{});

                const findings = await page.$$eval(site.container, (els, siteName) => {
                    return els.map(el => {
                        let title = "Unknown", link = "", date = "Unknown";

                        if (siteName === 'Pornhub') {
                            // Fix: Target the Title link specifically, ignore duration/author
                            const titleEl = el.querySelector('.title a') || el.querySelector('a[title]');
                            title = titleEl ? titleEl.getAttribute('title') || titleEl.innerText : "No Title";
                            link = titleEl ? "https://pornhub.com" + titleEl.getAttribute('href') : "";
                            date = el.querySelector('.added')?.innerText || "Recent";
                        } 
                        else if (siteName === 'XNXX') {
                            // Fix: Ensure we aren't grabbing "Related Videos"
                            if(el.closest('#related-videos')) return null; 
                            
                            const linkTag = el.querySelector('.thumb-under a');
                            title = linkTag ? linkTag.getAttribute('title') || linkTag.innerText : "No Title";
                            link = linkTag ? "https://xnxx.com" + linkTag.getAttribute('href') : "";
                            date = el.querySelector('.metadata')?.innerText || "Unknown";
                        }
                        else if (siteName === 'Reddit') {
                            const titleTag = el.querySelector('a.search-title');
                            title = titleTag ? titleTag.innerText : "Reddit Post";
                            link = titleTag ? titleTag.href : "";
                            date = el.querySelector('.search-time')?.innerText || "Recent";
                        }
                        else if (siteName === 'XVideos') {
                            const linkTag = el.querySelector('p.title a');
                            title = linkTag ? linkTag.getAttribute('title') : "No Title";
                            link = linkTag ? "https://xvideos.com" + linkTag.getAttribute('href') : "";
                        }

                        return { title, url: link, date, source: siteName };
                    }).filter(item => item && item.url && item.title !== "No Title");
                }, site.name);

                allFindings.push(...findings);
            } catch (e) { console.log(`   Skipped ${site.name}: ${e.message}`); }
        }
    }

    await browser.close();
    return allFindings;
}

module.exports = { scanKeywords };