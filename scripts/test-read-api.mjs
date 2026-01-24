#!/usr/bin/env node
/**
 * Test script for the read API endpoints.
 * 
 * Prerequisites:
 *   1. Pocketbase running on :8090
 *   2. Vite dev server running on :5173
 *   3. A user with an API key in the database
 * 
 * Usage:
 *   API_KEY=os_your_key node scripts/test-read-api.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('ERROR: API_KEY environment variable is required');
  console.error('Usage: API_KEY=os_xxx node scripts/test-read-api.mjs');
  process.exit(1);
}

async function testEndpoint(name, url, expectedShape) {
  console.log(`\n📋 Testing: ${name}`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`   ❌ Error: ${JSON.stringify(data)}`);
      return { success: false, data };
    }
    
    // Validate expected shape
    let valid = true;
    for (const key of expectedShape) {
      if (!(key in data)) {
        console.log(`   ❌ Missing key: ${key}`);
        valid = false;
      }
    }
    
    if (valid) {
      console.log(`   ✅ Response keys: ${Object.keys(data).join(', ')}`);
      
      // Show sample data
      if (data.sessions?.length > 0) {
        console.log(`   📊 Found ${data.sessions.length} sessions`);
        console.log(`      First session: ${data.sessions[0].title || data.sessions[0].externalId}`);
      }
      if (data.results?.length > 0) {
        console.log(`   📊 Found ${data.results.length} results`);
      }
      if (data.session) {
        console.log(`   📊 Session: ${data.session.title || data.session.externalId}`);
        console.log(`      Messages: ${data.messages?.length || 0}`);
      }
      if ('sessionCount' in data) {
        console.log(`   📊 Stats: ${data.sessionCount} sessions, ${data.messageCount} messages, ${data.totalTokens} tokens`);
      }
    }
    
    return { success: valid, data };
  } catch (e) {
    console.log(`   ❌ Fetch error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

async function main() {
  console.log('🧪 Testing Read API Endpoints');
  console.log('==============================');
  
  const results = [];
  
  // Test 1: GET /api/sessions
  const sessionsResult = await testEndpoint(
    'GET /api/sessions',
    `${BASE_URL}/api/sessions?limit=5`,
    ['sessions']
  );
  results.push({ name: 'GET /api/sessions', ...sessionsResult });
  
  // Test 2: GET /api/sessions/get (need a session ID)
  let sessionId = null;
  if (sessionsResult.success && sessionsResult.data.sessions?.length > 0) {
    sessionId = sessionsResult.data.sessions[0].id;
    const getResult = await testEndpoint(
      'GET /api/sessions/get',
      `${BASE_URL}/api/sessions/get?id=${sessionId}`,
      ['session', 'messages']
    );
    results.push({ name: 'GET /api/sessions/get', ...getResult });
  } else {
    console.log('\n📋 Skipping GET /api/sessions/get - no sessions found');
    results.push({ name: 'GET /api/sessions/get', success: null, reason: 'No sessions available' });
  }
  
  // Test 3: GET /api/search
  const searchResult = await testEndpoint(
    'GET /api/search',
    `${BASE_URL}/api/search?q=test&limit=5&type=fulltext`,
    ['results']
  );
  results.push({ name: 'GET /api/search', ...searchResult });
  
  // Test 4: GET /api/stats
  const statsResult = await testEndpoint(
    'GET /api/stats',
    `${BASE_URL}/api/stats`,
    ['sessionCount', 'messageCount', 'totalTokens', 'totalCost', 'modelUsage']
  );
  results.push({ name: 'GET /api/stats', ...statsResult });
  
  // Test 5: GET /api/sessions/get with missing ID (should return 400)
  console.log('\n📋 Testing: GET /api/sessions/get (missing id)');
  console.log('   URL: /api/sessions/get (no id param)');
  try {
    const badResponse = await fetch(`${BASE_URL}/api/sessions/get`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    const badData = await badResponse.json();
    if (badResponse.status === 400 && badData.error) {
      console.log(`   ✅ Correctly returned 400: ${badData.error}`);
      results.push({ name: 'GET /api/sessions/get (400)', success: true });
    } else {
      console.log(`   ❌ Expected 400, got ${badResponse.status}`);
      results.push({ name: 'GET /api/sessions/get (400)', success: false });
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    results.push({ name: 'GET /api/sessions/get (400)', success: false });
  }
  
  // Test 6: GET /api/search with missing q (should return 400)
  console.log('\n📋 Testing: GET /api/search (missing q)');
  console.log('   URL: /api/search (no q param)');
  try {
    const badResponse = await fetch(`${BASE_URL}/api/search`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    const badData = await badResponse.json();
    if (badResponse.status === 400 && badData.error) {
      console.log(`   ✅ Correctly returned 400: ${badData.error}`);
      results.push({ name: 'GET /api/search (400)', success: true });
    } else {
      console.log(`   ❌ Expected 400, got ${badResponse.status}`);
      results.push({ name: 'GET /api/search (400)', success: false });
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    results.push({ name: 'GET /api/search (400)', success: false });
  }
  
  // Summary
  console.log('\n==============================');
  console.log('📊 Test Summary');
  console.log('==============================');
  
  const passed = results.filter(r => r.success === true).length;
  const failed = results.filter(r => r.success === false).length;
  const skipped = results.filter(r => r.success === null).length;
  
  for (const r of results) {
    const icon = r.success === true ? '✅' : r.success === false ? '❌' : '⏭️';
    console.log(`${icon} ${r.name}`);
  }
  
  console.log(`\nTotal: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
