f=open('index.html','r',encoding='utf8') 
h=f.read();f.close() 
i=h.find('function openListing') 
depth=0;j=i 
    if h[j]=='{':depth+=1 
    elif h[j]=='}':depth-=1 
    if depth==0 and j=1;break 
    j+=1 
old=h[i:j] 
new="function openListing(url,mls,address){var q=(address&&address.length>5)?address+' NJ Zillow':mls+' NJ';window.open('https://www.google.com/search?q='+encodeURIComponent(q),'_blank');}" 
h=h.replace(old,new) 
f=open('index.html','w',encoding='utf8');f.write(h);f.close() 
print('done google:','google' in h) 
