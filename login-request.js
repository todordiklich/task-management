// Login Request Example
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api/v1';

async function loginRequest() {
  try {
    // Step 1: Login request
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'demo@example.com',
        password: 'Demo123!@#'
      })
    });

    if (!loginResponse.ok) {
      const errorData = await loginResponse.text();
      return;
    }

    const loginData = await loginResponse.json();

    // Step 2: Use the access token for authenticated requests
    const meResponse = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${loginData.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (meResponse.ok) {
      const userData = await meResponse.json();
    } else {
    }

    // Step 3: Example of making a protected user update request
    const updateResponse = await fetch(`${BASE_URL}/users/${loginData.user.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${loginData.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Updated Name'
      })
    });

    if (updateResponse.ok) {
      const updatedUser = await updateResponse.json();
    } else {
      const errorData = await updateResponse.text();
    }

  } catch (error) {
  }
}

// Alternative login request formats for different contexts

// Basic Login Request (JavaScript/fetch):
fetch(`${BASE_URL}/auth/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'your-email@example.com',
    password: 'your-password'
  })
})
.then(response => response.json())
.then(data => {
  const { accessToken, refreshToken, user } = data;
  // Use tokens for subsequent requests
});

// Error Handling:
try {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (response.ok) {
    const data = await response.json();
    // Handle successful login
  } else if (response.status === 401) {
    // Invalid credentials
  } else if (response.status === 400) {
    // Validation error
    const error = await response.json();
  } else {
    // Other errors
  }
} catch (error) {
}

// Run the login example
loginRequest();
