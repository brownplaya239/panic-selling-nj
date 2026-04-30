f=open('index.html','r',encoding='utf8') 
h=f.read();f.close() 
old="function openListing(url, mls, address) {\n  const q = encodeURIComponent((address||mls||'')+' NJ');\n  window.open('https://www.zillow.com/homes/'+q+'_rb/','_blank');\n}" 
new="function openListing(url, mls, address) {\n  const q = encodeURIComponent((address||mls||'') + ' NJ real estate');\n  window.open('https://www.google.com/search?q=' + q, '_blank');\n}" 
h=h.replace(old,new) 
f=open('index.html','w',encoding='utf8') 
f.write(h);f.close() 
print('done google:', 'google.com' in h) 
