#!/usr/bin/env python3
"""
Monzo OAuth Authentication Server

This server helps you obtain Monzo access tokens by:
1. Providing a web form to input Monzo client credentials
2. Generating the Monzo authorization URL
3. Handling the OAuth callback to exchange authorization code for access token
"""

import secrets
import requests
from flask import Flask, request, jsonify, session

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)  # Required for sessions

# Configuration
REDIRECT_URI = 'http://localhost:8080/callback'

# Generate a random state token for security
STATE_TOKEN = secrets.token_urlsafe(32)

def generate_auth_url(client_id):
    """Generate the Monzo authorization URL"""
    auth_url = (
        f"https://auth.monzo.com/?"
        f"client_id={client_id}&"
        f"redirect_uri={REDIRECT_URI}&"
        f"response_type=code&"
        f"state={STATE_TOKEN}"
    )
    return auth_url

@app.route('/')
def home():
    """Home page with client credentials form"""
    return """
    <h1>Monzo OAuth Authentication Server</h1>
    
    <h2>Instructions:</h2>
    
    <ol>
        <li>Go to <a href="https://developers.monzo.com/apps" target="_blank">https://developers.monzo.com/apps</a>. You might need to create your developer account and/or approve this action from the Monzo mobile app.</li>
        <li>Press "New OAuth Client".</li>
        <li>Enter the following values:
            <ul>
                <li><strong>Name:</strong> Apps Script Expense Tracker</li>
                <li><strong>Logo URL:</strong> (leave empty)</li>
                <li><strong>Redirect Urls:</strong> http://localhost:8080/callback</li>
                <li><strong>Description:</strong> Expense tracking spreadsheet on Google Sheets</li>
                <li><strong>Confidentiality:</strong> Confidential</li>
            </ul>
        </li>
        <li>Press "Submit"</li>
        <li>Copy the Client Id and Client Secret and paste them here:</li>
    </ol>
    
    <form method="POST" action="/authorize">
        <div style="margin-bottom: 15px;">
            <label for="client_id"><strong>Client ID:</strong></label><br>
            <input type="text" id="client_id" name="client_id" required 
                   style="width: 400px; padding: 8px; margin-top: 5px;" 
                   placeholder="Enter your Monzo Client ID">
        </div>
        
        <div style="margin-bottom: 15px;">
            <label for="client_secret"><strong>Client Secret:</strong></label><br>
            <input type="password" id="client_secret" name="client_secret" required 
                   style="width: 400px; padding: 8px; margin-top: 5px;" 
                   placeholder="Enter your Monzo Client Secret">
        </div>

        <p style="margin-top: 20px;"><strong>6.</strong> Then click the following button to approve this app on Monzo:</p>
        
        <button type="submit" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Authorize with Monzo
        </button>
    </form>    
    """

@app.route('/authorize', methods=['POST'])
def authorize():
    """Handle client credentials form submission and redirect to Monzo"""
    client_id = request.form.get('client_id')
    client_secret = request.form.get('client_secret')
    
    if not client_id or not client_secret:
        return "<h1>Error</h1><p>Both Client ID and Client Secret are required</p>", 400
    
    # Store credentials in session
    session['client_id'] = client_id
    session['client_secret'] = client_secret
    
    # Generate authorization URL and redirect directly to Monzo
    auth_url = generate_auth_url(client_id)
    return f"""
    <script>
        window.location.href = "{auth_url}";
    </script>
    <h1>Redirecting to Monzo...</h1>
    <p>If you are not redirected automatically, <a href="{auth_url}">click here</a>.</p>
    """

