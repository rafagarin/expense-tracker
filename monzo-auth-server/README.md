# Monzo OAuth Authentication Server

This simple Python server helps you obtain Monzo access tokens for your Google Apps Script expense tracker project.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Create your Monzo client:**
   - Go to [Monzo Developer Tools](https://developers.monzo.com/)
   - Create a new client application
   - Set the redirect URI to: `http://localhost:8080/callback`
   - Note down your `client_id` and `client_secret`

## Usage

1. **Start the server:**
   ```bash
   python3 server.py
   ```

2. **Open your browser:**
   - Go to `http://localhost:8080`
   - Enter your Monzo Client ID and Client Secret in the form
   - Click "Continue to Authorization"

3. **Complete the OAuth flow:**
   - Click the authorization link
   - Log in to Monzo and authorize the application
   - You'll receive a push notification in your Monzo app for Strong Customer Authentication
   - After approval, you'll be redirected back to the server

4. **Get your Apps Script properties:**
   - The server will display your access token, refresh token, client ID, and client secret
   - Copy these values to your Google Apps Script project:
     - Go to your Apps Script project → Project Settings → Script Properties
     - Add each property with its corresponding value

## Features

- **Web form input** for Monzo client credentials (no .env file needed)
- **Automatic URL generation** with proper OAuth parameters
- **Secure state token** generation to prevent CSRF attacks
- **Session management** to maintain credentials during OAuth flow
- **Apps Script format** output for easy copy-paste into your project
- **Error handling** for failed authorizations

## Security Notes

- The server generates a random state token for each session
- State tokens are validated on callback to prevent CSRF attacks
- Client credentials are stored in browser session (not persisted)
- Access tokens expire after ~6 hours
- Refresh tokens are only available for confidential clients

## Troubleshooting

- **"Session expired"**: Just refresh the page and start over
- **"Invalid state token"**: This is normal security validation - restart the server
- **Authorization errors**: Check that your redirect URI in Monzo dashboard exactly matches `http://localhost:8080/callback`
- **No refresh token**: This is normal for non-confidential clients - you'll need to re-authenticate when the access token expires
