/**
 * Client for interacting with the Google AI Studio (Gemini) API.
 * This class encapsulates all the logic specific to Google's API,
 * including prompt creation, API calls, and response parsing.
 */
class GoogleAIClient {
  /**
   * @param {Object} clientProperties - Optional client properties for testing.
   */
  constructor(clientProperties = null) {
    this.apiKey = getApiKey(API_CONFIG.GOOGLE_AI_STUDIO.API_KEY_PROPERTY, clientProperties);
    this.baseUrl = API_CONFIG.GOOGLE_AI_STUDIO.BASE_URL;
    this.model = API_CONFIG.GOOGLE_AI_STUDIO.MODEL;
  }

  /**
   * Calls the Google AI Studio API with a given prompt.
   * @param {string} prompt - The prompt to send to the API.
   * @returns {Promise<Object>} The API response.
   * @private
   */
  async _callApi(prompt) {
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;

    const payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': this.apiKey
      },
      payload: JSON.stringify(payload)
    };

    const response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() !== 200) {
      const errorText = response.getContentText();
      Logger.log(`Google AI Studio API request failed with status: ${response.getResponseCode()}, response: ${errorText}`);
      throw new Error(`Google AI Studio API request failed with status: ${response.getResponseCode()}`);
    }

    return JSON.parse(response.getContentText());
  }

  /**
   * Parses the JSON content from a Google AI API response.
   * @param {Object} apiResponse - The full API response object.
   * @returns {Object|null} The parsed JSON data or null on failure.
   * @private
   */
  _parseJsonResponse(apiResponse) {
    if (!apiResponse || !apiResponse.candidates || apiResponse.candidates.length === 0) {
      Logger.log('No candidates found in Google AI Studio response');
      return null;
    }

    const textContent = apiResponse.candidates[0].content.parts[0].text;
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      Logger.log('No JSON found in Google AI Studio response text');
      Logger.log(`Response text: ${textContent}`);
      return null;
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (jsonError) {
      Logger.log(`Failed to parse JSON from Google AI Studio response: ${jsonError.message}`);
      Logger.log(`Response text: ${textContent}`);
      return null;
    }
  }
}
