const fs = require('fs');
let h = fs.readFileSync('C:/panicselling-nj/index.html', 'utf8');
const idx = h.indexOf('data-address');
console.log('data-address found:', idx > -1);
const idx2 = h.indexOf('openListing');
console.log('openListing found:', idx2 > -1);
console.log(h.substring(idx2, idx2+150));