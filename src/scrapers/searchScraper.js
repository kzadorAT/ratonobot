const axios = require('axios');
const cheerio = require('cheerio');

async function fetchSearchResults(query) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const results = [];
    $('.b_algo').each((i, element) => {
        const title = $(element).find('h2 a').text();
        const link = $(element).find('h2 a').attr('href');
        const description = $(element).find('.b_caption p').text();
        results.push({ title, link, description });
    });
    
    return results;
}

module.exports = { fetchSearchResults };