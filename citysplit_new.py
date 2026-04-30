import re
h = open('poller.js', 'r', encoding='utf8').read()
new = open('citysplit_new.js', 'r', encoding='utf8').read()
result = re.sub(r'async function fetchAllActiveListings\(\) \{.*?\n\}', new, h, flags=re.DOTALL)
open('poller.js', 'w', encoding='utf8').write(result)
print('done:', 'citiesWithData' in result)