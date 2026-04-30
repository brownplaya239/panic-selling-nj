const fs = require('fs');
const html = fs.readFileSync('C:/panicselling-nj/index.html', 'utf8');
const fixed = html
  .replace(/\u00e2\u0080\u0099/g, "'")
  .replace(/\u00e2\u0080\u00b2/g, "'")
  .replace(/[\u0080-\u00ff]/g, "'");
fs.writeFileSync('C:/panicselling-nj/index.html', fixed, 'utf8');
console.log('Fixed! Chars replaced.');
```

4. **Ctrl+S** to save
5. In the VS Code terminal run:
```
node write-html.js