@app.route('/callback')
def callback():
    """Handle the OAuth callback from Monzo"""
    # Get credentials from session
    client_id = session.get('client_id')
    client_secret = session.get('client_secret')
    
    if not client_id or not client_secret:
        return "<h1>Error</h1><p>Session expired. Please start over from the home page.</p>", 400
    
    # Get the authorization code from the callback
    code = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')
    
    # Check for errors
    if error:
        return f"<h1>Authorization Error</h1><p>Error: {error}</p>", 400
    
    # Verify state token
    if state != STATE_TOKEN:
        return "<h1>Security Error</h1><p>Invalid state token</p>", 400
    
    if not code:
        return "<h1>Error</h1><p>No authorization code received</p>", 400
    
    # Exchange authorization code for access token
    try:
        token_response = requests.post(
            'https://api.monzo.com/oauth2/token',
            data={
                'grant_type': 'authorization_code',
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': REDIRECT_URI,
                'code': code
            }
        )
        
        if token_response.status_code == 200:
            token_data = token_response.json()
            
            # Display the tokens in Apps Script property format
            return f"""
            <h1>🎉 A couple more things</h1>

            <ol>
              <li>Go to your Monzo mobile app and press Approve</li>
              <li>In your spreadsheet, go to Extensions → Apps Script → Project Settings → Script Properties and add the following:</li>
            </ol>

            <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 5px; padding: 20px; margin: 20px 0;">
                <h3>🔑 Script Properties:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 10px; font-weight: bold; width: 200px;">MONZO_ACCESS_TOKEN</td>
                        <td style="padding: 10px; font-family: monospace; word-break: break-all;">{token_data.get('access_token')}</td>
                        <td style="padding: 10px;">
                            <button onclick="copyToClipboard('access_token')" style="padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">Copy</button>
                        </td>
                    </tr>
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 10px; font-weight: bold;">MONZO_REFRESH_TOKEN</td>
                        <td style="padding: 10px; font-family: monospace; word-break: break-all;">{token_data.get('refresh_token', 'No refresh token (non-confidential client)')}</td>
                        <td style="padding: 10px;">
                            <button onclick="copyToClipboard('refresh_token')" style="padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">Copy</button>
                        </td>
                    </tr>
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 10px; font-weight: bold;">MONZO_CLIENT_ID</td>
                        <td style="padding: 10px; font-family: monospace;">{client_id}</td>
                        <td style="padding: 10px;">
                            <button onclick="copyToClipboard('client_id')" style="padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">Copy</button>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold;">MONZO_CLIENT_SECRET</td>
                        <td style="padding: 10px; font-family: monospace;">{client_secret}</td>
                        <td style="padding: 10px;">
                            <button onclick="copyToClipboard('client_secret')" style="padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">Copy</button>
                        </td>
                    </tr>
                </table>
            </div>
            
            <script>
                function copyToClipboard(type) {{
                    let text = '';
                    switch(type) {{
                        case 'access_token':
                            text = '{token_data.get('access_token')}';
                            break;
                        case 'refresh_token':
                            text = '{token_data.get('refresh_token', '')}';
                            break;
                        case 'client_id':
                            text = '{client_id}';
                            break;
                        case 'client_secret':
                            text = '{client_secret}';
                            break;
                    }}
                    
                    navigator.clipboard.writeText(text).then(function() {{
                        // Show feedback
                        const button = event.target;
                        const originalText = button.textContent;
                        button.textContent = 'Copied!';
                        button.style.background = '#6c757d';
                        setTimeout(function() {{
                            button.textContent = originalText;
                            button.style.background = '#28a745';
                        }}, 2000);
                    }}).catch(function(err) {{
                        console.error('Could not copy text: ', err);
                        alert('Failed to copy to clipboard');
                    }});
                }}
            </script>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="/" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
                    Start Over
                </a>
            </div>
            """
        else:
            error_detail = token_response.text
            return f"<h1>Token Exchange Failed</h1><p>Status: {token_response.status_code}</p><p>Error: {error_detail}</p>", 400
            
    except requests.RequestException as e:
        return f"<h1>Request Error</h1><p>Error: {str(e)}</p>", 500

@app.route('/api/token')
def api_token():
    """API endpoint to get token info (for programmatic access)"""
    client_id = session.get('client_id')
    if not client_id:
        return jsonify({'error': 'No client credentials in session'}), 400
    
    return jsonify({
        'auth_url': generate_auth_url(client_id),
        'redirect_uri': REDIRECT_URI,
        'state_token': STATE_TOKEN
    })

if __name__ == '__main__':
    print("=" * 60)
    print("Monzo OAuth Authentication Server")
    print("=" * 60)
    print(f"Redirect URI: {REDIRECT_URI}")
    print(f"State Token: {STATE_TOKEN}")
    print()
    print("Server starting on http://localhost:8080")
    print("Open http://localhost:8080 in your browser to start the OAuth flow")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=8080, debug=True)
