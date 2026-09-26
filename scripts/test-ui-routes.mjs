// test-ui-routes.mjs
// Verifies all frontend Mini App pages return 200 OK

const BASE_URL = 'http://localhost:3000';

const pages = [
  '/',
  '/home',
  '/tickets',
  '/create',
  '/tech',
  '/help',
  '/profile',
  '/search',
  '/admin',
  '/admin/reports',
  '/admin/audit',
  '/admin/users',
  '/admin/departments',
  '/admin/support-groups',
  '/admin/automation-rules',
  '/admin/sla-policies',
  '/admin/assets',
  '/admin/settings'
];

async function verifyPages() {
  console.log('🌐 Testing all UI page routes...');
  let failed = 0;

  for (const page of pages) {
    try {
      const res = await fetch(`${BASE_URL}${page}`, {
        headers: { 'x-demo-role': 'admin' }
      });
      if (res.ok) {
        console.log(`✅ ${page.padEnd(25)} -> HTTP ${res.status}`);
      } else {
        console.error(`❌ ${page.padEnd(25)} -> HTTP ${res.status}`);
        failed++;
      }
    } catch (err) {
      console.error(`❌ ${page.padEnd(25)} -> ${err.message}`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n❌ ${failed} pages failed.`);
    process.exit(1);
  } else {
    console.log(`\n🎉 All ${pages.length} UI routes rendered successfully with HTTP 200!`);
  }
}

verifyPages();
