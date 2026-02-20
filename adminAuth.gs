/**************************************
 * Admin OAuth (no external libraries)
 **************************************/

function adminGetLoginState() {
  const store = PropertiesService.getUserProperties();
  const accessToken = store.getProperty('ADMIN_ACCESS_TOKEN');
  const expiresAt = Number(store.getProperty('ADMIN_TOKEN_EXPIRES_AT') || 0);

  // token still valid?
  if (accessToken && Date.now() < expiresAt - 60 * 1000) {
    // valid session, return context
    const email = store.getProperty('ADMIN_EMAIL') || '';
    if (email) {
      const adminUser = getAdminUserByEmail_(email);
      if (adminUser && adminUser.active) return { authenticated: true, email };
    }
    // if something is off, force re-auth
    adminOAuthLogout_();
  }

  return { authenticated: false, authUrl: adminGetAuthUrl_() };
}

function adminGetAuthUrl_() {
  const clientId = getRequiredScriptProp_('ADMIN_OAUTH_CLIENT_ID');
  const redirectUri = ScriptApp.getService().getUrl(); // your /exec URL
  const state = Utilities.getUuid();

  // store state to protect against CSRF
  PropertiesService.getUserProperties().setProperty('ADMIN_OAUTH_STATE', state);

  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: state
  };

  return 'https://accounts.google.com/o/oauth2/v2/auth?' + toQuery_(params);
}

function adminHandleOAuthCallback_(e) {
  const code = e.parameter.code;
  const state = e.parameter.state || '';

  const store = PropertiesService.getUserProperties();
  const expectedState = store.getProperty('ADMIN_OAUTH_STATE');

  if (!expectedState || state !== expectedState) {
    throw new Error('OAuth state mismatch. Please retry login.');
  }

  const token = adminExchangeCodeForToken_(code);

  // token contains id_token; use tokeninfo to get email
  const email = adminEmailFromIdToken_(token.id_token);
  const adminUser = getAdminUserByEmail_(email);

  if (!adminUser || !adminUser.active) {
    // Do NOT keep tokens if not authorized
    adminOAuthLogout_();
    throw new Error('Your Google account is not active in ADMIN_USERS.');
  }

  // store session
  store.setProperty('ADMIN_EMAIL', email);
  store.setProperty('ADMIN_ACCESS_TOKEN', token.access_token || '');
  store.setProperty('ADMIN_REFRESH_TOKEN', token.refresh_token || store.getProperty('ADMIN_REFRESH_TOKEN') || '');
  store.setProperty('ADMIN_TOKEN_EXPIRES_AT', String(Date.now() + (Number(token.expires_in || 3600) * 1000)));

  return email;
}

function adminExchangeCodeForToken_(code) {
  const clientId = getRequiredScriptProp_('ADMIN_OAUTH_CLIENT_ID');
  const clientSecret = getRequiredScriptProp_('ADMIN_OAUTH_CLIENT_SECRET');
  const redirectUri = ScriptApp.getService().getUrl();

  const payload = {
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  };

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Token exchange failed: ' + resp.getContentText());
  }

  return JSON.parse(resp.getContentText());
}

function adminEmailFromIdToken_(idToken) {
  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Unable to validate id_token: ' + resp.getContentText());
  }

  const data = JSON.parse(resp.getContentText());
  if (!data.email) throw new Error('No email in id_token.');
  return String(data.email).toLowerCase().trim();
}

function adminOAuthLogout_() {
  const store = PropertiesService.getUserProperties();
  [
    'ADMIN_EMAIL',
    'ADMIN_ACCESS_TOKEN',
    'ADMIN_REFRESH_TOKEN',
    'ADMIN_TOKEN_EXPIRES_AT',
    'ADMIN_OAUTH_STATE'
  ].forEach(k => store.deleteProperty(k));
  return { ok: true };
}

function getRequiredScriptProp_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Missing Script Property: ' + key);
  return v;
}

function toQuery_(obj) {
  return Object.keys(obj)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])))
    .join('&');
}
