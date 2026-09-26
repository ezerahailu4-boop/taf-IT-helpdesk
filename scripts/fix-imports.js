const fs = require('fs');
const path = require('path');

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith('.ts')) {
      let content = fs.readFileSync(full, 'utf8');
      if (content.includes('errorResponse')) {
        content = content.replace(/import\s*\{\s*errorResponse\s*\}\s*from\s*["'][^"']+["'];?/g, 'import { errorResponse } from "@/lib/apiError";');
        fs.writeFileSync(full, content, 'utf8');
        console.log('Fixed:', full);
      }
    }
  }
}

walk('./app/api');
console.log('Done fixing imports.');
