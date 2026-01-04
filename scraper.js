const { chromium } = require('playwright');

async function scanKeywords(keywords) {
    console.log(`🚀 Starting FRESH SCAN...`);
    
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        locale: 'en-US'
    });

    const page = await context.newPage();
    let allFindings = [];

    const sites = [
        { 
            name: 'XNXX', 
            // FIXED: New selector for XNXX 2024 Layout
            searchUrl: (k, p) => `https://www.xnxx.com/search/${encodeURIComponent(k)}/date/${p}`, 
            container: '.thumb-block' 
        },
        { 
            name: 'XVideos', 
            searchUrl: (k, p) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}&sort=uploaddate&p=${p}`, 
            container: '.frame-block, .thumb-block' 
        },
        { 
            name: 'Pornhub', 
            searchUrl: (k, p) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}&o=d&page=${p}`, 
            container: '#videoSearchResult .pcVideoListItem, li.videoBox' 
        }
        // ... (Keep other sites if needed, removed for brevity/speed)
    ];

    for (const site of sites) {
        for (const term of keywords) {
            for (let pageNum = 1; pageNum <= 1; pageNum++) { // Fast Scan (1 Page)
                try {
                    console.log(`🔎 [${site.name}] Checking "${term}"...`);
                    await page.goto(site.searchUrl(term, pageNum), { waitUntil: 'domcontentloaded', timeout: 15000 });
                    
                    if (site.name === 'Pornhub') {
                        try { if (await page.$('#accessAgeDisclaimerPHBtn')) await page.click('#accessAgeDisclaimerPHBtn'); } catch(e){}
                    }

                    allFindings.push(...(await extractFindings(page, site.name, site.container)));
                } catch (e) { console.log(`   Skipping [${site.name}]: ${e.message}`); }
            }
        }
    }

    await browser.close();
    return [...new Map(allFindings.map(item => [item['url'], item])).values()];
}

async function extractFindings(page, siteName, container) {
    return await page.$$eval(container, (els, siteName) => {
        return els.map(el => {
            let title = "Unknown", link = "", date = "Unknown";

            if (siteName === 'XNXX') {
                // FIXED SELECTORS
                const titleEl = el.querySelector('.thumb-under a') || el.querySelector('.title a');
                title = titleEl?.getAttribute('title') || titleEl?.innerText;
                link = titleEl?.getAttribute('href');
                if (link && !link.startsWith('http')) link = "https://xnxx.com" + link;
                // Parse "3 days ago" etc.
                const meta = el.innerText.match(/(\d+\s(min|hour|day|week|month|year)s?\sago)/);
                if (meta) date = meta[0];
            }
            else if (siteName === 'XVideos') {
                const linkTag = el.querySelector('p.title a');
                title = linkTag?.getAttribute('title') || linkTag?.innerText;
                link = linkTag?.getAttribute('href');
                if (link && !link.startsWith('http')) link = "https://xvideos.com" + link;
                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0];
            }
            else if (siteName === 'Pornhub') {
                const linkObj = el.querySelector('.title a');
                title = linkObj?.getAttribute('title') || linkObj?.innerText;
                link = "https://pornhub.com" + linkObj?.getAttribute('href');
                date = el.querySelector('.added')?.innerText;
            }

            return { title: title || "Unknown Video", url: link, date: date || "Unknown Date", source: siteName };
        });
    }, siteName);
}

module.exports = { scanKeywords };
