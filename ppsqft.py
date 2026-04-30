f=open('index.html','r',encoding='utf8') 
h=f.read();f.close() 
old="const customTags = (d.tags || []).map(t => '<span class=\"tag\">'+t+'</span>').join('');" 
new1="const customTags = (d.tags || []).map(t => '<span class=\"tag\">'+t+'</span>').join('');" 
new2="let ppsqftBadge='';" 
new3="if(d.ppsqft&&d.ppsqft>0){let rc='ppsqft-gray',rl='$'+d.ppsqft+'/sf';if(d.town_avg_ppsqft&&d.town_avg_ppsqft>0){const pct=((d.ppsqft-d.town_avg_ppsqft)/d.town_avg_ppsqft)*100;if(pct<=-10){rc='ppsqft-green';rl='$'+d.ppsqft+'/sf below avg';}else if(pct>=10){rc='ppsqft-red';rl='$'+d.ppsqft+'/sf above avg';}else{rc='ppsqft-amber';rl='$'+d.ppsqft+'/sf ~avg';}}ppsqftBadge='<span class=\"ppsqft-badge '+rc+'\">'+rl+'</span>';}" 
h=h.replace(old,new1+'\n    '+new2+'\n    '+new3) 
old2="+ newTag + hotTag + domTag + customTags + '</div>'" 
new4="+ newTag + hotTag + domTag + customTags + (ppsqftBadge?' '+ppsqftBadge:'') + '</div>'" 
h=h.replace(old2,new4) 
f=open('index.html','w',encoding='utf8') 
f.write(h);f.close() 
print('done ppsqft:','ppsqftBadge' in h) 
