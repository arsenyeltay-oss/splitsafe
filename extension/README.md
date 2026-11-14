# SplitSafe browser extension (Chrome / Edge, Manifest V3)

Shows a SAFE / TIGHT / NO verdict on store checkout pages that offer Buy Now, Pay Later, before you click.

## How it works

1. **Sync (`src/sync.ts`)** runs only on the SplitSafe site. It copies your plans and cash flow from the site's localStorage into the extension's own `chrome.storage.local`. Nothing leaves your device.
2. **Detect (`lib/bnpl-detect.ts`)** reads the page's visible text and looks for explicit offers such as `4 interest-free payments of $60.00`, `6 monthly payments of $41.67`, or `$50/mo for 12 months`. It also finds the provider named nearby (Klarna, Afterpay, Affirm, PayPal, Zip or Sezzle). It's conservative: no explicit offer means no card.
3. **Decide (`lib/engine`)** runs the same deterministic engine as the web app (`checkAffordability`) on your synced data.
4. **Show (`src/content.ts`)** displays a small card in a closed shadow root (so the store's CSS can't break it). It updates when the page changes, and you can dismiss it.

There are no network requests, no analytics, and the page content is never sent anywhere. The only permission is `storage`.

## Install (unpacked)

Download the [prebuilt zip from the live site](https://splitsafe-phi.vercel.app/splitsafe-extension.zip), or build it yourself:

```bash
npm install
npm run build:extension   # → extension/dist and public/splitsafe-extension.zip
```

Then:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `extension/dist` (or the unzipped folder).
3. Open [the app](https://splitsafe-phi.vercel.app/app) once, and load sample data or enter your own, so the extension syncs it.
4. Visit any checkout page that shows "4 payments of $X". To try it locally, serve `extension/test-page.html` from a local web server (`python3 -m http.server`) and open it.

## Limitations

- It recognizes explicit "N payments of $X" text only. Offers rendered inside cross-origin iframes or images aren't visible to it.
- Monthly offers are checked at the payment amount shown (treated as 0% APR, since the shown payment already includes interest).
- It isn't published on the Chrome Web Store yet.
