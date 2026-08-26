const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('page.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('C:/Users/joao lucas/Desktop/SIAFI/frontend/src/app/(dashboard)');

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  let newC = c
    .replace(/className="(space-y-\d+) max-w-[0-9a-z]+"/g, 'className="$1 w-full"')
    .replace(/className="max-w-[0-9a-z]+ mx-auto (space-y-\d+)"/g, 'className="w-full mx-auto $1"')
    .replace(/className="mx-auto max-w-[0-9a-z]+ (space-y-\d+ px-\d+ py-\d+)"/g, 'className="mx-auto w-full $1"');
  
  if (c !== newC) {
    fs.writeFileSync(f, newC);
    console.log('Updated ' + f);
  }
});
