// Random Joke Generator using JokeAPI
// API: https://jokeapi.dev/

const fetch = require('node-fetch');

class JokeGenerator {
  constructor() {
    this.apiUrl = 'https://v2.jokeapi.dev/joke/Any';
  }

  /**
   * Fetch a random joke from the API
   * @param {string} type - 'single', 'twopart', or 'any' (default: 'any')
   * @returns {Promise<Object>} - Joke object
   */
  async getRandomJoke(type = 'any') {
    try {
      const url = type === 'any' ? this.apiUrl : `${this.apiUrl}?type=${type}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      const joke = await response.json();
      
      if (joke.error) {
        throw new Error(`Joke API Error: ${joke.message}`);
      }
      
      return joke;
    } catch (error) {
      console.error('Error fetching joke:', error.message);
      throw error;
    }
  }

  /**
   * Get a formatted joke string
   * @param {string} type - 'single', 'twopart', or 'any'
   * @returns {Promise<string>} - Formatted joke
   */
  async getJokeString(type = 'any') {
    const joke = await this.getRandomJoke(type);
    
    if (joke.type === 'single') {
      return joke.joke;
    } else if (joke.type === 'twopart') {
      return `${joke.setup}\n\n${joke.delivery}`;
    }
  }

  /**
   * Get a joke from a specific category
   * @param {string} category - 'general', 'programming', 'knock-knock'
   * @returns {Promise<Object>} - Joke object
   */
  async getJokeByCategory(category = 'Any') {
    try {
      const url = `https://v2.jokeapi.dev/joke/${category}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      const joke = await response.json();
      
      if (joke.error) {
        throw new Error(`Category not found: ${category}`);
      }
      
      return joke;
    } catch (error) {
      console.error('Error fetching joke by category:', error.message);
      throw error;
    }
  }

  /**
   * Get multiple random jokes
   * @param {number} count - Number of jokes to fetch
   * @returns {Promise<Array>} - Array of jokes
   */
  async getMultipleJokes(count = 5) {
    const jokes = [];
    
    for (let i = 0; i < count; i++) {
      try {
        const joke = await this.getRandomJoke();
        jokes.push(joke);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching joke ${i + 1}:`, error.message);
      }
    }
    
    return jokes;
  }
}

module.exports = JokeGenerator;
