/**
 * Client for interacting with the OpenAI API.
 * This class encapsulates all the logic specific to OpenAI's API,
 * including API calls and response parsing.
 */
class OpenAIClient {
  /**
   * @param {Object} clientProperties - Optional client properties for testing.
   */
  constructor(clientProperties = null) {
    // Assumes API_CONFIG is extended to include an 'OPENAI' section.
    this.apiKey = getApiKey(API_CONFIG.OPENAI.API_KEY_PROPERTY, clientProperties);
    this.baseUrl = API_CONFIG.OPENAI.BASE_URL;
    this.model = API_CONFIG.OPENAI.MODEL;
  }

  /**
   * Calls the OpenAI Chat Completions API with a given prompt.
   * It requests a response in JSON format.
   * @param {string} prompt - The prompt to send to the API.
   * @returns {Promise<Object>} The API response.
   * @private
   */
  async _callApi(prompt) {
    const url = `${this.baseUrl}/responses`;

    const payload = {
      model: this.model,
      input: [{
        role: 'user',
        content: prompt
      }],
      reasoning: { effort: 'none' },
      text: {
        format: {
          type: 'json_object'
        }
      }
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true // Prevent throwing exceptions on non-200 responses
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      Logger.log(`OpenAI API request failed with status: ${responseCode}, response: ${responseBody}`);
      throw new Error(`OpenAI API request failed with status: ${responseCode}`);
    }

    return JSON.parse(responseBody);
  }

  /**
   * Parses the JSON content from an OpenAI API response.
   * @param {Object} apiResponse - The full API response object.
   * @returns {Object|null} The parsed JSON data or null on failure.
   * @private
   */
  _parseJsonResponse(apiResponse) {
    if (!apiResponse || !apiResponse.output || apiResponse.output.length === 0) {
      Logger.log('No output found in OpenAI response');
      return null;
    }

    // The 'content' is an array, and the actual text is in the first element.
    const contentArray = apiResponse.output[0].content;
    if (!contentArray || contentArray.length === 0 || !contentArray[0].text) {
      Logger.log('No text found in OpenAI response content array');
      return null;
    }
    const messageContent = contentArray[0].text;

    if (!messageContent) {
      Logger.log('No message content found in OpenAI response choice');
      return null;
    }

    try {
      // Since we requested JSON format, the content should be a JSON string.
      return JSON.parse(messageContent);
    } catch (jsonError) {
      Logger.log(`Failed to parse JSON from OpenAI response: ${jsonError.message}`);
      Logger.log(`Response content: ${messageContent}`);
      return null;
    }
  }
}
