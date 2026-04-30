$url = "https://raw.githubusercontent.com/anthropics/panicselling/main/poller.js"
```

Actually let me try the most reliable approach. In Command Prompt run:
```
curl -o C:\panicselling-nj\poller.js https://pastebin.com/raw/test
```

That won't work either without a hosted URL.

**Real solution — let me just check what's actually in your file right now:**
```
type C:\panicselling-nj\poller.js | findstr "safeNum"