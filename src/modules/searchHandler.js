import axios from 'axios';

async function fetchSearchResults(query) {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX;

    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}&num=10`;
    
    try {
        const response = await axios.get(url);
        const items = response.data.items;

        return items.map(item => ({
            title: item.title,
            link: item.link,
            description: item.snippet
        }));
    } catch (error) {
        console.error('Error al obtener los resultados de Google:', error.message);
        return [];
    }
}

export { fetchSearchResults };