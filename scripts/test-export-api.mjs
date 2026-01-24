#!/usr/bin/env node
/**
 * Test script for the export API endpoint.
 * 
 * Prerequisites:
 *   1. Pocketbase running on :8090
 *   2. Vite dev server running on :5173
 *   3. A user with an API key in the database
 *   4. At least one session in the database
 * 
 * Usage:
 *   API_KEY=os_your_key node scripts/test-export-api.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('ERROR: API_KEY environment variable is required');
  console.error('Usage: API_KEY=os_xxx node scripts/test-export-api.mjs');
  process.exit(1);
}

async function testExport(name, url, expectedContentType) {
  console.log(`\n📋 Testing: ${name}`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
    });
    
    console.log(`   Status: ${response.status}`);
    const contentType = response.headers.get('content-type');
    const contentDisposition = response.headers.get('content-disposition');
    console.log(`   Content-Type: ${contentType}`);
    console.log(`   Content-Disposition: ${contentDisposition}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ Error: ${errorText}`);
      return { success: false, error: errorText };
    }
    
    // Validate content type
    if (!contentType?.includes(expectedContentType)) {
      console.log(`   ❌ Expected content-type to contain: ${expectedContentType}`);
      return { success: false };
    }
    
    // Validate content disposition (should have filename)
    if (!contentDisposition?.includes('attachment') || !contentDisposition?.includes('filename=')) {
      console.log(`   ❌ Missing or invalid Content-Disposition header`);
      return { success: false };
    }
    
    // Get the content
    const content = await response.text();
    console.log(`   📊 Content length: ${content.length} bytes`);
    
    // Show preview
    const preview = content.substring(0, 200);
    console.log(`   📝 Preview: ${preview}${content.length > 200 ? '...' : ''}`);
    
    console.log(`   ✅ Export successful`);
    return { success: true, content };
  } catch (e) {
    console.log(`   ❌ Fetch error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

async function main() {
  console.log('🧪 Testing Export API Endpoint');
  console.log('===============================');
  
  const results = [];
  
  // First, get a session ID to use for testing
  console.log('\n📋 Fetching available sessions...');
  let sessionId = null;
  let secondSessionId = null;
  
  try {
    const sessionsResponse = await fetch(`${BASE_URL}/api/sessions?limit=5`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (sessionsResponse.ok) {
      const sessionsData = await sessionsResponse.json();
      if (sessionsData.sessions?.length > 0) {
        sessionId = sessionsData.sessions[0].id;
        console.log(`   ✅ Found ${sessionsData.sessions.length} sessions`);
        console.log(`   📊 Using session: ${sessionId}`);
        if (sessionsData.sessions.length > 1) {
          secondSessionId = sessionsData.sessions[1].id;
        }
      } else {
        console.log('   ⚠️ No sessions found - some tests will be skipped');
      }
    } else {
      console.log(`   ❌ Failed to fetch sessions: ${sessionsResponse.status}`);
    }
  } catch (e) {
    console.log(`   ❌ Error fetching sessions: ${e.message}`);
  }
  
  // Test 1: Export single session as JSON
  if (sessionId) {
    const jsonResult = await testExport(
      'GET /api/export (single session, JSON)',
      `${BASE_URL}/api/export?id=${sessionId}&format=json`,
      'application/json'
    );
    results.push({ name: 'Single Session JSON', ...jsonResult });
  } else {
    results.push({ name: 'Single Session JSON', success: null, reason: 'No sessions available' });
  }
  
  // Test 2: Export single session as CSV
  if (sessionId) {
    const csvResult = await testExport(
      'GET /api/export (single session, CSV)',
      `${BASE_URL}/api/export?id=${sessionId}&format=csv`,
      'text/csv'
    );
    results.push({ name: 'Single Session CSV', ...csvResult });
  } else {
    results.push({ name: 'Single Session CSV', success: null, reason: 'No sessions available' });
  }
  
  // Test 3: Export single session as Markdown
  if (sessionId) {
    const mdResult = await testExport(
      'GET /api/export (single session, Markdown)',
      `${BASE_URL}/api/export?id=${sessionId}&format=markdown`,
      'text/markdown'
    );
    results.push({ name: 'Single Session Markdown', ...mdResult });
  } else {
    results.push({ name: 'Single Session Markdown', success: null, reason: 'No sessions available' });
  }
  
  // Test 4: Export multiple sessions as JSON
  if (sessionId && secondSessionId) {
    const multiJsonResult = await testExport(
      'GET /api/export (multiple sessions, JSON)',
      `${BASE_URL}/api/export?id=${sessionId},${secondSessionId}&format=json`,
      'application/json'
    );
    results.push({ name: 'Multiple Sessions JSON', ...multiJsonResult });
  } else {
    results.push({ name: 'Multiple Sessions JSON', success: null, reason: 'Need at least 2 sessions' });
  }
  
  // Test 5: Export with default format (should be JSON)
  if (sessionId) {
    const defaultResult = await testExport(
      'GET /api/export (default format)',
      `${BASE_URL}/api/export?id=${sessionId}`,
      'application/json'
    );
    results.push({ name: 'Default Format', ...defaultResult });
  } else {
    results.push({ name: 'Default Format', success: null, reason: 'No sessions available' });
  }
  
  // Test 6: Invalid session ID (should return 404)
  console.log('\n📋 Testing: GET /api/export (invalid session ID)');
  console.log('   URL: /api/export?id=invalid_id_12345&format=json');
  try {
    const badResponse = await fetch(`${BASE_URL}/api/export?id=invalid_id_12345&format=json`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    console.log(`   Status: ${badResponse.status}`);
    if (badResponse.status === 404) {
      console.log(`   ✅ Correctly returned 404`);
      results.push({ name: 'Invalid Session 404', success: true });
    } else {
      console.log(`   ❌ Expected 404, got ${badResponse.status}`);
      results.push({ name: 'Invalid Session 404', success: false });
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    results.push({ name: 'Invalid Session 404', success: false });
  }
  
  // Test 7: Missing ID (should return 400)
  console.log('\n📋 Testing: GET /api/export (missing id)');
  console.log('   URL: /api/export?format=json');
  try {
    const badResponse = await fetch(`${BASE_URL}/api/export?format=json`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    console.log(`   Status: ${badResponse.status}`);
    const badData = await badResponse.json();
    if (badResponse.status === 400 && badData.error) {
      console.log(`   ✅ Correctly returned 400: ${badData.error}`);
      results.push({ name: 'Missing ID 400', success: true });
    } else {
      console.log(`   ❌ Expected 400, got ${badResponse.status}`);
      results.push({ name: 'Missing ID 400', success: false });
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    results.push({ name: 'Missing ID 400', success: false });
  }
  
  // Test 8: Invalid format (should return 400)
  if (sessionId) {
    console.log('\n📋 Testing: GET /api/export (invalid format)');
    console.log(`   URL: /api/export?id=${sessionId}&format=pdf`);
    try {
      const badResponse = await fetch(`${BASE_URL}/api/export?id=${sessionId}&format=pdf`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` },
      });
      console.log(`   Status: ${badResponse.status}`);
      const badData = await badResponse.json();
      if (badResponse.status === 400 && badData.error) {
        console.log(`   ✅ Correctly returned 400: ${badData.error}`);
        results.push({ name: 'Invalid Format 400', success: true });
      } else {
        console.log(`   ❌ Expected 400, got ${badResponse.status}`);
        results.push({ name: 'Invalid Format 400', success: false });
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
      results.push({ name: 'Invalid Format 400', success: false });
    }
  } else {
    results.push({ name: 'Invalid Format 400', success: null, reason: 'No sessions available' });
  }
  
  // Test 9: No auth (should return 401)
  console.log('\n📋 Testing: GET /api/export (no auth)');
  console.log(`   URL: /api/export?id=${sessionId || 'test'}&format=json`);
  try {
    const noAuthResponse = await fetch(`${BASE_URL}/api/export?id=${sessionId || 'test'}&format=json`);
    console.log(`   Status: ${noAuthResponse.status}`);
    if (noAuthResponse.status === 401) {
      console.log(`   ✅ Correctly returned 401`);
      results.push({ name: 'No Auth 401', success: true });
    } else {
      console.log(`   ❌ Expected 401, got ${noAuthResponse.status}`);
      results.push({ name: 'No Auth 401', success: false });
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    results.push({ name: 'No Auth 401', success: false });
  }
  
  // Summary
  console.log('\n===============================');
  console.log('📊 Test Summary');
  console.log('===============================');
  
  const passed = results.filter(r => r.success === true).length;
  const failed = results.filter(r => r.success === false).length;
  const skipped = results.filter(r => r.success === null).length;
  
  for (const r of results) {
    const icon = r.success === true ? '✅' : r.success === false ? '❌' : '⏭️';
    console.log(`${icon} ${r.name}${r.reason ? ` (${r.reason})` : ''}`);
  }
  
  console.log(`\nTotal: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
