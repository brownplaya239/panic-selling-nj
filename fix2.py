f=open('index.html','r',encoding='utf8')
h=f.read()
f.close()
i=h.find('onclick="openListing')
print('found at:',i)
print(repr(h[i:i+150]))
```
