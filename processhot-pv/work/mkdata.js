const fs = require('fs'), path = require('path'); const cap = path.join(__dirname, '..', 'cap'); const d = {};
for (const n of fs.readdirSync(cap)) d[n] = JSON.parse(fs.readFileSync(path.join(cap, n, 'states.json')));
fs.writeFileSync(path.join(__dirname, 'data.js'), 'window.DATA=' + JSON.stringify(d) + ';');
