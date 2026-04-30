var fs = require("fs");
var h = fs.readFileSync("index.html", "utf8");

h = h.replace(
  "if (currentType === 'land')      data = data.filter(d => d.property_type === 'Land');",
  "if (currentType === 'land')      data = data.filter(d => (d.property_type||'').toLowerCase().includes('land') || (d.property_type||'').toLowerCase().includes('lot'));"
);

fs.writeFileSync("index.html", h, "utf8");
console.log("done:", h.includes("includes('land')"));
